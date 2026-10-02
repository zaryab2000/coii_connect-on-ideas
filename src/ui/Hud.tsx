import "@/ui/hud.css";
import { useId, useMemo } from "react";
import type { CSSProperties, MouseEvent, Ref } from "react";

import { useActions, useApp } from "@/app/context";
import { TOPICS } from "@/data/topics";
import { tribeOf } from "@/match/tribe";
import { Glyph, Icon } from "@/ui/Icon";
import { topicVars } from "@/ui/PanelChrome";

const numberFormat = new Intl.NumberFormat("en-IN");

function Wordmark() {
  return (
    <h1 className="wordmark">
      <span className="wordmark__name">
        <span className="wordmark__gm">gm</span> coii
      </span>
      <span className="wordmark__sub">connect on ideas & interests</span>
      <span className="wordmark__tag">Devcon 8</span>
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

const TRIBE_VARS = { "--topic": "var(--rani)", "--on-topic": "var(--paper)" } as CSSProperties;

/** "My tribe" map mode: everyone who shares your topics glows. Shown once you've joined. */
function TribeToggle() {
  const actions = useActions();
  const you = useApp((s) => s.you);
  const people = useApp((s) => s.people);
  const on = useApp((s) => s.tribe);
  const size = useMemo(() => (you ? tribeOf(you, people).length : 0), [you, people]);
  if (!you) return null;
  return (
    <button
      type="button"
      className="chip tribe-chip"
      style={TRIBE_VARS}
      aria-pressed={on}
      onClick={() => actions.toggleTribe()}
    >
      <Icon id="light_bulb" size={20} />
      My tribe
      <span className="tribe-chip__count">{numberFormat.format(size)}</span>
    </button>
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

/** Heads-up display over the map: wordmark, live count, About, fit button and topic highlights. */
export function Hud({ ref }: { readonly ref: Ref<HTMLDivElement> }) {
  const actions = useActions();
  return (
    <div className="hud" ref={ref}>
      <div className="hud__top">
        <Wordmark />
        <LivePill />
        <button
          type="button"
          className="icon-btn hud__about"
          aria-haspopup="dialog"
          onClick={() => actions.openOverlay("about")}
        >
          <Glyph name="info" size={22} />
          <span className="hud__about-label">About</span>
        </button>
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
        <TribeToggle />
        <TopicHighlights />
      </div>
    </div>
  );
}
