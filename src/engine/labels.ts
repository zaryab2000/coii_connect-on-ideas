import type { Topic } from "@/data/types";

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
