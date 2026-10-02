import type { Topic } from "@/data/types";
import type { QuoteBox } from "@/engine/quotes";

/** Crisp DOM name tags that follow beans in screen space (selected person and you). */
export class LabelLayer {
  readonly el: HTMLDivElement;
  private readonly tags = new Map<string, HTMLDivElement>();

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "map-labels";
  }

  /** Shows or moves a tag; pass `null` for `screen` to hide it. */
  set(
    key: string,
    text: string,
    screen: { x: number; y: number } | null,
    variant: "you" | "selected",
  ): void {
    let tag = this.tags.get(key);
    if (!screen) {
      if (tag) tag.hidden = true;
      return;
    }
    if (!tag) {
      tag = document.createElement("div");
      tag.className = `map-tag map-tag--${variant}`;
      this.el.append(tag);
      this.tags.set(key, tag);
    }
    if (tag.textContent !== text) tag.textContent = text;
    tag.hidden = false;
    tag.style.transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }
}

/**
 * Booth name + live count as real buttons floating over each stall. They stay readable at any
 * zoom, are keyboard/screen-reader accessible, and open the booth panel.
 */
export class BoothLabels {
  readonly el: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly counts: HTMLSpanElement[] = [];
  private readonly last: string[] = [];
  private readonly halfWidths: number[] = [];

  constructor(
    topics: readonly Topic[],
    iconUrl: (topic: Topic) => string,
    onTap: (index: number) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "map-booth-labels";
    topics.forEach((topic, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booth-label";
      button.style.setProperty("--topic", topic.css);
      const icon = document.createElement("img");
      icon.src = iconUrl(topic);
      icon.alt = "";
      icon.width = 22;
      icon.height = 22;
      const name = document.createElement("span");
      name.className = "booth-label__name";
      name.textContent = topic.short;
      const count = document.createElement("span");
      count.className = "booth-label__count";
      count.textContent = "0";
      button.append(icon, name, count);
      button.addEventListener("click", () => onTap(index));
      this.el.append(button);
      this.buttons.push(button);
      this.counts.push(count);
      this.last.push("");
      this.setCount(index, 0, topic);
    });
  }

  setCount(index: number, count: number, topic: Topic): void {
    const el = this.counts[index];
    const button = this.buttons[index];
    if (!el || !button) return;
    el.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
    this.halfWidths[index] = 0;
    button.setAttribute(
      "aria-label",
      `${topic.label} booth, ${count} people interested. Open booth.`,
    );
  }

  /** Where the booth signs are on screen, relative to the map. */
  boxes(): QuoteBox[] {
    const origin = this.el.getBoundingClientRect();
    return this.buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return {
        x0: r.left - origin.left,
        y0: r.top - origin.top,
        x1: r.right - origin.left,
        y1: r.bottom - origin.top,
      };
    });
  }

  setDimmed(index: number, dimmed: boolean): void {
    this.buttons[index]?.classList.toggle("is-dimmed", dimmed);
  }

  /**
   * Places a label above its booth. Labels of booths that are partly off-screen are pulled back
   * inside the viewport so the name stays readable.
   */
  position(index: number, x: number, y: number, scale: number, viewW: number): void {
    const button = this.buttons[index];
    if (!button) return;
    let half = this.halfWidths[index];
    if (half === undefined || half === 0) {
      half = button.offsetWidth / 2;
      this.halfWidths[index] = half;
    }
    const margin = 8 + half * scale;
    if (viewW > margin * 2) x = Math.min(viewW - margin, Math.max(margin, x));
    const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    if (this.last[index] === transform) return;
    this.last[index] = transform;
    button.style.transform = transform;
  }
}

export interface QuoteContent {
  readonly name: string;
  readonly topic: Topic;
  readonly line: string;
}

const QUOTE_FADE_MS = 220;

/**
 * One-liner speech bubbles over beans, as DOM so the text stays crisp and readable at any zoom.
 * There are only ever a handful; tapping one opens that person's profile.
 */
export class QuoteBubbles {
  readonly el: HTMLDivElement;
  private readonly bubbles = new Map<number, { el: HTMLDivElement; half: number }>();

  constructor(private readonly onTap: (agent: number) => void) {
    this.el = document.createElement("div");
    this.el.className = "map-quotes";
    this.el.setAttribute("aria-hidden", "true");
  }

  show(agent: number, content: QuoteContent): void {
    this.hide(agent);
    const el = document.createElement("div");
    el.className = "quote";
    el.style.setProperty("--topic", content.topic.css);
    const card = document.createElement("div");
    card.className = "quote__card";
    const who = document.createElement("span");
    who.className = "quote__who";
    who.textContent = `${content.name} · ${content.topic.short}`;
    const line = document.createElement("span");
    line.className = "quote__line";
    line.textContent = content.line;
    card.append(who, line);
    el.append(card);
    el.addEventListener("click", () => this.onTap(agent));
    this.el.append(el);
    this.bubbles.set(agent, { el, half: 0 });
  }

  /**
   * Anchors a bubble's tail at (x, y). The bubble slides sideways to stay on screen while the
   * tail keeps pointing at the bean.
   */
  move(agent: number, x: number, y: number, viewW: number): void {
    const bubble = this.bubbles.get(agent);
    if (!bubble) return;
    if (bubble.half === 0) bubble.half = bubble.el.offsetWidth / 2;
    const margin = bubble.half + 8;
    const cx = viewW > margin * 2 ? Math.min(viewW - margin, Math.max(margin, x)) : x;
    bubble.el.style.transform = `translate3d(${cx.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    const reach = Math.max(0, bubble.half - 18);
    const tail = Math.min(reach, Math.max(-reach, x - cx));
    bubble.el.style.setProperty("--tail", `${tail.toFixed(1)}px`);
  }

  hide(agent: number): void {
    const bubble = this.bubbles.get(agent);
    if (!bubble) return;
    this.bubbles.delete(agent);
    bubble.el.classList.add("is-leaving");
    window.setTimeout(() => bubble.el.remove(), QUOTE_FADE_MS);
  }
}
