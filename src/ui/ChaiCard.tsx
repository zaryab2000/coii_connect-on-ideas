import "@/ui/chai.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject, SyntheticEvent } from "react";

import { useActions, useApp } from "@/app/context";
import type { Person } from "@/data/types";
import {
  openerText,
  suggestedSpot,
  suggestedTime,
  telegramLink,
  xProfileLink,
} from "@/match/opener";
import { reasonsFor } from "@/match/reasons";
import { scoreParts } from "@/match/score";
import type { ScoreContext } from "@/match/score";
import type { Chai } from "@/match/storage";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Confetti } from "@/ui/Confetti";
import { usePresence } from "@/ui/hooks";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";
import { useReducedMotion } from "@/ui/meetHooks";
import { Toasts } from "@/ui/Toasts";

const DEMO_CONTACT = "Demo profile — real people coming soon";
const SAFETY = "Meet in public areas of the venue. Nobody legit asks for seed phrases or funds.";
const EXIT_MS = 200;

/** Today's card reasons when they are in your hand; otherwise worked out fresh. */
function useChaiReasons(you: Person, them: Person, now: number): readonly string[] {
  const fromHand = useApp((s) => s.meet?.hand.find((c) => c.personId === them.id)?.reasons);
  return useMemo(() => {
    if (fromHand) return fromHand;
    const ctx: ScoreContext = {
      now,
      shownBefore: new Map(),
      wavedAtViewer: new Set(),
      inbound: new Map(),
    };
    return reasonsFor(you, them, scoreParts(you, them, ctx), false);
  }, [fromHand, you, them, now]);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface ContactProps {
  readonly them: Person;
  readonly opener: string;
}

/** Telegram with the opener as an unsent draft, or their X profile (plus the opener copied). */
function ContactButton({ them, opener }: ContactProps) {
  const actions = useActions();
  const handle = them.telegram ?? them.x;
  if (!handle) return null;
  const telegram = them.telegram !== null;
  const label = telegram ? "Message on Telegram" : "X profile";
  const icon = <Icon id={telegram ? "speech_balloon" : "waving_hand"} size={22} />;
  if (them.isDemo) {
    return (
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => actions.pushToast(DEMO_CONTACT, "sparkles", "info")}
      >
        {icon}
        {label}
      </button>
    );
  }
  const onOpen = (): void => {
    actions.markMessaged(them.id);
    if (telegram) return;
    void copyText(opener).then((ok) => {
      if (ok) actions.pushToast("Opener copied. Paste it in your DM.", "speech_balloon", "success");
    });
  };
  return (
    <a
      className="btn btn--primary"
      href={telegram ? telegramLink(handle, opener) : xProfileLink(handle)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
    >
      {icon}
      {label}
    </a>
  );
}

/** The prefilled first message, with a way to copy it for any app. */
function Opener({ text }: { readonly text: string }) {
  const actions = useActions();
  const copy = async (): Promise<void> => {
    const ok = await copyText(text);
    actions.pushToast(
      ok ? "Opener copied." : "Couldn't copy. Press and hold the message to copy it.",
      "speech_balloon",
      ok ? "success" : "info",
    );
  };
  return (
    <div className="bubble chai__opener">
      <p className="chai__opener-text">{text}</p>
      <button type="button" className="chai__copy" onClick={() => void copy()}>
        Copy opener
      </button>
    </div>
  );
}

function ChaiActions({
  them,
  chai,
  opener,
  onClose,
}: ContactProps & { readonly chai: Chai; readonly onClose: () => void }) {
  const actions = useActions();
  const met = chai.status === "met";
  return (
    <div className="chai__actions">
      <ContactButton them={them} opener={opener} />
      <div className="chai__row">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            actions.locate(them.id);
            onClose();
          }}
        >
          <Glyph name="pin" size={20} />
          Show on map
        </button>
        <button
          type="button"
          className="btn btn--wave"
          disabled={met}
          onClick={() => actions.confirmMet(them.id)}
        >
          <Glyph name="check" size={20} />
          {met ? "You met" : "We met"}
        </button>
      </div>
    </div>
  );
}

/** Both beans with chai cups that clink between them. */
function Clink({ you, them }: { readonly you: Person; readonly them: Person }) {
  return (
    <div className="chai__scene" aria-hidden="true">
      <span className="chai__bean chai__bean--you rangoli-disc">
        <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={70} face="happy" />
      </span>
      <span className="chai__cups">
        <span className="chai__cup chai__cup--left">
          <Icon id="hot_beverage" size={40} />
        </span>
        <span className="chai__spark">
          <Icon id="sparkles" size={30} />
        </span>
        <span className="chai__cup chai__cup--right">
          <Icon id="hot_beverage" size={40} />
        </span>
      </span>
      <span className="chai__bean chai__bean--them rangoli-disc">
        <BeanAvatar avatar={them.avatar} topic={them.topics[0] ?? "ai"} size={70} face="happy" />
      </span>
    </div>
  );
}

interface DialogProps {
  readonly you: Person;
  readonly them: Person;
  readonly chai: Chai;
  readonly leaving: boolean;
  readonly onClose: () => void;
}

/** Opens as a modal on mount (focus moves in), closes on unmount (focus returns). */
function useModal(): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);
  return ref;
}

function ChaiDialog({ you, them, chai, leaving, onClose }: DialogProps) {
  const ref = useModal();
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  const [burst, setBurst] = useState(!reducedMotion);
  const endBurst = useCallback(() => setBurst(false), []);
  const [plan] = useState(() => {
    const now = Date.now();
    return { now, spot: suggestedSpot(you.id, them.id), time: suggestedTime(now) };
  });
  const opener = openerText(you, them, plan.spot, plan.time);
  const reasons = useChaiReasons(you, them, plan.now);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onClose();
  };
  const onCancel = (e: SyntheticEvent): void => {
    e.preventDefault();
    onClose();
  };
  return (
    <dialog
      ref={ref}
      className="chai"
      aria-labelledby={titleId}
      data-leaving={leaving || undefined}
      inert={leaving}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="chai__card">
        <button type="button" className="nav-btn nav-btn--close chai__close" onClick={onClose}>
          <Glyph name="close" size={18} />
          <span className="visually-hidden">Close</span>
        </button>
        <h2 id={titleId} className="chai__title">
          Chai's on!
        </h2>
        {chai.demo ? <p className="chai__demo">Demo · simulated wave back</p> : null}
        <Clink you={you} them={them} />
        {burst ? <Confetti count={24} spread={160} onDone={endBurst} /> : null}
        <p className="chai__who">You & {firstName(them.name)} both waved 👋</p>
        <ul className="chai__reasons">
          {reasons.map((reason) => (
            <li key={reason}>
              <Icon id="sparkles" size={16} />
              {reason}
            </li>
          ))}
        </ul>
        <p className="chai__plan">
          <Glyph name="pin" size={18} />
          <span>
            {plan.spot} · around {plan.time}
          </span>
        </p>
        <Opener text={opener} />
        <ChaiActions them={them} chai={chai} opener={opener} onClose={onClose} />
        <p className="safety">
          <Icon id="shield" size={18} />
          {SAFETY}
        </p>
      </div>
      {/* The modal sits in the top layer above the page's toasts, so it shows its own. */}
      <Toasts />
    </dialog>
  );
}

/** Which chai to show: one you opened from a list, else a fresh "Chai's on!" moment. */
function useShownChai(viewing: string | null): string | null {
  return useApp((s) => {
    const meet = s.meet;
    if (!meet) return null;
    const open = viewing !== null && meet.chais.some((c) => c.personId === viewing);
    return open ? viewing : meet.celebrate;
  });
}

function ChaiFor({
  personId,
  leaving,
  onClose,
}: {
  readonly personId: string;
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const you = useApp((s) => s.you);
  const them = useApp((s) => s.people.find((p) => p.id === personId) ?? null);
  const chai = useApp((s) => s.meet?.chais.find((c) => c.personId === personId) ?? null);
  if (!you || !them || !chai) return null;
  return <ChaiDialog you={you} them={them} chai={chai} leaving={leaving} onClose={onClose} />;
}

/**
 * The "Chai's on!" card, mounted once for the whole app. It shows itself when a mutual wave
 * lands (`meet.celebrate`) and when a chai is opened from a list (`viewing`).
 */
export function ChaiOverlay({
  viewing,
  onClose,
}: {
  readonly viewing: string | null;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const shown = useShownChai(viewing);
  const celebrate = useApp((s) => s.meet?.celebrate ?? null);
  const items = usePresence(shown, EXIT_MS);
  const close = (): void => {
    if (shown !== null && shown === celebrate) actions.dismissChai();
    onClose();
  };
  return items.map(({ key, value, leaving }) => (
    <ChaiFor key={key} personId={value} leaving={leaving} onClose={close} />
  ));
}
