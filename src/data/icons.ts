import type { IconId } from "@/data/types";

const ICON_URLS = import.meta.glob<string>("/src/assets/icons/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
});

/** URL of a bundled Fluent Emoji (flat) icon. */
export function iconUrl(id: IconId): string {
  const url = ICON_URLS[`/src/assets/icons/${id}.svg`];
  if (!url) {
    throw new Error(`Icon "${id}" is missing. Add src/assets/icons/${id}.svg (Fluent Emoji Flat).`);
  }
  return url;
}
