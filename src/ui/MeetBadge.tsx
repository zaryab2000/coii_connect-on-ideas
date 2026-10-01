import { useApp } from "@/app/context";
import { meetBadge } from "@/ui/meet";
import type { MeetBadge } from "@/ui/meet";

/** "3" for cards still face down, or a dot for a chai you haven't seen. Decorative. */
export function BadgeMark({ badge }: { readonly badge: MeetBadge }) {
  if (!badge) return null;
  return (
    <span className="badge-mark" data-kind={badge.kind} aria-hidden="true">
      {badge.kind === "count" ? badge.count : null}
    </span>
  );
}

/** The Meet badge from app state; re-renders only when it changes. */
export function useMeetBadge(): MeetBadge {
  const kind = useApp((s) => meetBadge(s.meet)?.kind ?? null);
  const count = useApp((s) => {
    const badge = meetBadge(s.meet);
    return badge?.kind === "count" ? badge.count : 0;
  });
  if (kind === "count") return { kind, count };
  return kind === "dot" ? { kind } : null;
}
