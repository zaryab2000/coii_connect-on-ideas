/** Build-time settings. Only public values: the publishable key and the Turnstile site key. */
interface ImportMetaEnv {
  /** Backend mode when this and the publishable key are set; demo mode when either is empty. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
