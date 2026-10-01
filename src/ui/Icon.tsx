import { iconUrl } from "@/data/icons";
import type { IconId } from "@/data/types";

/** A bundled Fluent Emoji (flat) icon. Decorative unless given a label. */
export function Icon({
  id,
  size = 20,
  label,
  className,
}: {
  readonly id: IconId;
  readonly size?: number;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <img
      className={className ?? "icon"}
      src={iconUrl(id)}
      width={size}
      height={size}
      alt={label ?? ""}
      draggable={false}
      aria-hidden={label ? undefined : true}
    />
  );
}

export type GlyphName =
  | "close"
  | "back"
  | "fit"
  | "search"
  | "dice"
  | "check"
  | "pin"
  | "info"
  | "chevron";

const PATHS: Record<GlyphName, string> = {
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20",
  dice: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pin:
    "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" +
    "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5v.5",
  chevron: "M6 9l6 6 6-6",
};

const DICE_PIPS: readonly (readonly [number, number])[] = [
  [8.5, 8.5],
  [15.5, 8.5],
  [12, 12],
  [8.5, 15.5],
  [15.5, 15.5],
];

/** Small hand-inked UI glyphs (close, back, fit…) drawn with the ink outline weight. */
export function Glyph({ name, size = 22 }: { readonly name: GlyphName; readonly size?: number }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
      {name === "dice"
        ? DICE_PIPS.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} fill="currentColor" stroke="none" />
          ))
        : null}
    </svg>
  );
}
