import { clearAdda } from "@/adda/storage";
import type { AppController } from "@/app/controller";
import { clearPoints } from "@/app/points";
import { rpc } from "@/backend/api";
import { currentSession, fetchMe, takeAuthError } from "@/backend/auth";
import type { Me } from "@/backend/auth";
import { createSupabase } from "@/backend/client";
import type { Supabase } from "@/backend/client";
import type { BackendConfig } from "@/backend/config";
import { createBackendController, venuePeople } from "@/backend/controller";
import { errorCopy, toBackendError } from "@/backend/errors";
import { takeTelegramLogin } from "@/backend/telegram";
import type { VenueState } from "@/backend/venue";
import { VenueSync } from "@/backend/venueSync";
import { clearYou, loadYou } from "@/data/localUser";
import type { Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import { clearMeet } from "@/match/storage";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The snapshot through the same-origin CDN-cached route (api/venue.js, PRD §13): Supabase
 * serves it about once a minute however many people open the site.
 */
async function cachedSnapshot(): Promise<unknown> {
  const response = await fetch("/api/venue", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`/api/venue answered ${response.status}`);
  return response.json();
}

/**
 * A profile from demo mode in this browser: offered once to prefill the join form, then every
 * demo-mode key is deleted (docs/prd/database.md §15).
 */
function takeDemoProfile(): Person | null {
  const profile = loadYou();
  clearYou();
  clearMeet();
  clearPoints();
  clearAdda();
  return profile;
}

async function loadVenue(venue: VenueSync): Promise<{ state: VenueState | null; error: unknown }> {
  try {
    return { state: await venue.load(), error: null };
  } catch (error) {
    return { state: null, error };
  }
}

async function loadMe(
  supabase: Supabase,
  signedIn: boolean,
): Promise<{ me: Me | null; error: unknown }> {
  if (!signedIn) return { me: null, error: null };
  try {
    return { me: await fetchMe(supabase), error: null };
  } catch (error) {
    return { me: null, error };
  }
}

/** Copy for a Google round trip that came back with an error. */
function authErrorText(code: string): string {
  if (code === "identity_already_exists") {
    return "That Google account already has a bean. To use it here, leave coii on this device, then sign in with Google.";
  }
  return errorCopy(code).text;
}

/**
 * Starts backend mode: loads the venue (cache plus delta, or the snapshot) and your session
 * before the map mounts, so the booths are sized for the people actually there.
 */
export async function bootBackend(
  config: BackendConfig,
  engine: EngineApi,
  reducedMotion: boolean,
): Promise<AppController> {
  const authError = takeAuthError();
  const telegramLogin = takeTelegramLogin();
  const supabase = createSupabase(config);
  const venue = new VenueSync(
    {
      snapshot: () =>
        cachedSnapshot().catch((error: unknown) => {
          // The site still works if the cache route is down; it just reads the database.
          console.warn("/api/venue failed; reading the snapshot from Supabase directly", error);
          return rpc(supabase, "get_venue", {});
        }),
      changes: (since) => rpc(supabase, "get_venue_changes", { since }),
    },
    storage(),
  );
  const [loaded, session] = await Promise.all([
    loadVenue(venue),
    currentSession(supabase).catch(() => null),
  ]);
  const { me, error: meError } = await loadMe(supabase, session !== null);
  const prefill = me ? null : takeDemoProfile();
  engine.setPeople(venuePeople(loaded.state, me?.person ?? null));
  const controller = createBackendController(engine, {
    supabase,
    venue,
    venueState: loaded.state,
    session,
    me,
    prefill,
    turnstileSiteKey: config.turnstileSiteKey,
    reducedMotion,
    telegramLogin,
  });
  const { pushToast } = controller.actions;
  for (const error of [loaded.error, meError]) {
    if (error) pushToast(toBackendError(error).copy.text, null, "info");
  }
  if (authError) pushToast(authErrorText(authError), null, "info");
  return controller;
}
