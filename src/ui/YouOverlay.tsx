import "@/ui/join.css";
import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { pointsReader } from "@/app/points";
import { SIGN_OUT } from "@/content/privacy";
import { topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { rankOf } from "@/match/points";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { JoinForm } from "@/ui/JoinForm";
import { pointsText } from "@/ui/meet";
import { CloseButton, Overlay } from "@/ui/Overlay";
import {
  Awning,
  IntentChips,
  LeaveButton,
  OneLiners,
  TopicChips,
  topicVars,
} from "@/ui/PanelChrome";
import { TelegramWidget } from "@/ui/TelegramWidget";

function YouCard({ you }: { readonly you: Person }) {
  const handles = [you.telegram ? `@${you.telegram}` : null, you.x ? `X @${you.x}` : null]
    .filter((h) => h !== null)
    .join(" · ");
  return (
    <div className="you-card">
      <div className="you-card__bean rangoli-disc" style={topicVars(you.topics[0] ?? "ai")}>
        <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={150} face="happy" />
      </div>
      <p className="you-card__name">{you.name}</p>
      {handles ? <p className="you-card__handles">{handles}</p> : null}
      <TopicChips topics={you.topics} />
      <IntentChips intents={you.intent} />
      <OneLiners lines={you.oneLiners} />
    </div>
  );
}

/** Your wave points and rank, opening the live board. */
function YourPoints({ you }: { readonly you: Person }) {
  const actions = useActions();
  const points = useApp((s) => pointsReader(s)(you));
  const rank = useApp((s) => rankOf(s.people, pointsReader(s), you));
  return (
    <button type="button" className="you-points" onClick={() => actions.openOverlay("board")}>
      <Icon id="trophy" size={36} />
      <span className="you-points__text">
        <strong>{pointsText(points)}</strong>
        <span>#{rank} on the board · see it live</span>
      </span>
    </button>
  );
}

/**
 * Backend mode: your bean lives in this browser's session until Google is linked. Linking it
 * means a cleared browser or a new phone can get it back.
 */
function SaveBean() {
  const actions = useActions();
  const account = useApp((s) => s.account);
  if (!account || account.google) return null;
  return (
    <div className="you-note">
      <p>
        <strong>Save your bean.</strong> Link Google so you can get it back on another phone or if
        this browser forgets you.
      </p>
      <button type="button" className="btn btn--secondary" onClick={() => void actions.saveBean()}>
        Save my bean with Google
      </button>
    </div>
  );
}

/**
 * Backend mode: prove your Telegram username is yours and get the ✓ (optional, any time).
 * The widget only works on the site's own domain (BotFather /setdomain).
 */
function TelegramVerify({ you }: { readonly you: Person }) {
  const backend = useApp((s) => s.mode === "backend");
  const [open, setOpen] = useState(false);
  if (!backend) return null;
  if (you.telegramVerified) {
    return (
      <p className="you-note" role="status">
        <strong>Telegram verified ✓</strong> @{you.telegram}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
        <Icon id="speech_balloon" size={20} />
        Verify with Telegram
      </button>
    );
  }
  return (
    <div className="you-note">
      <p>
        Tap the Telegram button and confirm in Telegram. You'll come straight back here, and your
        Telegram username becomes your verified handle with a ✓.
      </p>
      <TelegramWidget />
    </div>
  );
}

/** Backend mode, Google linked: sign out and keep the bean (without Google it would be lost). */
function SignOut() {
  const actions = useActions();
  const google = useApp((s) => s.account?.google ?? false);
  if (!google) return null;
  return (
    <div className="you-note">
      <p>{SIGN_OUT.hint}</p>
      <button type="button" className="btn btn--secondary" onClick={() => void actions.signOut()}>
        {SIGN_OUT.button}
      </button>
    </div>
  );
}

/** Backend mode: your bean was hidden after reports, while a moderator takes a look. */
function HiddenNote() {
  const hidden = useApp((s) => s.account?.hidden ?? false);
  if (!hidden) return null;
  return (
    <p className="you-note" role="status">
      <strong>Your bean is hidden for now.</strong> A few people reported it, so nobody else can see
      it until a moderator takes a look.
    </p>
  );
}

/** Your profile once you've joined: the card people see, plus what you can do with it. */
function YouSummary({ you, onEdit }: { readonly you: Person; readonly onEdit: () => void }) {
  const actions = useActions();
  return (
    <div className="you-summary">
      <YouCard you={you} />
      <div className="you-summary__actions">
        <HiddenNote />
        <SaveBean />
        <TelegramVerify you={you} />
        <YourPoints you={you} />
        <button type="button" className="btn btn--primary" onClick={() => actions.locate(you.id)}>
          <Glyph name="pin" size={20} />
          Show me on map
        </button>
        <button type="button" className="btn btn--secondary" onClick={onEdit}>
          Edit my profile
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            actions.openPanel("meet");
            actions.closeOverlay();
          }}
        >
          <Icon id="sparkles" size={20} />
          See today's 3
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.openOverlay("invite")}
        >
          Invite friends
        </button>
        <SignOut />
        <LeaveButton />
        <button
          type="button"
          className="privacy-link"
          onClick={() => actions.openOverlay("privacy")}
        >
          Privacy
        </button>
      </div>
    </div>
  );
}

function joinCopy(you: Person | null, editing: boolean): { title: string; blurb: string } {
  if (you === null) {
    return {
      title: "Join coii",
      blurb: "Put your bean on the map so people into the same ideas can find you.",
    };
  }
  if (editing)
    return { title: "Edit your bean", blurb: "Saving walks your bean back in with the new look." };
  const booths = you.topics.map((t) => topicById(t).short).join(", ");
  return { title: "You're in", blurb: `Your bean hangs out at ${booths}.` };
}

interface YouBodyProps {
  readonly you: Person | null;
  readonly editing: boolean;
  readonly setEditing: (editing: boolean) => void;
  readonly presetTopic: TopicId | null;
}

/** The join form, or the edit form (with "save my bean" first) once you're in. */
function YouForm({ you, setEditing, presetTopic }: Omit<YouBodyProps, "editing">) {
  return (
    <>
      {you ? <SaveBean /> : null}
      <JoinForm
        key={you?.id ?? "new"}
        you={you}
        presetTopic={presetTopic}
        onDone={() => setEditing(false)}
        onCancel={you ? () => setEditing(false) : null}
      />
    </>
  );
}

function YouBody({ you, editing, setEditing, presetTopic }: YouBodyProps) {
  const showForm = you === null || editing;
  return (
    <div className="overlay__scroll join__scroll" key={showForm ? "form" : "summary"}>
      {showForm ? (
        <YouForm you={you} setEditing={setEditing} presetTopic={presetTopic} />
      ) : (
        <YouSummary you={you} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

/**
 * Your own profile as a big centred overlay: the join form when you're new, a summary once
 * you've joined, and the same form (with the character studio) when you edit.
 */
export function YouOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const you = useApp((s) => s.you);
  const joinTopic = useApp((s) => s.joinTopic);
  // Right after claiming a bean it opens on the form, so you can check everything over.
  const editYou = useApp((s) => s.editYou);
  const [editing, setEditing] = useState(joinTopic !== null || editYou);
  const titleId = useId();
  const { title, blurb } = joinCopy(you, editing);

  return (
    <Overlay kind="you" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <header className="join__band">
        <Awning color="var(--rani)" />
        <CloseButton onClose={onClose} />
        <h2 id={titleId} className="join__title">
          {title}
        </h2>
        <p className="join__blurb">{blurb}</p>
      </header>
      <YouBody you={you} editing={editing} setEditing={setEditing} presetTopic={joinTopic} />
    </Overlay>
  );
}
