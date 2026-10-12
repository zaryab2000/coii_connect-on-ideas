// @ts-check
// Vercel Function: GET /api/venue, the venue snapshot (`get_venue()`) through Vercel's CDN, so
// Supabase serves it about once a minute instead of once per visitor (docs/prd/database.md §13,
// pre-release tracker P15). Uses only the public URL and publishable key; deltas still go to
// Supabase directly. Plain JavaScript so Vercel can run it without compiling TypeScript.

/** Shared caches keep a snapshot for 60 s, then serve it stale for up to 60 s while refreshing. */
export const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=60";

/** Never cache an error: the next request should try again. */
const NO_STORE = "no-store";

/**
 * @param {number} status
 * @param {string} body
 * @param {string} cacheControl
 * @returns {Response}
 */
function reply(status, body, cacheControl) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
  });
}

/**
 * The snapshot response for these settings. `fetchImpl` is injectable for tests.
 *
 * @param {{ readonly url?: string | undefined, readonly key?: string | undefined }} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Response>}
 */
export async function venueResponse(env, fetchImpl = fetch) {
  if (!env.url || !env.key) {
    return reply(503, '{"error":"coii:not_configured"}', NO_STORE);
  }
  let upstream;
  try {
    upstream = await fetchImpl(`${env.url.replace(/\/+$/, "")}/rest/v1/rpc/get_venue`, {
      method: "POST",
      headers: { apikey: env.key, "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    return reply(502, '{"error":"coii:server_error"}', NO_STORE);
  }
  if (!upstream.ok) return reply(502, '{"error":"coii:server_error"}', NO_STORE);
  return reply(200, await upstream.text(), CACHE_CONTROL);
}

/** @returns {Promise<Response>} */
export function GET() {
  return venueResponse({
    url: process.env["VITE_SUPABASE_URL"],
    key: process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  });
}
