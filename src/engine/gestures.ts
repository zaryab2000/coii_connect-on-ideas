import type { Camera } from "@/engine/camera";

/** What the gesture layer asks of the engine. Coordinates are CSS pixels relative to the canvas. */
export interface GestureTarget {
  readonly camera: Camera;
  hitBean(sx: number, sy: number, touch: boolean): number;
  hitBooth(sx: number, sy: number): number;
  tapBean(index: number): void;
  tapBooth(topic: number): void;
  tapEmpty(sx: number, sy: number): void;
  hold(index: number): void;
  unhold(index: number): void;
  grab(index: number): void;
  drag(index: number, sx: number, sy: number): void;
  release(index: number, vx: number, vy: number): void;
  interacted(): void;
}

const LONG_PRESS_MS = 300;
const MOUSE_DRAG_PX = 6;
const TOUCH_SLOP_PX = 9;
const TAP_MAX_MS = 350;
const VELOCITY_WINDOW_MS = 100;

type Mode = "idle" | "pressing" | "panning" | "pinching" | "grabbing";

interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * One recogniser for everything that happens on the map, so a long-press grab, a pan and a pinch
 * never fight each other. Uses DOM pointer events; Pixi's own event system is switched off.
 */
export class Gestures {
  private mode: Mode = "idle";
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private primary = -1;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private lastX = 0;
  private lastY = 0;
  private bean = -1;
  private touch = false;
  private longPress: number | undefined;
  private pinchDist = 0;
  private pinchMidX = 0;
  private pinchMidY = 0;
  private samples: Sample[] = [];
  private gestureScale = 1;

  constructor(
    private readonly el: HTMLElement,
    private readonly target: GestureTarget,
  ) {
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", this.prevent);
    el.addEventListener("gesturestart", this.onGestureStart as EventListener);
    el.addEventListener("gesturechange", this.onGestureChange as EventListener);
    el.addEventListener("gestureend", this.prevent);
  }

  destroy(): void {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointercancel", this.onCancel);
    this.el.removeEventListener("wheel", this.onWheel);
    this.el.removeEventListener("contextmenu", this.prevent);
    this.el.removeEventListener("gesturestart", this.onGestureStart as EventListener);
    this.el.removeEventListener("gesturechange", this.onGestureChange as EventListener);
    this.el.removeEventListener("gestureend", this.prevent);
    this.clearLongPress();
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly prevent = (e: Event): void => e.preventDefault();

  private readonly onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.target.interacted();
    if (this.pointers.size === 1) {
      this.beginPress(e, p);
    } else if (this.pointers.size === 2 && this.mode !== "grabbing") {
      this.beginPinch();
    }
  };

  private beginPress(e: PointerEvent, p: { x: number; y: number }): void {
    this.mode = "pressing";
    this.primary = e.pointerId;
    this.touch = e.pointerType !== "mouse";
    this.startX = this.lastX = p.x;
    this.startY = this.lastY = p.y;
    this.startT = performance.now();
    this.samples = [{ t: this.startT, x: p.x, y: p.y }];
    this.target.camera.stop();
    this.bean = this.target.hitBean(p.x, p.y, this.touch);
    if (this.bean >= 0 && this.touch) {
      this.target.hold(this.bean);
      this.longPress = window.setTimeout(() => this.startGrab(), LONG_PRESS_MS);
    }
  }

  private beginPinch(): void {
    this.clearLongPress();
    this.releaseHeld();
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.mode = "pinching";
    this.pinchDist = Math.hypot(b.x - a.x, b.y - a.y);
    this.pinchMidX = (a.x + b.x) / 2;
    this.pinchMidY = (a.y + b.y) / 2;
  }

  private startGrab(): void {
    this.longPress = undefined;
    if (this.mode !== "pressing" || this.bean < 0) return;
    this.mode = "grabbing";
    this.target.grab(this.bean);
    this.target.drag(this.bean, this.lastX, this.lastY);
    if ("vibrate" in navigator) navigator.vibrate(12);
  }

  private readonly onMove = (e: PointerEvent): void => {
    const known = this.pointers.get(e.pointerId);
    if (!known) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.mode === "pinching") {
      this.movePinch();
      return;
    }
    if (e.pointerId !== this.primary) return;
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    this.lastX = p.x;
    this.lastY = p.y;
    this.record(p.x, p.y);
    if (this.mode === "pressing") this.resolvePress(p.x, p.y);
    if (this.mode === "panning") this.target.camera.panBy(dx, dy);
    if (this.mode === "grabbing") this.target.drag(this.bean, p.x, p.y);
  };

  private resolvePress(x: number, y: number): void {
    const moved = Math.hypot(x - this.startX, y - this.startY);
    if (!this.touch && this.bean >= 0 && moved > MOUSE_DRAG_PX) {
      this.mode = "grabbing";
      this.target.grab(this.bean);
      this.target.drag(this.bean, x, y);
      return;
    }
    if (moved > (this.touch ? TOUCH_SLOP_PX : MOUSE_DRAG_PX)) {
      this.clearLongPress();
      this.releaseHeld();
      this.mode = "panning";
    }
  }

  private movePinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const camera = this.target.camera;
    camera.panBy(midX - this.pinchMidX, midY - this.pinchMidY);
    if (this.pinchDist > 0) camera.zoomAt(midX, midY, dist / this.pinchDist);
    this.pinchDist = dist;
    this.pinchMidX = midX;
    this.pinchMidY = midY;
  }

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.mode === "pinching") {
      this.endPinch();
      return;
    }
    if (e.pointerId !== this.primary) return;
    this.clearLongPress();
    this.record(p.x, p.y);
    const elapsed = performance.now() - this.startT;
    if (this.mode === "pressing" && elapsed < TAP_MAX_MS + (this.touch ? 0 : 400)) {
      this.releaseHeld();
      this.tap(p.x, p.y);
    } else if (this.mode === "pressing") {
      this.releaseHeld();
    } else if (this.mode === "panning") {
      const v = this.velocity();
      this.target.camera.vx = v.x;
      this.target.camera.vy = v.y;
    } else if (this.mode === "grabbing") {
      const v = this.velocity();
      this.target.release(this.bean, v.x, v.y);
    }
    this.reset();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.clearLongPress();
    if (this.mode === "grabbing") this.target.release(this.bean, 0, 0);
    else this.releaseHeld();
    if (this.pointers.size === 0) this.reset();
  };

  private endPinch(): void {
    const [remaining] = [...this.pointers.entries()];
    if (!remaining) {
      this.reset();
      return;
    }
    // Re-anchor so the map does not jump when going from two fingers to one.
    const [id, p] = remaining;
    this.mode = "panning";
    this.primary = id;
    this.lastX = p.x;
    this.lastY = p.y;
    this.samples = [{ t: performance.now(), x: p.x, y: p.y }];
  }

  private tap(x: number, y: number): void {
    if (this.bean >= 0) {
      this.target.tapBean(this.bean);
      return;
    }
    const booth = this.target.hitBooth(x, y);
    if (booth >= 0) this.target.tapBooth(booth);
    else this.target.tapEmpty(x, y);
  }

  private releaseHeld(): void {
    if (this.bean >= 0 && this.touch && this.mode !== "grabbing") this.target.unhold(this.bean);
  }

  private reset(): void {
    this.mode = "idle";
    this.primary = -1;
    this.bean = -1;
    this.samples = [];
  }

  private clearLongPress(): void {
    if (this.longPress !== undefined) {
      window.clearTimeout(this.longPress);
      this.longPress = undefined;
    }
  }

  private record(x: number, y: number): void {
    const t = performance.now();
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - (this.samples[0]?.t ?? t) > VELOCITY_WINDOW_MS)
      this.samples.shift();
  }

  /** Velocity over the last ~100ms in screen px/s, ignoring the near-zero final move iOS sends. */
  private velocity(): { x: number; y: number } {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t < 8) return { x: 0, y: 0 };
    const dt = (last.t - first.t) / 1000;
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.target.interacted();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const sensitivity = e.ctrlKey ? 0.012 : 0.0022;
    const factor = Math.exp(-e.deltaY * unit * sensitivity);
    this.target.camera.stop();
    this.target.camera.zoomAt(p.x, p.y, factor);
  };

  private readonly onGestureStart = (e: Event & { scale?: number }): void => {
    e.preventDefault();
    this.gestureScale = e.scale ?? 1;
  };

  private readonly onGestureChange = (
    e: Event & { scale?: number; clientX?: number; clientY?: number },
  ): void => {
    e.preventDefault();
    if (this.pointers.size > 0) return; // touch pinch is handled by pointer events
    const scale = e.scale ?? 1;
    const rect = this.el.getBoundingClientRect();
    const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top;
    this.target.camera.zoomAt(x, y, scale / this.gestureScale);
    this.gestureScale = scale;
  };
}
