/**
 * 2D camera in CSS pixels: (x, y) is the world point at the screen centre. Pure math plus a
 * small tween and inertia integrator, so it can be unit-tested without a renderer.
 */
export const MAX_ZOOM = 2.2;

interface Tween {
  fromX: number;
  fromY: number;
  fromZoom: number;
  toX: number;
  toY: number;
  toZoom: number;
  elapsed: number;
  duration: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  worldW = 1;
  worldH = 1;
  minZoom = 0.1;
  fitZoom = 0.1;
  /** Inertia velocity in screen pixels per second. */
  vx = 0;
  vy = 0;
  private tween: Tween | null = null;

  setWorld(width: number, height: number): void {
    this.worldW = width;
    this.worldH = height;
    this.updateLimits();
  }

  setViewport(width: number, height: number): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);
    this.updateLimits();
  }

  private updateLimits(): void {
    this.fitZoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.96;
    this.minZoom = this.fitZoom * 0.9;
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom));
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  /** Visible world rectangle. */
  view(): { x0: number; y0: number; x1: number; y1: number; zoom: number } {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    return {
      x0: this.x - halfW,
      y0: this.y - halfH,
      x1: this.x + halfW,
      y1: this.y + halfH,
      zoom: this.zoom,
    };
  }

  panBy(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  clamp(): void {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    this.x =
      this.worldW <= halfW * 2
        ? this.worldW / 2
        : Math.min(this.worldW - halfW, Math.max(halfW, this.x));
    this.y =
      this.worldH <= halfH * 2
        ? this.worldH / 2
        : Math.min(this.worldH - halfH, Math.max(halfH, this.y));
  }

  flyTo(x: number, y: number, zoom: number, duration: number): void {
    const toZoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, zoom));
    this.vx = 0;
    this.vy = 0;
    if (duration <= 0) {
      this.tween = null;
      this.x = x;
      this.y = y;
      this.zoom = toZoom;
      this.clamp();
      return;
    }
    this.tween = {
      fromX: this.x,
      fromY: this.y,
      fromZoom: this.zoom,
      toX: x,
      toY: y,
      toZoom,
      elapsed: 0,
      duration,
    };
  }

  fit(duration: number): void {
    this.flyTo(this.worldW / 2, this.worldH / 2, this.fitZoom, duration);
  }

  get animating(): boolean {
    return this.tween !== null;
  }

  stop(): void {
    this.tween = null;
    this.vx = 0;
    this.vy = 0;
  }

  update(dt: number): void {
    const tween = this.tween;
    if (tween) {
      tween.elapsed += dt;
      const t = easeInOutCubic(Math.min(1, tween.elapsed / tween.duration));
      // Interpolate zoom in log space so it feels uniform.
      this.zoom = tween.fromZoom * (tween.toZoom / tween.fromZoom) ** t;
      this.x = tween.fromX + (tween.toX - tween.fromX) * t;
      this.y = tween.fromY + (tween.toY - tween.fromY) * t;
      this.clamp();
      if (tween.elapsed >= tween.duration) this.tween = null;
      return;
    }
    if (this.vx !== 0 || this.vy !== 0) {
      this.panBy(this.vx * dt, this.vy * dt);
      const decay = Math.exp(-dt / 0.325);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.hypot(this.vx, this.vy) < 8) {
        this.vx = 0;
        this.vy = 0;
      }
    }
  }
}
