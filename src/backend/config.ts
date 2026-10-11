/** What backend mode needs to reach the shared database (docs/prd/database.md §15). */
export interface BackendConfig {
  readonly url: string;
  /** The publishable key (`sb_publishable_…`): the only Supabase credential the browser holds. */
  readonly publishableKey: string;
  /** Cloudflare Turnstile site key (public); joining needs it. */
  readonly turnstileSiteKey: string | null;
}

/** The env values this module reads; `import.meta.env` in the app. */
export interface BackendEnv {
  readonly VITE_SUPABASE_URL?: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  readonly VITE_TURNSTILE_SITE_KEY?: string | undefined;
}

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Backend mode when the URL and the publishable key are both set; demo mode (null) otherwise. */
export function backendConfig(env: BackendEnv): BackendConfig | null {
  const url = value(env.VITE_SUPABASE_URL);
  const publishableKey = value(env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) return null;
  return { url, publishableKey, turnstileSiteKey: value(env.VITE_TURNSTILE_SITE_KEY) };
}
