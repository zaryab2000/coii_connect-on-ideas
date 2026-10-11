import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Turns the painted Mumbai plates (docs/brand/mumbai-backdrop/*.webp, painted on a lilac sky) into what the map
// draws. The map lays them on the venue floor with a multiply blend, like ink on paper, so each plate is divided
// by its own sky colour: the sky turns pure white and vanishes on the floor (its grid still shows through), and
// everything painted keeps its colour. The sea fades to white over its lower half and at both ends, so nothing
// ends on a hard edge, and the two painted parts (the harbour along the bottom, the sun and clouds up top) are
// cut out and packed into one small opaque WebP per layout, with their frames in a JSON file.
//
//   node scripts/backdrop-plates.mjs   (uses the Playwright Chromium the e2e tests already need)
//
// Output: src/assets/backdrop/mumbai-{landscape,portrait}.webp and src/assets/backdrop/mumbai.json
import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_DIR = `${ROOT}docs/brand/mumbai-backdrop/`;
const OUT_DIR = `${ROOT}src/assets/backdrop/`;

const PLATES = {
  landscape: "mumbai-harbour-desktop.webp",
  portrait: "mumbai-harbour-mobile.webp",
};
const QUALITY = 0.86;

// ---- Runs in the page (Chromium decodes and encodes the WebP); these constants go with it. -------------------

/** The sky's own grain (how much darker than the sky a pixel is, 0–1) that still counts as sky: pure white. */
const GRAIN = 0.02;
/**
 * Tone curve on how much darker than the sky a pixel is. The painting's far skyline stands out against a mist
 * that is lighter than its sky, which a multiply blend can't draw, so faint paint gets up to TONE_GAIN x darker
 * while the darkest paint (the Gateway, the sea, near TONE_PIVOT) stays put. Every channel of a pixel is scaled
 * by the same factor, so hues hold.
 */
const TONE_GAIN = 3.7;
const TONE_PIVOT = 0.3;
/** Darkness (0–255) that counts as paint when finding the painted parts, and the empty rows that separate them. */
const INK = 6;
const GAP = 12;

/** k for the tone curve f(d) = pivot * (1 - e^(-k d)) / (1 - e^(-k pivot)), whose slope at 0 is TONE_GAIN. */
function toneK() {
  let lo = 0.01;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    if ((k * TONE_PIVOT) / (1 - Math.exp(-k * TONE_PIVOT)) < TONE_GAIN) lo = k;
    else hi = k;
  }
  return (lo + hi) / 2;
}
const TONE_K = toneK();

function smooth(t) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** The sky: the median colour of the empty middle of the plate. */
function skyColour(data, width, height) {
  const sample = [[], [], []];
  for (let y = Math.floor(height * 0.35); y < height * 0.5; y += 2)
    for (let x = Math.floor(width * 0.4); x < width * 0.6; x += 2)
      for (let c = 0; c < 3; c++) sample[c].push(data[(y * width + x) * 4 + c]);
  return sample.map((v) => v.toSorted((a, b) => a - b)[v.length >> 1]);
}

/** How much to scale a pixel's darkness (per channel, 0–1) by: the tone curve over its darkest channel. */
function toneGain(dark) {
  const most = Math.max(...dark);
  if (most <= GRAIN) return 0;
  const toned =
    (TONE_PIVOT * (1 - Math.exp(-TONE_K * (most - GRAIN)))) / (1 - Math.exp(-TONE_K * TONE_PIVOT));
  return toned / most;
}

/** Divides by the sky: multiplied onto the floor, a pixel comes out as floor x pixel / sky, its painted colour. */
function divideBySky(data, rawSky) {
  // A sky channel of 0 (a pure-colour sky) would divide by zero; 1 keeps the maths finite.
  const sky = rawSky.map((c) => Math.max(1, c));
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const dark = [0, 1, 2].map((c) => Math.max(0, 1 - data[i + c] / sky[c]));
    const gain = toneGain(dark);
    for (let c = 0; c < 3; c++) out[i + c] = 255 * Math.max(0, 1 - dark[c] * gain);
    out[i + 3] = 255;
  }
  return out;
}

function inkAt(out, i) {
  return 255 - Math.min(out[i], out[i + 1], out[i + 2]);
}

function rowInk(out, width, y) {
  let most = 0;
  for (let x = 0; x < width; x++) most = Math.max(most, inkAt(out, (y * width + x) * 4));
  return most;
}

/** The first row of the harbour: up from the bottom until GAP empty rows. */
function findBandTop(out, width, height) {
  let y = height - 1;
  for (let gap = 0; y > 0 && gap < GAP; y--) gap = rowInk(out, width, y) < INK ? gap + 1 : 0;
  // The loop steps past the last of the GAP empty rows, so the harbour starts GAP + 1 below.
  return y + GAP + 1;
}

function rowInkRight(out, width, y) {
  for (let x = width - 1; x > 0; x--) if (inkAt(out, (y * width + x) * 4) >= INK) return x;
  return 0;
}

/** The sun and its clouds: the first painted rows from the top, down to GAP empty rows. */
function findSun(out, width, bandTop) {
  let top = 0;
  while (top < bandTop && rowInk(out, width, top) < INK) top++;
  let bottom = top;
  for (let gap = 0; bottom < bandTop && gap < GAP; bottom++)
    gap = rowInk(out, width, bottom) < INK ? gap + 1 : 0;
  bottom -= GAP;
  let right = 0;
  for (let y = top; y < bottom; y++) right = Math.max(right, rowInkRight(out, width, y));
  const y = Math.max(0, top - 8);
  return { x: 0, y, w: Math.min(width, right + 16), h: Math.min(bandTop, bottom + 8) - y };
}

/** Share of a row that is sea (greener than it is red), on the original plate. */
function seaShare(data, width, y) {
  let sea = 0;
  let seen = 0;
  for (let x = 0; x < width; x += 4, seen++) {
    const i = (y * width + x) * 4;
    if (data[i + 1] - data[i] > 12) sea++;
  }
  return sea / seen;
}

/** The waterline: the first row of the harbour where the sea takes over. */
function findWaterline(data, width, height, bandTop) {
  for (let y = bandTop; y < height; y++) if (seaShare(data, width, y) > 0.6) return y;
  return bandTop;
}

function whiten(out, i, keep) {
  for (let c = 0; c < 3; c++) out[i + c] = 255 - (255 - out[i + c]) * keep;
}

/** How far the sea carries on past each end of the painting (a share of its width), fading out as it goes. */
const SEA_PAD = 0.15;

/**
 * The harbour, cut out with room either side: the sea (from the waterline down) carries on past both ends of
 * the painting, mirrored, so when you zoom out it can fade away slowly instead of stopping at the frame.
 */
function padBand(out, { width, height, bandTop, waterline, pad }) {
  const w = width + 2 * pad;
  const h = height - bandTop;
  const band = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    const sy = y + bandTop;
    for (let x = 0; x < w; x++) {
      const px = x - pad;
      const sx = Math.min(Math.abs(px + 0.5) - 0.5, 2 * width - px - 1);
      if (sx !== px && sy < waterline) continue;
      const s = (sy * width + sx) * 4;
      const d = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) band[d + c] = out[s + c];
    }
  }
  return { buf: band, w, h };
}

/** How much of the harbour to keep at column x: the sea fades across its padding, the rest at the ends. */
function bandKeep(x, w, pad, sea) {
  if (sea) return smooth(x / pad) * smooth((w - 1 - x) / pad);
  const edge = (w - 2 * pad) * 0.025;
  return smooth((x - pad) / edge) * smooth((w - pad - 1 - x) / edge);
}

/** Fades the harbour to white: the sea over its lower half and out across its padding, the skyline at its ends. */
function fadeBand({ buf, w, h }, pad, waterline) {
  const fadeFrom = waterline + (h - waterline) * 0.45;
  for (let y = 0; y < h; y++) {
    const row = y > fadeFrom ? smooth((h - 1 - y) / (h - 1 - fadeFrom)) : 1;
    for (let x = 0; x < w; x++)
      whiten(buf, (y * w + x) * 4, row * bandKeep(x, w, pad, y >= waterline));
  }
}

/** The sun and its clouds, cut out; the clouds run off the plate's left edge, so that side fades out. */
function cutSun(out, width, sun) {
  const buf = new Uint8ClampedArray(sun.w * sun.h * 4);
  for (let y = 0; y < sun.h; y++)
    for (let x = 0; x < sun.w; x++) {
      const s = ((y + sun.y) * width + x + sun.x) * 4;
      const d = (y * sun.w + x) * 4;
      for (let c = 0; c < 4; c++) buf[d + c] = out[s + c];
      whiten(buf, d, smooth(x / (sun.w * 0.18)) * smooth((sun.w - 1 - x) / (sun.w * 0.04)));
    }
  return { buf, w: sun.w, h: sun.h };
}

function processPlate({ data, width, height }) {
  const sky = skyColour(data, width, height);
  const out = divideBySky(data, sky);
  const bandTop = findBandTop(out, width, height);
  const waterline = findWaterline(data, width, height, bandTop);
  const pad = Math.round(width * SEA_PAD);
  const band = padBand(out, { width, height, bandTop, waterline, pad });
  fadeBand(band, pad, waterline - bandTop);
  const sun = cutSun(out, width, findSun(out, width, bandTop));
  return { sky, band: { ...band, pad, waterline: waterline - bandTop }, sun };
}

/** Decodes a plate, processes it and packs the harbour (top) and the sun (under it) into a white WebP. */
async function packInPage({ dataUrl, quality }) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const { width, height } = img;
  const full = new OffscreenCanvas(width, height);
  const fx = full.getContext("2d");
  fx.drawImage(img, 0, 0);
  const data = fx.getImageData(0, 0, width, height).data;
  const { sky, band, sun } = window.processPlate({ data, width, height });
  const atlas = { w: Math.max(band.w, sun.w), h: band.h + 2 + sun.h };
  const c = document.createElement("canvas");
  c.width = atlas.w;
  c.height = atlas.h;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, atlas.w, atlas.h);
  x.putImageData(new ImageData(band.buf, band.w, band.h), 0, 0);
  x.putImageData(new ImageData(sun.buf, sun.w, sun.h), 0, band.h + 2);
  const webp = c.toDataURL("image/webp", quality).split(",")[1];
  return {
    webp,
    sky,
    band: { w: band.w, h: band.h, pad: band.pad, waterline: band.waterline },
    sun: { w: sun.w, h: sun.h },
    atlas,
  };
}

// ---- Node side --------------------------------------------------------------------------------------------------

const IN_PAGE = [
  smooth,
  skyColour,
  toneGain,
  divideBySky,
  inkAt,
  rowInk,
  findBandTop,
  rowInkRight,
  findSun,
  seaShare,
  findWaterline,
  whiten,
  padBand,
  bandKeep,
  fadeBand,
  cutSun,
  processPlate,
];

async function pack(browser, mode, file) {
  const page = await browser.newPage();
  await page.addScriptTag({
    content: [
      `const GRAIN = ${GRAIN}, TONE_PIVOT = ${TONE_PIVOT}, TONE_K = ${TONE_K}, INK = ${INK}, GAP = ${GAP}, SEA_PAD = ${SEA_PAD};`,
      ...IN_PAGE.map(String),
      "window.processPlate = processPlate;",
    ].join("\n"),
  });
  const dataUrl = `data:image/webp;base64,${readFileSync(SOURCE_DIR + file).toString("base64")}`;
  const r = await page.evaluate(packInPage, { dataUrl, quality: QUALITY });
  const bytes = Buffer.from(r.webp, "base64");
  writeFileSync(`${OUT_DIR}mumbai-${mode}.webp`, bytes);
  const frames = {
    width: r.atlas.w,
    height: r.atlas.h,
    // In the atlas. The band's waterline is where the skyline meets the sea, from the band's top; `pad` is the
    // sea that carries on past each end of the painting.
    band: { x: 0, y: 0, w: r.band.w, h: r.band.h, pad: r.band.pad, waterline: r.band.waterline },
    sun: { x: 0, y: r.band.h + 2, w: r.sun.w, h: r.sun.h },
  };
  const size = `${r.atlas.w}x${r.atlas.h}, ${Math.round(bytes.length / 1024)} KB`;
  console.log(`${mode}: sky ${r.sky.join(",")}, ${size}`);
  return [mode, frames];
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const frames = Object.fromEntries(
  await Promise.all(Object.entries(PLATES).map(([mode, file]) => pack(browser, mode, file))),
);
writeFileSync(`${OUT_DIR}mumbai.json`, `${JSON.stringify(frames, null, 2)}\n`);
await browser.close();
