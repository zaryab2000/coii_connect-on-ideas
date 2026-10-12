import "@/ui/claim.css";
import "@/ui/join.css";
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import { tokenFromInput } from "@/app/claim";
import type { ClaimPreview, ClaimView } from "@/app/claim";
import { useActions, useApp } from "@/app/context";
import type { InvitedRef } from "@/app/joinTypes";
import { errorCopy } from "@/backend/errors";
import { CLAIM } from "@/content/claim";
import { CONSENT, CONTACT_EMAIL } from "@/content/privacy";
import type { Avatar, IntentId, TopicId } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { CloseButton, Overlay } from "@/ui/Overlay";
import { Awning, IntentChips, OneLiners, TopicChips, topicVars } from "@/ui/PanelChrome";
import { TelegramWidget } from "@/ui/TelegramWidget";
import { Turnstile } from "@/ui/Turnstile";

/**
 * Claim your bean (docs-internal/prd/claim-your-bean.md §7): the claim screen a claim link opens,
 * and the panel that offers an invited bean to someone who may be that person.
 */

/** What a bean preview shows; a venue person and a claim-link preview both have it. */
interface BeanLook {
  readonly name: string;
  readonly topics: readonly TopicId[];
  readonly intent: readonly IntentId[];
  readonly oneLiners: readonly string[];
  readonly avatar: Avatar;
}

/** The invited bean: look, name, topics, reasons and one-liners. Never handles. */
function ClaimBean({ bean }: { readonly bean: BeanLook }) {
  const primary = bean.topics[0] ?? "ai";
  return (
    <div className="claim-bean" style={topicVars(primary)}>
      <div className="claim-bean__disc rangoli-disc">
        <BeanAvatar avatar={bean.avatar} topic={primary} size={96} face="happy" />
      </div>
      <p className="claim-bean__name">{bean.name}</p>
      <TopicChips topics={bean.topics} />
      <IntentChips intents={bean.intent} />
      <OneLiners lines={bean.oneLiners} />
    </div>
  );
}

/** The same consent tick and words as joining: claiming is joining with a bean already made. */
function ConsentTick({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const actions = useActions();
  return (
    <div className="q-card">
      <label className="consent">
        <input
          type="checkbox"
          className="consent__box"
          aria-required="true"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="consent__tick">
          <Glyph name="check" size={18} />
        </span>
        <span>{CONSENT.label}</span>
      </label>
      <button
        type="button"
        className="privacy-link consent__more"
        onClick={() => actions.openOverlay("privacy")}
      >
        {CONSENT.link}
      </button>
    </div>
  );
}

interface Proof {
  readonly consent: boolean;
  readonly setConsent: (consent: boolean) => void;
  readonly pending: boolean;
  readonly problem: string | null;
  /** Bumps after an attempt, so the robot check starts over with a fresh token. */
  readonly round: number;
  readonly setToken: (token: string | null) => void;
  /** Checks consent and the robot check, then runs `send`; its answer is the problem, if any. */
  readonly run: (send: (captcha: string | null) => Promise<string | null>) => Promise<boolean>;
}

/** Consent plus Cloudflare's check (only when this browser has no session yet), then a call. */
function useProof(): Proof {
  const needed = useApp((s) => s.mode === "backend" && s.account === null);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const run = async (send: (captcha: string | null) => Promise<string | null>) => {
    if (pending) return false;
    if (!consent) {
      setProblem(errorCopy("consent_required").text);
      return false;
    }
    if (needed && !token) {
      setProblem("Finish the quick robot check above the button first.");
      return false;
    }
    setPending(true);
    const answer = await send(needed ? token : null);
    setPending(false);
    setProblem(answer);
    setToken(null);
    setRound((r) => r + 1);
    return answer === null;
  };
  return { consent, setConsent, pending, problem, round, setToken, run };
}

/** Cloudflare's check, when this browser has no session yet. */
function ProofCheck({ proof }: { readonly proof: Proof }) {
  const needed = useApp((s) => s.mode === "backend" && s.account === null);
  const siteKey = useApp((s) => s.turnstileSiteKey);
  if (!needed) return null;
  if (!siteKey) {
    return (
      <p className="q-card__error" role="alert">
        Claiming is unavailable right now. Please try again a little later.
      </p>
    );
  }
  return <Turnstile key={proof.round} siteKey={siteKey} onToken={proof.setToken} />;
}

function Problem({ text }: { readonly text: string | null }) {
  return text ? (
    <p className="q-card__error" role="alert">
      {text}
    </p>
  ) : null;
}

/** "Claim my bean": consent, the robot check if needed, and the claim. */
function ClaimForm({ token }: { readonly token: string }) {
  const actions = useActions();
  const proof = useProof();
  return (
    <div className="claim__form">
      <ConsentTick checked={proof.consent} onChange={proof.setConsent} />
      <ProofCheck proof={proof} />
      <Problem text={proof.problem} />
      <button
        type="button"
        className="btn btn--primary btn--big"
        aria-disabled={proof.pending || undefined}
        onClick={() => void proof.run((captcha) => actions.claimBean(token, captcha))}
      >
        {proof.pending ? CLAIM.pending : CLAIM.button}
      </button>
    </div>
  );
}

/** Already claimed: maybe it was you, on another device. */
function ClaimedState() {
  const actions = useActions();
  return (
    <div className="claim__state">
      <p>{CLAIM.claimed}</p>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => void actions.signInWithGoogle()}
      >
        Sign in with Google
      </button>
    </div>
  );
}

/** A ready link, opened in a browser that already has a bean: don't claim, say why. */
function ReadyLink({ token, preview }: { readonly token: string; readonly preview: ClaimPreview }) {
  const you = useApp((s) => s.you);
  return (
    <>
      <p className="claim__intro">{CLAIM.intro(preview.name)}</p>
      <ClaimBean bean={preview} />
      {you ? (
        <p className="claim__state" role="status">
          {CLAIM.alreadyHaveBean(you.name)}
        </p>
      ) : (
        <ClaimForm token={token} />
      )}
    </>
  );
}

/** The claim screen for one link: loading, then the bean and the button, or why not. */
function ClaimLink({
  token,
  preview,
}: {
  readonly token: string;
  readonly preview: ClaimPreview | null;
}) {
  if (!preview) {
    return (
      <p className="claim__state" role="status">
        {CLAIM.loading}
      </p>
    );
  }
  switch (preview.status) {
    case "ready":
      return <ReadyLink token={token} preview={preview} />;
    case "claimed":
      return <ClaimedState />;
    case "expired":
      return <p className="claim__state">{CLAIM.expired}</p>;
    case "invalid":
      return <p className="claim__state">{CLAIM.invalid}</p>;
  }
}

/** "Claim with Telegram": consent and a session first, then Telegram's own button. */
function TelegramClaim() {
  const actions = useActions();
  const proof = useProof();
  const [ready, setReady] = useState(false);
  if (ready) {
    return (
      <div className="claim__option">
        <p>{CLAIM.withTelegramHint}</p>
        <TelegramWidget />
      </div>
    );
  }
  return (
    <div className="claim__option">
      <p>{CLAIM.withTelegramHint}</p>
      <ConsentTick checked={proof.consent} onChange={proof.setConsent} />
      <ProofCheck proof={proof} />
      <Problem text={proof.problem} />
      <button
        type="button"
        className="btn btn--tg"
        aria-disabled={proof.pending || undefined}
        onClick={() =>
          void proof.run((captcha) => actions.prepareTelegramClaim(captcha)).then(setReady)
        }
      >
        <Icon id="speech_balloon" size={22} />
        {CLAIM.telegramContinue}
      </button>
    </div>
  );
}

/** "I have a claim link": paste it (or just its token) and open the claim screen. */
function PasteLink() {
  const actions = useActions();
  const id = useId();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const open = (): void => {
    const token = tokenFromInput(value);
    setBad(token === null);
    if (token) actions.openClaimLink(token);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    // Inside the join form, Enter would otherwise submit the join.
    if (e.key !== "Enter") return;
    e.preventDefault();
    open();
  };
  return (
    <div className="claim__option">
      <label className="handle-field__label" htmlFor={id}>
        {CLAIM.linkLabel}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        placeholder="https://coii.decipherclub.com/claim/…"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Problem text={bad ? CLAIM.linkBad : null} />
      <button type="button" className="btn btn--primary" onClick={open}>
        {CLAIM.linkOpen}
      </button>
    </div>
  );
}

type Way = "telegram" | "link" | "ask" | null;

function WayButton({
  label,
  way,
  open,
  setOpen,
}: {
  readonly label: string;
  readonly way: Exclude<Way, null>;
  readonly open: Way;
  readonly setOpen: (way: Way) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn--secondary"
      aria-expanded={open === way}
      onClick={() => setOpen(open === way ? null : way)}
    >
      {label}
    </button>
  );
}

/** The ways to claim: Telegram (when the Telegram handle matched), a claim link, or asking. */
function ClaimWays({ telegram }: { readonly telegram: boolean }) {
  const [open, setOpen] = useState<Way>(null);
  return (
    <div className="claim__ways">
      {telegram ? (
        <WayButton label={CLAIM.withTelegram} way="telegram" open={open} setOpen={setOpen} />
      ) : null}
      {open === "telegram" ? <TelegramClaim /> : null}
      <WayButton label={CLAIM.haveLink} way="link" open={open} setOpen={setOpen} />
      {open === "link" ? <PasteLink /> : null}
      <WayButton label={CLAIM.askLink} way="ask" open={open} setOpen={setOpen} />
      {open === "ask" ? (
        <p className="claim__option">
          {CLAIM.askText} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      ) : null}
    </div>
  );
}

function panelCopy(
  reason: "join" | "card" | "hint",
  name: string,
): { title: string; text: string } {
  return reason === "join"
    ? { title: CLAIM.panelJoinHeading, text: CLAIM.panelJoinText(name) }
    : { title: CLAIM.panelHeading, text: CLAIM.panelText(name) };
}

/**
 * An invited bean someone may be: who the coii team added, and how to claim it. Shown in the join
 * form when a handle hits it (`titled`), and in the claim overlay.
 */
export function ClaimPanel({
  invited,
  reason,
  titled,
}: {
  readonly invited: InvitedRef;
  readonly reason: "join" | "card" | "hint";
  readonly titled: boolean;
}) {
  const person = useApp((s) => s.people.find((p) => p.id === invited.personId) ?? null);
  const { title, text } = panelCopy(reason, person?.name ?? "you");
  return (
    <section className="claim-panel" aria-label={title}>
      {titled ? <h3 className="claim-panel__title">{title}</h3> : null}
      <p className="claim__intro">{text}</p>
      {person ? <ClaimBean bean={person} /> : null}
      <ClaimWays telegram={invited.handle === "telegram"} />
    </section>
  );
}

function overlayTitle(claim: ClaimView | null): string {
  if (claim?.kind !== "panel") return CLAIM.heading;
  return claim.reason === "join" ? CLAIM.panelJoinHeading : CLAIM.panelHeading;
}

/** Overlay "claim": a claim link's screen, or the panel for an invited bean you may be. */
export function ClaimOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const claim = useApp((s) => s.claim);
  const titleId = useId();
  return (
    <Overlay kind="claim" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <header className="join__band">
        <Awning color="var(--marigold)" />
        <CloseButton onClose={onClose} />
        <h2 id={titleId} className="join__title">
          {overlayTitle(claim)}
        </h2>
      </header>
      <div className="overlay__scroll claim">
        {claim?.kind === "link" ? <ClaimLink token={claim.token} preview={claim.preview} /> : null}
        {claim?.kind === "panel" ? (
          <ClaimPanel invited={claim.invited} reason={claim.reason} titled={false} />
        ) : null}
      </div>
    </Overlay>
  );
}
