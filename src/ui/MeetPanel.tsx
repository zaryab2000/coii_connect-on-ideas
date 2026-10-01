import { useApp } from "@/app/context";
import { PanelNav } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";

/** Meet tab: today's Adda 3, waves and chais. (Placeholder until the full panel lands.) */
export function MeetPanel({ chrome }: { readonly chrome: PanelChrome }) {
  const meet = useApp((s) => s.meet);
  return (
    <section className="panel" aria-label="Meet">
      <header className="panel__head" data-sheet-grab>
        <PanelNav chrome={chrome} />
        <h2>Your Adda 3</h2>
      </header>
      <div className="panel__scroll">
        <p>{meet ? `${meet.hand.length} picks today` : "Join to get your daily picks."}</p>
      </div>
    </section>
  );
}
