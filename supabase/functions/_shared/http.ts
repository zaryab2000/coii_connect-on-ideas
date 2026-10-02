// Shared plumbing for coii's Edge Functions: CORS allow-list, the signed-in caller, errors as
// `{ error: "coii:<code>" }` with a 4xx status (docs/prd/database.md §9).
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** CORS headers for an allowed origin (none when the request had no Origin). */
export function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/** 204 No Content, still with CORS headers so the browser lets the app see it succeeded. */
export function noContent(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function fail(code: string, status: number, origin: string | null): Response {
  return json({ error: `coii:${code}` }, status, origin);
}

/** The `coii:<code>` inside a database error message, or `server_error`. */
export function codeOf(message: string | undefined): string {
  return /coii:([a-z_]+)/.exec(message ?? "")?.[1] ?? "server_error";
}

export interface Caller {
  readonly user: User;
  /** Secret-key client for the internal database functions. */
  readonly admin: SupabaseClient;
  readonly origin: string | null;
}

export type Handler = (req: Request, caller: Caller) => Promise<Response>;

/** What a request needs from the outside world; faked in tests. */
export interface Deps {
  readonly allowedOrigins: readonly string[];
  readonly userOf: (req: Request) => Promise<User | null>;
  readonly admin: () => SupabaseClient;
}

/** Answers what doesn't need a session: refused origins, preflights, wrong methods. */
function gate(req: Request, origin: string | null, allowed: readonly string[]): Response | null {
  if (origin && !allowed.includes(origin)) return fail("origin_not_allowed", 403, null);
  if (req.method === "OPTIONS") return noContent(origin);
  if (req.method !== "POST") return fail("method_not_allowed", 405, origin);
  return null;
}

/** Puts CORS headers on a handler's response if it didn't set them (belt and braces). */
function withCors(res: Response, origin: string | null): Response {
  if (!origin || res.headers.has("Access-Control-Allow-Origin")) return res;
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * One request: refuses origins that aren't allowed (browsers send `Origin`; other clients don't,
 * and still need a valid session), answers preflights, requires POST and a signed-in user, and
 * turns thrown errors into a 500 without leaking details. Every response to an allowed origin
 * carries CORS headers, or the browser would hide it from the app.
 */
export async function handle(req: Request, handler: Handler, deps: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const early = gate(req, origin, deps.allowedOrigins);
  if (early) return early;
  try {
    // Inside the try: a configuration error here (missing key, bad env) must still answer with
    // CORS headers, or the browser shows a network error instead of our 500.
    const user = await deps.userOf(req);
    if (!user) return fail("not_signed_in", 401, origin);
    return withCors(await handler(req, { user, admin: deps.admin(), origin }), origin);
  } catch (thrown) {
    console.error("edge function failed", thrown);
    return fail("server_error", 500, origin);
  }
}

function env(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

/**
 * A project key: the new `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` JSON (`default`
 * entry), falling back to the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function projectKey(keysVar: string, legacyVar: string): string {
  const keys = env(keysVar);
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    const key = parsed["default"] ?? Object.values(parsed)[0];
    if (key) return key;
  }
  const legacy = env(legacyVar);
  if (!legacy) throw new Error(`Edge Function environment has neither ${keysVar} nor ${legacyVar}`);
  return legacy;
}

function supabaseUrl(): string {
  const url = env("SUPABASE_URL");
  if (!url) throw new Error("Edge Function environment is missing SUPABASE_URL");
  return url;
}

const realDeps: Deps = {
  get allowedOrigins() {
    return (env("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  async userOf(req) {
    const asUser = createClient(
      supabaseUrl(),
      projectKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      },
    );
    const { data, error } = await asUser.auth.getUser();
    return error ? null : data.user;
  },
  admin: () =>
    createClient(supabaseUrl(), projectKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    }),
};

export function serve(handler: Handler): void {
  Deno.serve((req) => handle(req, handler, realDeps));
}
