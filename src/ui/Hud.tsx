import "@/ui/hud.css";
import { useId, useState } from "react";
import type { MouseEvent, Ref } from "react";

import { useActions, useApp } from "@/app/context";
import { IDEAS } from "@/app/ideas";
import { pointsReader } from "@/app/points";
import type { AppState } from "@/app/store";
import { DECIPHER, decipherUrl } from "@/content/decipher";
import { rankOf } from "@/match/points";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";

const numberFormat = new Intl.NumberFormat("en-IN");

/** The coii sticker, with the "by Decipher Club" credit on it (its website, utm_medium=hud). */
function Wordmark() {
  return (
    <div className="wordmark">
      <h1 className="wordmark__title">
        <span className="wordmark__name">coii</span>
        <span className="wordmark__sub">connect on ideas & interests</span>
        <span className="wordmark__tag">Devcon 8</span>
      </h1>
      <a
        className="wordmark__by"
        aria-label={`${DECIPHER.credit}${DECIPHER.creditEnd}`}
        href={decipherUrl("hud")}
        target="_blank"
        rel="noopener noreferrer"
      >
        {DECIPHER.credit}
        <span className="wordmark__by-end">{DECIPHER.creditEnd}</span>
      </a>
    </div>
  );
}

function LivePill() {
  const count = useApp((s) => s.people.length);
  return (
    <p className="live-pill" aria-live="off">
      <span className="live-pill__dot" aria-hidden="true" />
      <strong className="live-pill__count">{numberFormat.format(count)}</strong>
      <span className="live-pill__here"> here</span>
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

/** Labels made-up people: always in demo mode, and in backend mode while seed beans remain. */
function DemoChip() {
  const popoverId = useId();
  const shown = useApp((s) => s.mode === "demo" || s.people.some((p) => p.isDemo));
  if (!shown) return null;
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

/** What the board pill says: your rank and points, or who leads before you join. */
function boardSummary(state: AppState): { text: string; label: string } {
  const read = pointsReader(state);
  const you = state.you;
  if (you) {
    const rank = rankOf(state.people, read, you);
    const points = read(you);
    return {
      text: `#${rank} · ${points}`,
      label: `Wave points board. You're number ${rank} with ${points} points.`,
    };
  }
  let leader = state.people[0];
  for (const person of state.people) if (leader && read(person) > read(leader)) leader = person;
  const points = leader ? read(leader) : 0;
  if (!leader || points === 0) return { text: "Board", label: "Wave points board" };
  return {
    text: `${firstName(leader.name)} ${points}`,
    label: `Wave points board. ${leader.name} leads with ${points} points.`,
  };
}

/** Live wave-points standing; opens the full board. */
function BoardPill() {
  const actions = useActions();
  const text = useApp((s) => boardSummary(s).text);
  const label = useApp((s) => boardSummary(s).label);
  return (
    <button
      type="button"
      className="chip board-chip"
      aria-haspopup="dialog"
      aria-label={label}
      onClick={() => actions.openOverlay("board")}
    >
      <Icon id="trophy" size={20} />
      <span key={text} className="board-chip__text">
        {text}
      </span>
    </button>
  );
}

/** Opens the live narrative race without replacing its label with a topic name. */
function TrendingChip() {
  const actions = useActions();
  return (
    <button
      type="button"
      className="chip trend-chip"
      aria-haspopup="dialog"
      aria-label="Narrative race. Open the race."
      onClick={() => actions.openOverlay("trends")}
    >
      <Icon id="fire" size={20} />
      <span className="trend-chip__text">Narrative race</span>
    </button>
  );
}

/** Fewer people than this (besides you) and the venue reads as "just opening". */
const EARLY_MAX = 10;

/**
 * Backend mode on a near-empty venue (launch day, after the demo purge): a friendly note
 * instead of an empty-looking map, nudging people to join or bring friends.
 */
function EarlyVenue() {
  const actions = useActions();
  const you = useApp((s) => s.you);
  const early = useApp(
    (s) => s.mode === "backend" && s.people.filter((p) => !p.isYou).length < EARLY_MAX,
  );
  const [dismissed, setDismissed] = useState(false);
  if (!early || dismissed) return null;
  return (
    <div className="early-venue" role="status">
      <Icon id="circus_tent" size={28} />
      <p className="early-venue__text">
        <strong>The venue's just opening.</strong>{" "}
        {you ? "Invite a few friends so the booths fill up." : "Be one of the first beans here."}
      </p>
      <button
        type="button"
        className="btn btn--primary early-venue__go"
        onClick={() => (you ? actions.openOverlay("invite") : actions.startJoin(null))}
      >
        {you ? "Invite friends" : "Join coii"}
      </button>
      <button
        type="button"
        className="nav-btn nav-btn--close early-venue__close"
        aria-label="Hide this note"
        onClick={() => setDismissed(true)}
      >
        <Glyph name="close" size={16} />
      </button>
    </div>
  );
}

/** Heads-up display over the map: wordmark, live count, map controls and two primary actions. */
export function Hud({ ref }: { readonly ref: Ref<HTMLDivElement> }) {
  const actions = useActions();
  return (
    <div className="hud" ref={ref}>
      <div className="hud__top">
        <Wordmark />
        <LivePill />
        <button
          type="button"
          className="icon-btn hud__ideas"
          aria-haspopup="dialog"
          onClick={() => actions.openOverlay("ideas")}
        >
          <Icon id="light_bulb" size={20} />
          <span className="hud__ideas-label">{IDEAS.hud}</span>
        </button>
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
        <BoardPill />
        <TrendingChip />
        <DemoChip />
      </div>
      <EarlyVenue />
    </div>
  );
}
