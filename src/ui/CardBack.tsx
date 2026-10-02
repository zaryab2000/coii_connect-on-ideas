import { Icon } from "@/ui/Icon";

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const DOTS = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);

/** An eight-petal rangoli flower, inked like the stickers around it. Decorative. */
export function RangoliMark({ size }: { readonly size: number }) {
  return (
    <svg
      className="rangoli-mark"
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <circle className="rangoli-mark__ring" r="45" />
      {DOTS.map((angle) => (
        <circle
          key={angle}
          className="rangoli-mark__dot"
          cx={Math.cos(angle) * 38}
          cy={Math.sin(angle) * 38}
          r="3.2"
        />
      ))}
      {PETALS.map((angle) => (
        <ellipse
          key={angle}
          className={angle % 90 === 0 ? "rangoli-mark__petal" : "rangoli-mark__petal--alt"}
          cx="0"
          cy="-19"
          rx="8.5"
          ry="14"
          transform={`rotate(${angle})`}
        />
      ))}
      <circle className="rangoli-mark__heart" r="10" />
      <circle className="rangoli-mark__seed" r="3.6" />
    </svg>
  );
}

/** The marigold back of a daily pick card, numbered in the corner like a playing card. */
export function CardFace({
  index,
  locked,
}: {
  readonly index: number | null;
  readonly locked: boolean;
}) {
  return (
    <span className="card-back" data-locked={locked || undefined}>
      {index === null ? null : (
        <span className="card-back__corner" aria-hidden="true">
          {index}
        </span>
      )}
      <RangoliMark size={78} />
      {locked ? (
        <span className="card-back__label card-back__label--lock">
          <Icon id="locked" size={20} />
        </span>
      ) : (
        <span className="card-back__label">Tap to reveal</span>
      )}
    </span>
  );
}
