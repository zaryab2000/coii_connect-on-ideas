import type { Session } from "@supabase/supabase-js";

import type { JoinInput } from "@/app/joinTypes";
import { invoke, rpc } from "@/backend/api";
import type { Supabase } from "@/backend/client";
import { toBackendError } from "@/backend/errors";
import { isIntentId } from "@/data/intents";
import { isTopicId } from "@/data/topics";
import type { Avatar, IntentId, Person, TopicId } from "@/data/types";

/** Your own bean as `get_me()` returns it: handles included, plus whether it's hidden. */
export interface Me {
  readonly person: Person;
  readonly hidden: boolean;
}

type Raw = Record<string, unknown>;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function handle(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function avatarOf(value: unknown): Avatar {
  const look = Array.isArray(value) ? value.map(Number) : [];
  return {
    skin: look[0] ?? 0,
    hair: look[1] ?? 0,
    hairColor: look[2] ?? 0,
    accessory: look[3] ?? 0,
  };
}

function timeOf(value: unknown): number {
  const at = Date.parse(typeof value === "string" ? value : "");
  return Number.isNaN(at) ? Date.now() : at;
}

/** Reads `get_me()` / `upsert_profile()`; null when you have no bean yet. */
export function meFrom(value: unknown): Me | null {
  if (typeof value !== "object" || value === null) return null;
  const me = value as Raw;
  if (typeof me["id"] !== "string" || typeof me["name"] !== "string") return null;
  const person: Person = {
    id: me["id"],
    name: me["name"],
    telegram: handle(me["telegram"]),
    x: handle(me["x"]),
    topics: strings(me["topics"]).filter(isTopicId) as TopicId[],
    intent: strings(me["intents"]).filter(isIntentId) as IntentId[],
    oneLiners: strings(me["one_liners"]),
    avatar: avatarOf(me["avatar"]),
    telegramVerified: me["telegram_verified"] === true,
    ticketVerified: me["ticket_verified"] === true,
    isDemo: false,
    isYou: true,
    origin: null,
    joinedAt: timeOf(me["joined_at"]),
  };
  return { person, hidden: me["status"] === "hidden" };
}

/** Google is linked to this session's account (so the bean survives signing out). */
export function hasGoogle(session: Session | null): boolean {
  return session?.user.identities?.some((identity) => identity.provider === "google") ?? false;
}

export async function currentSession(supabase: Supabase): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toBackendError(error);
  return data.session;
}

export async function fetchMe(supabase: Supabase): Promise<Me | null> {
  return meFrom(await rpc(supabase, "get_me", {}));
}

/**
 * Join (docs/prd/database.md §10.2): a Turnstile-checked anonymous session if you have none,
 * then your profile. If the profile is refused the session stays, so fixing the form and
 * submitting again doesn't need a new check. Editing your bean later goes the same way.
 */
export async function saveProfile(
  supabase: Supabase,
  input: JoinInput,
  captchaToken: string | null,
): Promise<Me> {
  await ensureSession(supabase, captchaToken);
  const { avatar } = input;
  const saved = await rpc(supabase, "upsert_profile", {
    name: input.name,
    topics: [...input.topics],
    intents: [...input.intent],
    one_liners: [...input.oneLiners],
    avatar: [avatar.skin, avatar.hair, avatar.hairColor, avatar.accessory],
    // The server turns empty handles into "none".
    telegram: input.telegram ?? "",
    x: input.x ?? "",
    consent: true,
  });
  const me = meFrom(saved);
  if (!me) throw new Error("upsert_profile returned no profile");
  return me;
}

/**
 * A Turnstile-checked anonymous session, unless this browser already has a session (joining,
 * claiming a bean, getting ready to claim with Telegram).
 */
export async function ensureSession(
  supabase: Supabase,
  captchaToken: string | null,
): Promise<void> {
  if (await currentSession(supabase)) return;
  const { error } = await supabase.auth.signInAnonymously({
    options: captchaToken ? { captchaToken } : {},
  });
  if (error) throw toBackendError(error);
}

/**
 * Claims the invited bean behind a claim link for this session, consent included (the claim
 * screen asks for it): docs-internal/prd/claim-your-bean.md §6.3.
 */
export async function claimBean(supabase: Supabase, token: string): Promise<Me> {
  const me = meFrom(await rpc(supabase, "claim_bean", { token, consent: true }));
  if (!me) throw new Error("claim_bean returned no profile");
  return me;
}

/** Where Google sends you back: this site's root. */
function returnUrl(): string {
  return location.origin + import.meta.env.BASE_URL;
}

/** "Save my bean": links Google to this (anonymous) account. Leaves the page for Google. */
export async function linkGoogle(supabase: Supabase): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: returnUrl() },
  });
  if (error) throw toBackendError(error);
}

/** "Sign in with Google" on another device. Leaves the page for Google. */
export async function signInGoogle(supabase: Supabase): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: returnUrl() },
  });
  if (error) throw toBackendError(error);
}

/** Leave coii: deletes the account (and with it every row about you), then the session. */
export async function deleteAccount(supabase: Supabase): Promise<void> {
  await invoke(supabase, "delete-account");
  await supabase.auth.signOut({ scope: "local" });
}

export async function signOut(supabase: Supabase): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toBackendError(error);
}

/**
 * An error Supabase Auth sent back in the address after a Google round trip (for example
 * `identity_already_exists`), removed from the address so a reload doesn't repeat it.
 */
export function takeAuthError(): string | null {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("error_code") ?? hash.get("error_code");
  if (!code) return null;
  for (const key of ["error", "error_code", "error_description"]) {
    url.searchParams.delete(key);
    hash.delete(key);
  }
  url.hash = hash.toString();
  history.replaceState(null, "", url);
  return code;
}
