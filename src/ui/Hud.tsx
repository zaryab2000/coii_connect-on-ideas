import "@/ui/hud.css";
import { useId } from "react";
import type { MouseEvent, Ref } from "react";

import { useActions, useApp } from "@/app/context";
import { TOPICS } from "@/data/topics";
import { Glyph, Icon } from "@/ui/Icon";
import { topicVars } from "@/ui/PanelChrome";

const numberFormat = new Intl.NumberFormat("en-IN");

function Wordmark() {
  return (
    <h1 className="wordmark">
      <span className="wordmark__gm">gm</span> adda
      <span className="wordmark__tag" lang="hi">
        अड्डा
      </span>
    </h1>
  );
}

function LivePill() {
  const count = useApp((s) => s.people.length);
  return (
    <p className="live-pill" aria-live="off">
      <span className="live-pill__dot" aria-hidden="true" />
      <strong className="live-pill__count">{numberFormat.format(count)}</strong> here
    </p>
  );
}

/** Places the explainer bubble under its chip just before the popover opens. */
function placePopover(e: MouseEvent<HTMLButtonElement>, popoverId: string): void {
  const pop = document.getElementById(popoverId);
  if (!pop) return;
  const rect = e.currentTarget.getBoundingClientRect();
  pop.style.top = `${Math.round(rect.bottom + 10)}px`;
  pop.style.left = `${Math.round(Math.max(12, rect.left))}px`;
}

function DemoChip() {
  const popoverId = useId();
  return (
    <>
      <button
        type="button"
        className="demo-chip"
        popoverTarget={popoverId}
        onClick={(e) => placePopover(e, popoverId)}
      >
        Demo crowd
        <Glyph name="info" size={16} />
      </button>
      <div id={popoverId} popover="auto" className="demo-pop">
        <p>
          <strong>Demo crowd.</strong> These names and handles are made up. Real people show up here
          once sign-ups open.
        </p>
      </div>
    </>
  );
}

function TopicHighlights() {
  const actions = useActions();
  const highlight = useApp((s) => s.highlight);
  return (
    <div className="hud-chips" role="group" aria-label="Highlight booths on the map">
      {highlight.length > 0 ? (
        <button type="button" className="chip chip--clear" onClick={() => actions.clearHighlight()}>
          <Glyph name="close" size={16} />
          Clear
        </button>
      ) : null}
      {TOPICS.map((topic) => (
        <button
          key={topic.id}
          type="button"
          className="chip"
          style={topicVars(topic.id)}
          aria-pressed={highlight.includes(topic.id)}
          onClick={() => actions.toggleHighlight(topic.id)}
        >
          <Icon id={topic.icon} size={20} />
          {topic.short}
        </button>
      ))}
    </div>
  );
}

/** Heads-up display over the map: wordmark, live count, fit button and topic highlights. */
export function Hud({ ref }: { readonly ref: Ref<HTMLDivElement> }) {
  const actions = useActions();
  return (
    <div className="hud" ref={ref}>
      <div className="hud__top">
        <Wordmark />
        <LivePill />
        <button
          type="button"
          className="icon-btn hud__fit"
          aria-label="Fit the whole venue"
          title="Fit the whole venue"
          onClick={() => actions.fit()}
        >
          <Glyph name="fit" size={22} />
        </button>
      </div>
      <div className="hud__chips-row">
        <DemoChip />
        <TopicHighlights />
      </div>
    </div>
  );
}
