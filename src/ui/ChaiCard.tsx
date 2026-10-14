import "@/ui/chai.css";
import { useCallback, useId, useMemo, useState } from "react";

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
import { chaiNames, shownChai } from "@/ui/chaiBatch";
import type { ShownChai } from "@/ui/chaiBatch";
import { Confetti } from "@/ui/Confetti";
import { usePresence } from "@/ui/hooks";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";
import { useReducedMotion } from "@/ui/meetHooks";
import { useOpenChai } from "@/ui/meetHooks";
import { modalCloseHandlers, OVERLAY_EXIT_MS, useModal } from "@/ui/Overlay";
import { TelegramGateButton } from "@/ui/TelegramGateButton";
import { Toasts } from "@/ui/Toasts";

const DEMO_CONTACT = "Demo profile — real people coming soon";
const SAFETY = "Meet in public areas of the venue. Nobody legit asks for seed phrases or funds.";

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

/** One real contact link: Telegram with a draft, or X with the opener copied. */
function ContactButton({
  them,
  opener,
  kind,
  primary,
}: ContactProps & { readonly kind: "telegram" | "x"; readonly primary: boolean }) {
  const actions = useActions();
  const handle = kind === "telegram" ? them.telegram : them.x;
  if (!handle) return null;
  const telegram = kind === "telegram";
  const label = telegram ? "Message on Telegram" : "X profile";
  const icon = <Icon id={telegram ? "speech_balloon" : "waving_hand"} size={22} />;
  const className = `btn ${primary ? "btn--primary" : "btn--secondary"}`;
  if (them.isDemo) {
    return (
      <button
        type="button"
        className={className}
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
      className={className}
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

/** Telegram is private until this viewer verifies; X stays available after the wave. */
function ContactButtons({
  them,
  opener,
  onVerify,
}: ContactProps & { readonly onVerify: () => void }) {
  const telegram = them.telegram !== null;
  const locked = them.telegramLocked === true;
  const x = them.x !== null;
  if (!telegram && !locked && !x) return null;
  return (
    <div className="chai__contact-actions">
      {telegram ? <ContactButton them={them} opener={opener} kind="telegram" primary /> : null}
      {locked ? (
        <TelegramGateButton personId={them.id} surface="chai" onBeforeOpen={onVerify} />
      ) : null}
      {x ? (
        <ContactButton them={them} opener={opener} kind="x" primary={!telegram && !locked} />
      ) : null}
    </div>
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
      <ContactButtons them={them} opener={opener} onVerify={onClose} />
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
      <UnmatchButton them={them} onDone={onClose} />
    </div>
  );
}

/** Quiet "Unmatch" with an inline confirm step (no browser dialogs). */
function UnmatchButton({ them, onDone }: { readonly them: Person; readonly onDone: () => void }) {
  const actions = useActions();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn--quiet chai__unmatch"
        onClick={() => setConfirming(true)}
      >
        Unmatch
      </button>
    );
  }
  const first = them.name.split(" ")[0] ?? them.name;
  return (
    <div className="chai__confirm" role="group" aria-label={`Unmatch ${first}?`}>
      <p>End this chai with {first}? They won't show up in your picks for a week.</p>
      <div className="chai__row">
        <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
          Keep it
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            actions.unmatch(them.id);
            onDone();
          }}
        >
          Unmatch
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
  return (
    <dialog
      ref={ref}
      className="chai"
      aria-labelledby={titleId}
      data-leaving={leaving || undefined}
      inert={leaving}
      tabIndex={-1}
      {...modalCloseHandlers(onClose)}
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
            {plan.spot} · {plan.time}
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

function BatchChaiDialog({
  personIds,
  leaving,
  onClose,
}: {
  readonly personIds: readonly string[];
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const ref = useModal();
  const titleId = useId();
  const actions = useActions();
  const openChai = useOpenChai();
  const allPeople = useApp((s) => s.people);
  const people = useMemo(
    () => personIds.flatMap((id) => allPeople.find((person) => person.id === id) ?? []),
    [allPeople, personIds],
  );
  const reducedMotion = useReducedMotion();
  const [burst, setBurst] = useState(!reducedMotion);
  const dismissAll = (): void => {
    for (const id of personIds) actions.dismissChai(id);
  };
  const close = (): void => {
    dismissAll();
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
      {...modalCloseHandlers(close)}
    >
      <div className="chai__card chai__card--batch">
        <button type="button" className="nav-btn nav-btn--close chai__close" onClick={close}>
          <Glyph name="close" size={18} />
          <span className="visually-hidden">Close</span>
        </button>
        <h2 id={titleId} className="chai__title">
          Chai's on!
        </h2>
        {burst ? <Confetti count={32} spread={180} onDone={() => setBurst(false)} /> : null}
        <p className="chai__batch-who">
          Chai's on with {chaiNames(people.map((person) => firstName(person.name)))}!
        </p>
        <p className="chai__batch-hint">Pick a face to open that chai.</p>
        <div className="chai__faces">
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              className="chai__face"
              aria-label={`Open chai with ${firstName(person.name)}`}
              onClick={() => {
                dismissAll();
                openChai(person.id);
              }}
            >
              <span className="rangoli-disc">
                <BeanAvatar
                  avatar={person.avatar}
                  topic={person.topics[0] ?? "ai"}
                  size={70}
                  face="happy"
                />
              </span>
              <strong>{firstName(person.name)}</strong>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--primary chai__see-all"
          onClick={() => {
            dismissAll();
            actions.openPanel("meet");
            onClose();
          }}
        >
          <Icon id="sparkles" size={20} />
          See my chais
        </button>
      </div>
      <Toasts />
    </dialog>
  );
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
  const chais = useApp((s) => s.meet?.chais ?? null);
  const people = useApp((s) => s.people);
  const shown = useMemo<ShownChai | null>(() => {
    if (!chais) return null;
    return shownChai(viewing, chais, new Set(people.map((person) => person.id)));
  }, [chais, people, viewing]);
  // Switching from the combined card to one person's card replaces the one modal in place.
  const items = usePresence(shown, OVERLAY_EXIT_MS, () => true);
  return items.map(({ key, value, leaving }) => {
    if (value.kind === "batch") {
      return (
        <BatchChaiDialog
          key={key}
          personIds={value.personIds}
          leaving={leaving}
          onClose={onClose}
        />
      );
    }
    const close = (): void => {
      if (value.celebration) actions.dismissChai(value.personId);
      onClose();
    };
    return <ChaiFor key={key} personId={value.personId} leaving={leaving} onClose={close} />;
  });
}
