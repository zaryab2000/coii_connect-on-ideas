/**
 * Who says their one-liner next, and for how long. Pure logic (no DOM, no PixiJS): the engine
 * feeds it candidate beans with screen positions and draws whatever it decides.
 *
 * The rules keep the map readable: only a few bubbles at once (fewer when zoomed out), never
 * overlapping, staggered so they don't appear and vanish together, and everyone takes turns.
 */

/** At or above this zoom the map is in "booth view": one-liners only, no emoji chatter. */
export const QUOTE_ZOOM = 0.45;
/** A person who just spoke waits this long (seconds) before they can speak again. */
export const QUOTE_COOLDOWN = 60;
/** Widest a bubble may grow, in CSS px. */
export const QUOTE_MAX_WIDTH = 240;

/** A bean that could speak now. `x`, `y` is the bubble's anchor (above the head) on screen. */
export interface QuoteSpot {
  readonly agent: number;
  readonly x: number;
  readonly y: number;
  /** Relative chance to be picked; higher for beans standing still. */
  readonly weight: number;
}

export interface QuoteBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface ActiveQuote {
  readonly agent: number;
  readonly line: string;
  readonly startedAt: number;
  readonly until: number;
  /** Where the bubble was when it started; the engine moves it with the bean afterwards. */
  box: QuoteBox;
}

/** How many one-liners may be up at once: one in the overview, two or three up close. */
export function quoteCap(zoom: number, viewW: number): number {
  if (zoom < QUOTE_ZOOM) return 1;
  return viewW < 700 ? 2 : 3;
}

/** Seconds a line stays up: enough to read it at a relaxed pace, between 4 and 8. */
export function readingTime(line: string): number {
  return Math.min(8, Math.max(4, 2.4 + line.length * 0.07));
}

const CHAR_PX = 7.6;
const ROW_PX = 20;
/** The name row, padding and tail add this much height to the text rows. */
const CHROME_PX = 44;

/** The screen box a bubble showing `line` covers when anchored at (x, y), bottom-centre. */
export function bubbleBox(x: number, y: number, line: string): QuoteBox {
  const textWidth = line.length * CHAR_PX;
  const width = Math.min(QUOTE_MAX_WIDTH, textWidth) + 28;
  const rows = Math.max(1, Math.ceil(textWidth / QUOTE_MAX_WIDTH));
  const height = CHROME_PX + rows * ROW_PX;
  return { x0: x - width / 2, y0: y - height, x1: x + width / 2, y1: y };
}

export function boxesOverlap(a: QuoteBox, b: QuoteBox, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

function pickWeighted<T extends { readonly weight: number }>(
  items: readonly T[],
  random: () => number,
): T | null {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1] ?? null;
}

/** Keeps the timeline of who is speaking. Times are in seconds on any monotonic clock. */
export class QuoteDirector {
  readonly active: ActiveQuote[] = [];
  private nextAt = 1.5;
  private readonly lastSpoke = new Map<number, number>();
  private readonly nextLine = new Map<number, number>();

  constructor(private readonly random: () => number) {}

  /** True when a new quote could start now (worth gathering candidates for). */
  wantsSpeaker(now: number, cap: number): boolean {
    return now >= this.nextAt && this.active.length < cap;
  }

  /** Removes finished quotes and returns them so their bubbles can fade out. */
  expire(now: number): ActiveQuote[] {
    const done = this.active.filter((q) => q.until <= now);
    for (const q of done) this.drop(q.agent);
    return done;
  }

  /** Ends a quote early (bean grabbed, selected, off-screen…). */
  end(agent: number): void {
    this.drop(agent);
  }

  /** Forgets a bean that left the venue. */
  forget(agent: number): void {
    this.drop(agent);
    this.lastSpoke.delete(agent);
    this.nextLine.delete(agent);
  }

  /** Ends the oldest quotes until at most `cap` remain (after zooming out); returns them. */
  trim(cap: number): ActiveQuote[] {
    const extra = this.active.slice(0, Math.max(0, this.active.length - cap));
    for (const q of extra) this.drop(q.agent);
    return extra;
  }

  /**
   * Starts one quote if it's time and there's room: a weighted pick among beans that aren't
   * speaking, aren't on cooldown and whose bubble wouldn't touch one already showing or any
   * `blocked` box (booth signs).
   */
  tryStart(
    now: number,
    cap: number,
    spots: readonly QuoteSpot[],
    linesOf: (agent: number) => readonly string[],
    blocked: readonly QuoteBox[] = [],
  ): ActiveQuote | null {
    if (!this.wantsSpeaker(now, cap)) return null;
    const speaking = new Set(this.active.map((q) => q.agent));
    const free = spots.filter((spot) => {
      const lines = linesOf(spot.agent);
      if (lines.length === 0 || speaking.has(spot.agent)) return false;
      const last = this.lastSpoke.get(spot.agent);
      if (last !== undefined && now - last < QUOTE_COOLDOWN) return false;
      const box = bubbleBox(spot.x, spot.y, this.lineFor(spot.agent, lines));
      const taken = [...this.active.map((q) => q.box), ...blocked];
      return taken.every((other) => !boxesOverlap(other, box, 14));
    });
    const spot = pickWeighted(free, this.random);
    if (!spot) {
      this.nextAt = now + 0.8;
      return null;
    }
    const lines = linesOf(spot.agent);
    const line = this.lineFor(spot.agent, lines);
    this.nextLine.set(spot.agent, ((this.nextLine.get(spot.agent) ?? 0) + 1) % lines.length);
    this.lastSpoke.set(spot.agent, now);
    this.nextAt = now + 1.6 + this.random() * 1.2;
    const quote: ActiveQuote = {
      agent: spot.agent,
      line,
      startedAt: now,
      until: now + readingTime(line),
      box: bubbleBox(spot.x, spot.y, line),
    };
    this.active.push(quote);
    return quote;
  }

  private lineFor(agent: number, lines: readonly string[]): string {
    return lines[(this.nextLine.get(agent) ?? 0) % lines.length] ?? "";
  }

  private drop(agent: number): void {
    const at = this.active.findIndex((q) => q.agent === agent);
    if (at >= 0) this.active.splice(at, 1);
  }
}
