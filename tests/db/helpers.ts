import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cloudflare's always-pass Turnstile token; the local stack uses the matching test secret. */
const CAPTCHA = "XXXX.DUMMY.TOKEN.XXXX";

function env(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`${name} is missing: run the database tests with \`pnpm test:db\`.`);
  return value;
}

export const SUPABASE_URL = env("COII_TEST_SUPABASE_URL");
export const PUBLISHABLE_KEY = env("COII_TEST_SUPABASE_PUBLISHABLE_KEY");
const SECRET_KEY = env("COII_TEST_SUPABASE_SECRET_KEY");
/** The fake bot token the local Edge Functions run with. */
export const TEST_BOT_TOKEN = env("COII_TEST_TELEGRAM_BOT_TOKEN");
/** An origin on the Edge Functions' allow list. */
export const ALLOWED_ORIGIN = env("COII_TEST_ORIGIN");

function client(key: string): SupabaseClient {
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A visitor with no session: only the venue functions work. */
export function visitor(): SupabaseClient {
  return client(PUBLISHABLE_KEY);
}

/** The secret key (service role), as the Edge Functions use it. */
export function service(): SupabaseClient {
  return client(SECRET_KEY);
}

export interface Member {
  readonly client: SupabaseClient;
  readonly userId: string;
}

/** A fresh anonymous session (what "Join" creates before the profile is saved). */
export async function signIn(): Promise<Member> {
  const supabase = visitor();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { captchaToken: CAPTCHA },
  });
  if (error || !data.user) throw new Error(`anonymous sign-in failed: ${error?.message}`);
  return { client: supabase, userId: data.user.id };
}

let handles = 0;

/** A unique, valid handle for this run. */
export function handle(prefix: string): string {
  handles += 1;
  return `${prefix}${Date.now().toString(36)}${handles}`.slice(0, 15);
}

export interface Profile {
  readonly name: string;
  readonly topics: readonly string[];
  readonly intents: readonly string[];
  readonly one_liners: readonly string[];
  readonly avatar: readonly number[];
  readonly telegram: string | null;
  readonly x: string | null;
  readonly consent: boolean;
}

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test Person",
    topics: ["privacy"],
    intents: [],
    one_liners: [],
    avatar: [1, 2, 3, 0],
    telegram: handle("tg"),
    x: null,
    consent: true,
    ...overrides,
  };
}

export interface Me {
  readonly id: string;
  readonly name: string;
  readonly one_liners: readonly string[];
  readonly telegram: string | null;
  readonly x: string | null;
  readonly points: number;
}

/** Calls an RPC and throws on error, so tests read like the happy path. */
export async function call<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Signs in and saves a profile, like the join form does. */
export async function join(overrides: Partial<Profile> = {}): Promise<Member & { me: Me }> {
  const member = await signIn();
  const me = await call<Me>(member.client, "upsert_profile", { ...profile(overrides) });
  return { ...member, me };
}

/** Removes test users (and, by cascade, their beans) so runs don't pile up. */
export async function cleanup(userIds: readonly string[]): Promise<void> {
  const admin = service();
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
}

export interface Venue {
  readonly cursor: string;
  readonly day: string;
  readonly id: readonly string[];
  readonly n: readonly string[];
  readonly p: readonly number[];
  readonly d: readonly number[];
}

export interface VenueChanges {
  readonly full: boolean;
  readonly cursor: string;
  readonly people: { readonly id: readonly string[] };
  readonly points: { readonly id: readonly string[]; readonly p: readonly number[] };
  readonly removed: readonly string[];
}
