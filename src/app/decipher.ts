/**
 * The Decipher Club welcome card shows at most once per browser: right after your first join or
 * a claim, never on reload or after an edit (docs-internal/prd/decipher-club-plugs.md §3.1).
 */

export const WELCOME_KEY = "coii:decipher:welcome:v1";

/** Remembers the card for this page load when storage is blocked (then it's once per session). */
let shownThisSession = false;

/**
 * Whether the welcome card may show now; if so, it's marked as seen straight away, so a reload or
 * a second claim never shows it again.
 */
export function takeWelcome(storage: Storage | null): boolean {
  if (shownThisSession) return false;
  shownThisSession = true;
  try {
    if (!storage) return true;
    if (storage.getItem(WELCOME_KEY) !== null) return false;
    storage.setItem(WELCOME_KEY, "seen");
  } catch {
    // Storage blocked: fall back to once per session.
  }
  return true;
}

/** Tests only: forget this page load's "shown". */
export function resetWelcomeSession(): void {
  shownThisSession = false;
}
