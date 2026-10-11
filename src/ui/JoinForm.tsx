import { useId, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";

import { useActions, useApp } from "@/app/context";
import type { JoinInput } from "@/app/joinTypes";
import { INTENTS, INTENTS_MAX } from "@/data/intents";
import { ONE_LINER_MAX, ONE_LINERS_MAX } from "@/data/oneLinerRules";
import { TOPICS } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { randomAvatar } from "@/ui/avatar";
import { CharacterStudio } from "@/ui/CharacterStudio";
import { Glyph, Icon } from "@/ui/Icon";
import {
  addLine,
  draftFrom,
  JOIN_FIELDS,
  lineErrors,
  NAME_MAX,
  removeLine,
  setLine,
  toggleIntent,
  toggleTopic,
  TOPICS_MAX,
  validateJoin,
} from "@/ui/joinDraft";
import type { JoinDraft, JoinErrors, JoinField } from "@/ui/joinDraft";
import { topicVars } from "@/ui/PanelChrome";
import { Turnstile } from "@/ui/Turnstile";

interface QuestionProps {
  readonly title: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly counter?: string;
  readonly error?: string | undefined;
  readonly errorId?: string;
  /** Render as a fieldset (groups of controls) instead of a labelled single field. */
  readonly group?: boolean;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}

function RequiredMark() {
  return (
    <>
      <span className="q-card__required" aria-hidden="true">
        *
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}

function QuestionHeading({
  title,
  required,
  counter,
}: Pick<QuestionProps, "title" | "required" | "counter">) {
  return (
    <>
      {title}
      {required ? <RequiredMark /> : null}
      {counter ? <span className="q-card__counter">{counter}</span> : null}
    </>
  );
}

function QuestionBody({
  hint,
  error,
  errorId,
  children,
}: Pick<QuestionProps, "hint" | "error" | "errorId" | "children">) {
  return (
    <>
      {hint ? <p className="q-card__hint">{hint}</p> : null}
      {children}
      {error ? (
        <p className="q-card__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </>
  );
}

/** A Google-Forms-style question card: title, hint, the control, and an inline error. */
function Question(props: QuestionProps) {
  const { group, htmlFor, error, errorId } = props;
  const invalid = error ? true : undefined;
  const heading = <QuestionHeading {...props} />;
  const body = <QuestionBody {...props} />;
  if (group) {
    return (
      <fieldset className="q-card" data-invalid={invalid} aria-describedby={invalid && errorId}>
        <legend className="q-card__title">{heading}</legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div className="q-card" data-invalid={invalid}>
      <label className="q-card__title" htmlFor={htmlFor}>
        {heading}
      </label>
      {body}
    </div>
  );
}

function fieldProps(id: string, error: string | undefined) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  } as const;
}

interface FieldsProps {
  readonly ids: Record<JoinField, string>;
  readonly draft: JoinDraft;
  readonly errors: JoinErrors;
  readonly update: (patch: Partial<JoinDraft>) => void;
  readonly touch: (field: JoinField) => void;
}

function HandleInput(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}) {
  return (
    <div className="handle-field">
      <label className="handle-field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="affix">
        <span className="affix__at" aria-hidden="true">
          @
        </span>
        <input
          {...fieldProps(props.id, props.error)}
          className="input affix__input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={64}
        />
      </div>
      {props.error ? (
        <p className="q-card__error" id={`${props.id}-error`}>
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

function HandlesQuestion({ ids, draft, errors, update, touch }: FieldsProps) {
  return (
    <Question
      title="How can people reach you?"
      required
      hint="Add at least one."
      error={errors.handles}
      errorId={`${ids.handles}-error`}
      group
    >
      <HandleInput
        id={ids.telegram}
        label="Telegram username"
        value={draft.telegram}
        error={errors.telegram}
        onChange={(telegram) => update({ telegram })}
        onBlur={() => touch("telegram")}
      />
      <HandleInput
        id={ids.x}
        label="X handle"
        value={draft.x}
        error={errors.x}
        onChange={(x) => update({ x })}
        onBlur={() => touch("x")}
      />
    </Question>
  );
}

function TopicsQuestion({ ids, draft, errors, update }: Omit<FieldsProps, "touch">) {
  const full = draft.topics.length >= TOPICS_MAX;
  return (
    <Question
      title="What are you into?"
      required
      hint="Pick 1 to 3. Your first pick is your shirt colour."
      counter={`${draft.topics.length}/${TOPICS_MAX}`}
      error={errors.topics}
      errorId={`${ids.topics}-error`}
      group
    >
      <div className="topic-picker" id={ids.topics} tabIndex={-1}>
        {TOPICS.map((topic) => {
          const order = draft.topics.indexOf(topic.id);
          const picked = order >= 0;
          return (
            <button
              key={topic.id}
              type="button"
              className="chip chip--pick"
              style={topicVars(topic.id)}
              aria-pressed={picked}
              aria-disabled={!picked && full ? true : undefined}
              onClick={() => update({ topics: toggleTopic(draft.topics, topic.id) })}
            >
              <Icon id={topic.icon} size={20} />
              {topic.short}
              {picked ? (
                <span className="chip__order" aria-hidden="true">
                  {order + 1}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Question>
  );
}

const INTENT_VARS = { "--topic": "var(--marigold)", "--on-topic": "var(--ink)" } as CSSProperties;

function IntentQuestion({ draft, update }: Pick<FieldsProps, "draft" | "update">) {
  const full = draft.intent.length >= INTENTS_MAX;
  return (
    <Question
      title="What are you here for?"
      hint={`Optional. Pick up to ${INTENTS_MAX}. Shown publicly on your profile and the map.`}
      counter={`${draft.intent.length}/${INTENTS_MAX}`}
      group
    >
      <div className="topic-picker intent-picker">
        {INTENTS.map((intent) => {
          const picked = draft.intent.includes(intent.id);
          return (
            <button
              key={intent.id}
              type="button"
              className="chip chip--pick"
              style={INTENT_VARS}
              aria-pressed={picked}
              aria-disabled={!picked && full ? true : undefined}
              onClick={() => update({ intent: toggleIntent(draft.intent, intent.id) })}
            >
              <Icon id={intent.icon} size={20} />
              {intent.label}
            </button>
          );
        })}
      </div>
    </Question>
  );
}

function useJoinIds(): Record<JoinField, string> {
  const base = useId();
  return {
    name: `${base}-name`,
    handles: `${base}-handles`,
    telegram: `${base}-telegram`,
    x: `${base}-x`,
    topics: `${base}-topics`,
    oneLiners: `${base}-line`,
    consent: `${base}-consent`,
  };
}

/** Shows an error once the field was left or the form was submitted. */
function visibleErrors(
  errors: JoinErrors,
  touched: ReadonlySet<JoinField>,
  submitted: boolean,
): JoinErrors {
  if (submitted) return errors;
  const shown: JoinErrors = {};
  for (const field of JOIN_FIELDS) {
    const message = errors[field];
    if (message && touched.has(field)) shown[field] = message;
  }
  return shown;
}

function TelegramSoon() {
  return (
    <div className="q-card q-card--tg">
      <button type="button" className="btn btn--tg" disabled>
        <Icon id="speech_balloon" size={22} />
        Continue with Telegram
        <span className="soon">coming soon</span>
      </button>
      <p className="q-or">
        <span>or fill this in</span>
      </p>
    </div>
  );
}

/** Backend mode: someone who joined on another device gets their bean back with Google. */
function GoogleSignIn() {
  const actions = useActions();
  return (
    <div className="q-card q-card--tg">
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => void actions.signInWithGoogle()}
      >
        Already joined? Sign in with Google
      </button>
      <p className="q-or">
        <span>or join below</span>
      </p>
    </div>
  );
}

function NameQuestion({ ids, draft, errors, update, touch }: FieldsProps) {
  const long = draft.name.length > NAME_MAX - 10;
  return (
    <Question
      title="Your name"
      required
      htmlFor={ids.name}
      counter={long ? `${draft.name.length}/${NAME_MAX}` : ""}
      error={errors.name}
      errorId={`${ids.name}-error`}
    >
      <input
        {...fieldProps(ids.name, errors.name)}
        className="input"
        value={draft.name}
        maxLength={NAME_MAX}
        aria-required="true"
        autoComplete="name"
        placeholder="What people call you"
        onChange={(e) => update({ name: e.target.value })}
        onBlur={() => touch("name")}
      />
    </Question>
  );
}

const LINE_PLACEHOLDERS = [
  "shipping agent wallets. ask me about passkeys",
  "first Devcon! here for zk and cutting chai",
  "hiring 2 Rust devs, chai on me",
];

interface LineInputProps {
  readonly id: string;
  readonly index: number;
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onRemove: (() => void) | null;
}

function LineInput({ id, index, value, error, onChange, onRemove }: LineInputProps) {
  const long = value.length > ONE_LINER_MAX - 20;
  return (
    <div className="line-field">
      <label className="visually-hidden" htmlFor={id}>
        One-liner {index + 1}
      </label>
      <div className="line-field__row">
        <span className="line-field__num" aria-hidden="true">
          {index + 1}
        </span>
        <input
          {...fieldProps(id, error)}
          className="input"
          value={value}
          maxLength={ONE_LINER_MAX}
          placeholder={LINE_PLACEHOLDERS[index] ?? ""}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
        {onRemove ? (
          <button
            type="button"
            className="nav-btn nav-btn--close line-field__remove"
            aria-label={`Remove one-liner ${index + 1}`}
            onClick={onRemove}
          >
            <Glyph name="close" size={16} />
          </button>
        ) : null}
      </div>
      {long ? (
        <p className="line-field__count">
          {value.length}/{ONE_LINER_MAX}
        </p>
      ) : null}
      {error ? (
        <p className="q-card__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OneLinersQuestion({
  ids,
  draft,
  update,
  serverError,
}: Pick<FieldsProps, "ids" | "draft" | "update"> & { readonly serverError: string | undefined }) {
  const lines = draft.oneLiners;
  const errors = lineErrors(lines);
  const written = lines.filter((line) => line.trim().length > 0).length;
  return (
    <Question
      title="Your catchy one-liners"
      hint={`Optional, up to ${ONE_LINERS_MAX}. They pop up over your bean on the map, so make people curious enough to wave.`}
      counter={`${written}/${ONE_LINERS_MAX}`}
      error={serverError}
      errorId={`${ids.oneLiners}-error`}
      group
    >
      <div className="line-fields">
        {lines.map((line, index) => (
          <LineInput
            // The inputs are positional (line 1, 2, 3); the index is their identity.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            id={`${ids.oneLiners}-${index}`}
            index={index}
            value={line}
            error={errors[index]}
            onChange={(value) => update({ oneLiners: setLine(lines, index, value) })}
            onRemove={
              lines.length > 1 ? () => update({ oneLiners: removeLine(lines, index) }) : null
            }
          />
        ))}
        {lines.length < ONE_LINERS_MAX ? (
          <button
            type="button"
            className="btn btn--quiet line-fields__add"
            onClick={() => update({ oneLiners: addLine(lines) })}
          >
            + Add another one-liner
          </button>
        ) : null}
      </div>
    </Question>
  );
}

function ConsentCard({ ids, draft, errors, update }: Omit<FieldsProps, "touch">) {
  return (
    <div className="q-card" data-invalid={errors.consent ? true : undefined}>
      <label className="consent">
        <input
          {...fieldProps(ids.consent, errors.consent)}
          type="checkbox"
          className="consent__box"
          aria-required="true"
          checked={draft.consent}
          onChange={(e) => update({ consent: e.target.checked })}
        />
        <span className="consent__tick">
          <Glyph name="check" size={18} />
        </span>
        <span>
          Show my name, topics and one-liners on this map, and my handles to people who wave at me
          <RequiredMark />
        </span>
      </label>
      {errors.consent ? (
        <p className="q-card__error" id={`${ids.consent}-error`}>
          {errors.consent}
        </p>
      ) : null}
    </div>
  );
}

/** The input to focus for a field's error: handles → Telegram, one-liners → the first bad line. */
function focusTarget(field: JoinField, ids: Record<JoinField, string>, draft: JoinDraft): string {
  if (field === "handles") return ids.telegram;
  if (field !== "oneLiners") return ids[field];
  const bad = lineErrors(draft.oneLiners).findIndex(Boolean);
  return `${ids.oneLiners}-${Math.max(0, bad)}`;
}

interface JoinFormProps {
  readonly you: Person | null;
  readonly presetTopic: TopicId | null;
  readonly onDone: () => void;
  readonly onCancel: (() => void) | null;
}

/** A demo-mode profile found in this browser starts the backend join form (consent asked again). */
function initialDraft(
  you: Person | null,
  prefill: Person | null,
  topic: TopicId | null,
): JoinDraft {
  if (you || !prefill) return draftFrom(you, topic, randomAvatar());
  return { ...draftFrom(prefill, topic, randomAvatar()), consent: false };
}

/** What the server said was wrong: on a field, or about the whole form. */
interface ServerProblem {
  readonly field: JoinField | null;
  readonly text: string;
}

/** Backend mode's first join needs Cloudflare's check; editing later doesn't. */
function useCheck(): { readonly siteKey: string | null; readonly needed: boolean } {
  const mode = useApp((s) => s.mode);
  const account = useApp((s) => s.account);
  const siteKey = useApp((s) => s.turnstileSiteKey);
  return { siteKey, needed: mode === "backend" && account === null };
}

interface Submission {
  readonly pending: boolean;
  readonly problem: ServerProblem | null;
  readonly clearProblem: () => void;
  /** Bumps after a failed attempt, so the check widget starts over with a fresh token. */
  readonly round: number;
  readonly setToken: (token: string | null) => void;
  readonly submit: (input: JoinInput, focus: (field: JoinField) => void) => Promise<void>;
}

/** Sends a valid form: the check token first time round, then the server's answer. */
function useSubmission(onDone: () => void): Submission {
  const actions = useActions();
  const check = useCheck();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ServerProblem | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const submit = async (input: JoinInput, focus: (field: JoinField) => void): Promise<void> => {
    if (pending) return;
    if (check.needed && !token) {
      setProblem({ field: null, text: "Finish the quick robot check above the button first." });
      return;
    }
    setPending(true);
    const outcome = await actions.join(input, check.needed ? token : null);
    setPending(false);
    if (outcome.ok) return onDone();
    setProblem(outcome.problem);
    if (outcome.problem.field) focus(outcome.problem.field);
    // A check token works once; get a fresh one in case this attempt used it up.
    if (check.needed) {
      setToken(null);
      setRound((r) => r + 1);
    }
  };
  return { pending, problem, clearProblem: () => setProblem(null), round, setToken, submit };
}

/** The join form. Submitting walks your bean in from the gate (or back in, when editing). */
export function JoinForm({ you, presetTopic, onDone, onCancel }: JoinFormProps) {
  const ids = useJoinIds();
  const mode = useApp((s) => s.mode);
  const prefill = useApp((s) => s.joinPrefill);
  const sending = useSubmission(onDone);
  const { problem } = sending;
  const [draft, setDraft] = useState<JoinDraft>(() => initialDraft(you, prefill, presetTopic));
  const [touched, setTouched] = useState<ReadonlySet<JoinField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const result = validateJoin(draft);
  const errors = withServer(
    visibleErrors(result.ok ? {} : result.errors, touched, submitted),
    problem,
  );
  const update = (patch: Partial<JoinDraft>): void => {
    setDraft((d) => ({ ...d, ...patch }));
    sending.clearProblem();
  };
  const touch = (field: JoinField): void => setTouched((t) => new Set(t).add(field));
  const fields = { ids, draft, errors, update };
  const focus = (field: JoinField): void =>
    document.getElementById(focusTarget(field, ids, draft))?.focus();

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setSubmitted(true);
    if (result.ok) {
      void sending.submit(result.input, focus);
      return;
    }
    const first = JOIN_FIELDS.find((field) => result.errors[field]);
    if (first) focus(first);
  };

  return (
    <form className="join-form" noValidate onSubmit={onSubmit}>
      <div className="join-form__questions">
        {you ? null : <FormStart backend={mode === "backend"} />}
        <NameQuestion {...fields} touch={touch} />
        <HandlesQuestion {...fields} touch={touch} />
        <TopicsQuestion {...fields} />
        <IntentQuestion draft={draft} update={update} />
        <OneLinersQuestion
          ids={ids}
          draft={draft}
          update={update}
          serverError={problem?.field === "oneLiners" ? problem.text : undefined}
        />
      </div>
      <CharacterStudio draft={draft} update={update} />
      <div className="join-form__finish">
        <ConsentCard {...fields} />
        <Check sending={sending} />
        <JoinSubmit
          editing={you !== null}
          pending={sending.pending}
          problem={formProblem(problem)}
          demo={mode === "demo"}
          onCancel={onCancel}
        />
      </div>
    </form>
  );
}

/** The Turnstile widget, when this join needs it. */
function Check({ sending }: { readonly sending: Submission }) {
  const check = useCheck();
  if (!check.needed || !check.siteKey) return null;
  return <Turnstile key={sending.round} siteKey={check.siteKey} onToken={sending.setToken} />;
}

function formProblem(problem: ServerProblem | null): string | null {
  return problem && problem.field === null ? problem.text : null;
}

/** Above a new join: Google to restore a bean (backend mode), or the Telegram teaser (demo). */
function FormStart({ backend }: { readonly backend: boolean }) {
  return backend ? <GoogleSignIn /> : <TelegramSoon />;
}

/** Field errors from the form, plus the server's (it has the final say on names and handles). */
function withServer(errors: JoinErrors, problem: ServerProblem | null): JoinErrors {
  if (!problem?.field || problem.field === "oneLiners") return errors;
  return { ...errors, [problem.field]: problem.text };
}

interface JoinSubmitProps {
  readonly editing: boolean;
  readonly pending: boolean;
  /** A problem with the whole form (no single field), from the server. */
  readonly problem: string | null;
  readonly demo: boolean;
  readonly onCancel: (() => void) | null;
}

function JoinSubmit({ editing, pending, problem, demo, onCancel }: JoinSubmitProps) {
  return (
    <div className="join-form__submit">
      {problem ? (
        <p className="q-card__error" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn--primary btn--big"
        aria-disabled={pending || undefined}
      >
        {pending ? "Saving…" : editing ? "Save and walk back in" : "Walk into coii"}
      </button>
      {onCancel ? (
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
      {demo ? (
        <p className="join-form__note">
          Saved in this browser only for now. You can leave anytime.
        </p>
      ) : null}
    </div>
  );
}
