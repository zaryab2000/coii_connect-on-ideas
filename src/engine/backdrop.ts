import { Container, ImageSource, Rectangle, Sprite, Texture } from "pixi.js";

import landscapeUrl from "@/assets/backdrop/mumbai-landscape.webp?url";
import portraitUrl from "@/assets/backdrop/mumbai-portrait.webp?url";
import plates from "@/assets/backdrop/mumbai.json";
import { backdropAlpha, backdropInWorld, backdropPieces } from "@/engine/backdropLayout";
import type {
  BackdropCamera,
  BackdropHome,
  BackdropPiece,
  BackdropScreen,
} from "@/engine/backdropLayout";
import type { LayoutMode } from "@/sim/layout";

const PLATE_URLS = { landscape: landscapeUrl, portrait: portraitUrl } as const;
/** Seconds to fade in once the plate has loaded. */
const FADE_IN = 0.8;

/**
 * Devcon 8's backdrop: Mumbai's harbour (the Gateway of India, the skyline, the Sea Link) and a hazy sun, as
 * scenery far behind the venue. It lies on the floor layer, under the walkways, booths and crowd, but keeps to
 * the screen: the venue slides over it when you pan and it barely changes size when you zoom, so it reads as
 * distance rather than a picture on the floor. One small image fetched after the map is up, drawn with a
 * multiply blend so its white sky vanishes into the floor, as ink on paper.
 */
export class Backdrop {
  /** Goes on the floor, right above the tiles. */
  readonly container = new Container({ label: "backdrop", alpha: 0 });
  private readonly sprites: Sprite[] = [];
  private pieces: BackdropPiece[] = [];
  private home: BackdropHome | null = null;
  private screen: BackdropScreen | null = null;
  private mode: LayoutMode | null = null;
  private shown = 0;

  /** Fetches the plate for this layout mode and composes it for the screen and default view. */
  async load(mode: LayoutMode, screen: BackdropScreen, home: BackdropHome): Promise<void> {
    this.screen ??= screen;
    this.home ??= home;
    const image = new Image();
    image.decoding = "async";
    image.src = PLATE_URLS[mode];
    await image.decode();
    // No mipmaps: the atlases aren't powers of two, which WebGL1 can't mipmap, and the backdrop stays near
    // its painted size on screen anyway (it barely scales with zoom).
    const source = new ImageSource({
      resource: image,
      autoGenerateMipmaps: false,
      scaleMode: "linear",
    });
    this.clear();
    const plate = plates[mode];
    for (const frame of [plate.band, plate.sun]) {
      const texture = new Texture({
        source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      });
      const sprite = new Sprite({ texture, blendMode: "multiply" });
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    this.mode = mode;
    this.place(this.screen, this.home);
  }

  /** Drops sprites from an earlier load, so sprites and pieces stay paired by index. */
  private clear(): void {
    const old = this.sprites.splice(0);
    const source = old[0]?.texture.source;
    for (const sprite of old) sprite.destroy({ texture: true });
    source?.destroy();
  }

  /** Recomposes for a new screen size or default view (the window changed). */
  place(screen: BackdropScreen, home: BackdropHome): void {
    this.screen = screen;
    this.home = home;
    if (this.mode) this.pieces = backdropPieces(plates[this.mode], screen);
  }

  /** Each frame: keeps the painting behind the venue for the camera now, fading in once and out up close. */
  update(dt: number, camera: BackdropCamera, reducedMotion: boolean): void {
    const { home, screen } = this;
    if (!home || !screen || this.pieces.length === 0) return;
    this.shown = reducedMotion ? 1 : Math.min(1, this.shown + dt / FADE_IN);
    const alpha = this.shown * backdropAlpha(camera.zoom, home.zoom);
    this.container.alpha = alpha;
    this.container.visible = alpha > 0.01;
    if (!this.container.visible) return;
    this.pieces.forEach((piece, i) => {
      const at = backdropInWorld(piece, camera, home, screen.h);
      this.sprites[i]?.position.set(at.x, at.y);
      this.sprites[i]?.scale.set(at.scale);
    });
  }
}
