import { CanvasSource, Rectangle, Texture } from "pixi.js";

import { iconUrl } from "@/data/icons";
import type { IconId } from "@/data/types";

export async function loadIconImages(
  ids: readonly IconId[],
): Promise<Map<IconId, HTMLImageElement>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const image = new Image();
      image.decoding = "async";
      image.src = iconUrl(id);
      await image.decode();
      return [id, image] as const;
    }),
  );
  return new Map(entries);
}

/** Rasterises icons into one canvas sheet at `px` pixels each, for signs that need to stay crisp. */
export async function loadIconTextures(
  ids: readonly IconId[],
  px: number,
): Promise<Map<IconId, Texture>> {
  const images = await loadIconImages(ids);
  const canvas = document.createElement("canvas");
  canvas.width = px * ids.length;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable, so booth icons cannot be drawn");
  const source = new CanvasSource({
    resource: canvas,
    autoGenerateMipmaps: true,
    scaleMode: "linear",
  });
  const textures = new Map<IconId, Texture>();
  ids.forEach((id, i) => {
    const image = images.get(id);
    if (image) ctx.drawImage(image, i * px, 0, px, px);
    textures.set(id, new Texture({ source, frame: new Rectangle(i * px, 0, px, px) }));
  });
  source.update();
  return textures;
}
