import type { Session } from "@supabase/supabase-js";

import {
  arrivalText,
  followAddaTents,
  followEngine,
  initialState,
  mapActions,
  openJoinLink,
  panelActions,
  removeYou,
  toastActions,
  walkIn,
} from "@/app/controller";
import type { Actions, AppController, ToastActions } from "@/app/controller";
import type { JoinInput, JoinOutcome } from "@/app/joinTypes";
import { realClock } from "@/app/meet";
import { pointsReader } from "@/app/points";
import { createStore } from "@/app/store";
import type { AccountView, AppState, Score, Store } from "@/app/store";
import { createTrends } from "@/app/trends";
import type { TrendsController } from "@/app/trends";
import { BackendAdda } from "@/backend/adda";
import { invoke } from "@/backend/api";
import {
  deleteAccount,
  hasGoogle,
  linkGoogle,
  saveProfile,
  signInGoogle,
  signOut,
} from "@/backend/auth";
import { meFrom } from "@/backend/auth";
import type { Me } from "@/backend/auth";
import type { Supabase } from "@/backend/client";
import { toBackendError } from "@/backend/errors";
import { BackendMeet } from "@/backend/meet";
import type { Contact } from "@/backend/meetState";
import { PersonalChannel } from "@/backend/personal";
import type { TelegramLogin } from "@/backend/telegram";
import type { VenueEntry, VenueState, VenueUpdate } from "@/backend/venue";
import type { VenueSync } from "@/backend/venueSync";
import type { Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import { leaderboard, topIds } from "@/match/points";

const CROWNS = 3;
/** More walk-ins than this at once (you were away) scatter in quietly instead of parading. */
const PARADE_MAX = 10;
/** Arrival toasts per poll; the rest are summed up in one line. */
const ARRIVAL_TOASTS = 3;
/** "+1" pops per poll, so a busy minute doesn't turn into confetti everywhere. */
const POPS_MAX = 12;
/** A wave that comes with an adda join is announced by the adda, not as an anonymous wave. */
const COALESCE_MS = 800;

export interface BackendStart {
  readonly supabase: Supabase;
  readonly venue: VenueSync;
  /** The venue as first loaded; null when it couldn't be reached. */
  readonly venueState: VenueState | null;
  readonly session: Session | null;
  readonly me: Me | null;
  readonly prefill: Person | null;
  readonly turnstileSiteKey: string | null;
  readonly reducedMotion: boolean;
  /** Telegram sent you back with a signed login to check ("Verify with Telegram"). */
  readonly telegramLogin: TelegramLogin | null;
}

function accountOf(session: Session | null, me: Me | null): AccountView | null {
  return session ? { google: hasGoogle(session), hidden: me?.hidden ?? false } : null;
}

/** Everyone the venue holds, as the engine should first see them (you included, blocked not). */
export function venuePeople(state: VenueState | null, you: Person | null): Person[] {
  const people = [...(state?.entries.values() ?? [])]
    .map((e) => e.person)
    .filter((p) => p.id !== you?.id);
  return you ? [...people, you] : people;
}

/**
 * Backend mode (docs/prd/database.md §15): the venue comes from the database, and so do your
 * bean, Meet, waves, points and adda. No demo crowd and no simulated waves ever run here.
 */
class BackendApp {
  readonly store: Store<AppState>;
  readonly toasts: ToastActions;
  readonly meet: BackendMeet;
  readonly adda: BackendAdda;
  /** The narrative race: joins in the last 24 hours per booth, from the venue's join times. */
  private readonly trends: TrendsController;
  private readonly personal: PersonalChannel;
  private entries: ReadonlyMap<string, VenueEntry>;
  private contacts: ReadonlyMap<string, Contact> = new Map();
  private blocked: ReadonlySet<string> = new Set();
  private yourScore: Score = { p: 0, d: 0 };
  private crowned = "";
  private session: Session | null;
  private readonly addaJoins = new Set<string>();

  constructor(
    private readonly engine: EngineApi,
    private readonly start: BackendStart,
  ) {
    const you = start.me?.person ?? null;
    this.session = start.session;
    this.entries = start.venueState?.entries ?? new Map();
    const yours = you ? this.entries.get(you.id) : undefined;
    if (yours) this.yourScore = { p: yours.p, d: yours.d };
    this.store = createStore<AppState>({
      ...initialState({
        mode: "backend",
        people: [],
        you,
        reducedMotion: start.reducedMotion,
      }),
      account: accountOf(start.session, start.me),
      turnstileSiteKey: start.turnstileSiteKey,
      joinPrefill: you ? null : start.prefill,
    });
    this.toasts = toastActions(this.store);
    const { supabase } = start;
    this.meet = new BackendMeet({
      supabase,
      engine,
      store: this.store,
      pushToast: this.toasts.pushToast,
      onPoint: this.bump,
      onContacts: (contacts) => {
        this.contacts = new Map(contacts);
        this.project();
      },
      onBlocked: this.setBlocked,
      onYourPoints: (p, d) => {
        this.yourScore = { p, d };
        this.project();
      },
    });
    this.adda = new BackendAdda({
      supabase,
      engine,
      store: this.store,
      meet: this.meet,
      pushToast: this.toasts.pushToast,
    });
    this.trends = createTrends({ engine, store: this.store, clock: realClock });
    this.personal = new PersonalChannel(supabase, {
      waveIn: this.waveIn,
      chai: this.chai,
      addaInvite: this.adda.invited,
      addaJoined: this.addaJoined,
      poll: () => {
        void this.meet.sync();
        void this.adda.sync();
      },
    });
    this.project();
  }

  /** Starts the live parts: venue polling and, once you have a bean, your game loops. */
  begin(): void {
    this.start.venue.start({ onUpdate: this.venueUpdated, onError: this.venueFailed });
    this.trends.sync();
    if (this.store.get().you) this.enter();
    if (this.start.telegramLogin) void this.verifyTelegram(this.start.telegramLogin);
    this.start.supabase.auth.onAuthStateChange((event, session) => {
      this.session = session;
      // Signed out elsewhere (another tab, an expired refresh token): drop your bean here too.
      if (event === "SIGNED_OUT") {
        if (this.store.get().account) void this.forgetYou();
        return;
      }
      const account = this.store.get().account;
      if (session && account)
        this.store.set({ account: { ...account, google: hasGoogle(session) } });
    });
  }

  /** You have a bean: listen for personal events and load Meet and adda. */
  private enter(): void {
    const userId = this.session?.user.id;
    if (userId) void this.personal.open(userId);
    void this.meet.sync();
    void this.adda.sync();
  }

  // ---- the venue -------------------------------------------------------------------------------

  /** Rebuilds people and scores from the venue, your bean, handles you know and blocks. */
  private project(): void {
    const you = this.store.get().you;
    const people: Person[] = [];
    const npcs: Person[] = [];
    const scores = new Map<string, Score>();
    for (const entry of this.entries.values()) {
      const { person } = entry;
      if (person.id === you?.id || this.blocked.has(person.id)) continue;
      if (person.isNpc) {
        npcs.push(person);
        continue;
      }
      const contact = this.contacts.get(person.id);
      people.push(contact ? { ...person, ...contact } : person);
      scores.set(person.id, { p: entry.p, d: entry.d });
    }
    if (you) {
      people.push(you);
      scores.set(you.id, this.yourScore);
    }
    this.store.set({ people, npcs, scores });
    this.refreshCrowns();
  }

  private refreshCrowns(): void {
    const state = this.store.get();
    const ids = topIds(leaderboard(state.people, pointsReader(state)), CROWNS);
    const key = ids.join(",");
    if (key === this.crowned) return;
    this.crowned = key;
    this.engine.setCrowns(ids);
  }

  readonly venueUpdated = (update: VenueUpdate): void => {
    const you = this.store.get().you;
    const visible = (p: Person): boolean => p.id !== you?.id && !this.blocked.has(p.id);
    this.entries = update.state.entries;
    for (const id of update.removed) this.engine.remove(id);
    for (const person of update.updated.filter(visible)) {
      this.engine.remove(person.id);
      this.engine.spawn(person, false);
    }
    // NPCs walk on quietly: no toast, no race "+1".
    for (const npc of update.arrived.filter((p) => p.isNpc)) this.engine.spawn(npc, false);
    this.welcome(update.arrived.filter((p) => visible(p) && !p.isNpc));
    this.project();
    this.trends.sync();
    for (const id of update.gained.slice(0, POPS_MAX)) this.pop(id);
    this.adda.redraw();
  };

  private welcome(arrived: readonly Person[]): void {
    const parade = arrived.length <= PARADE_MAX;
    for (const person of arrived) this.engine.spawn(person, parade);
    for (const person of arrived.slice(0, ARRIVAL_TOASTS)) {
      this.toasts.pushToast(arrivalText(person), "waving_hand", "arrival");
      this.trends.arrived(person);
    }
    const rest = arrived.length - ARRIVAL_TOASTS;
    if (rest > 0) {
      this.toasts.pushToast(
        `+${rest} more ${rest === 1 ? "person" : "people"} just walked in`,
        "waving_hand",
        "arrival",
      );
    }
  }

  readonly venueFailed = (error: unknown): void => {
    // Polling carries on; only say something when the venue never loaded at all.
    if (this.entries.size === 0)
      this.toasts.pushToast(toBackendError(error).copy.text, null, "info");
  };

  // ---- points ------------------------------------------------------------------------------------

  private pop(id: string): void {
    this.store.set((s) => ({ points: { ...s.points, lastBump: { id, at: Date.now() } } }));
    this.engine.pointPop(id);
  }

  /** Someone earned a wave point just now: count it here until the next poll confirms it. */
  private readonly bump = (personId: string): void => {
    const entry = this.entries.get(personId);
    if (entry && personId !== this.store.get().you?.id) {
      const entries = new Map(this.entries);
      entries.set(personId, { ...entry, p: entry.p + 1, d: entry.d + 1 });
      this.entries = entries;
      this.project();
    }
    this.pop(personId);
  };

  private readonly setBlocked = (blocked: readonly string[]): void => {
    const next = new Set(blocked);
    for (const id of next) if (!this.blocked.has(id)) this.engine.remove(id);
    this.blocked = next;
    this.project();
  };

  // ---- personal events ---------------------------------------------------------------------------

  private readonly waveIn = (points: number): void => {
    this.meet.someoneWaved(points);
    window.setTimeout(() => {
      if (this.addaJoins.size > 0) return;
      this.toasts.pushToast("Someone waved at you! +1 wave point", "waving_hand", "success");
    }, COALESCE_MS);
  };

  private readonly chai = (personId: string): void => {
    window.setTimeout(() => {
      if (!this.addaJoins.has(personId)) this.meet.chaiStarted(personId);
    }, COALESCE_MS);
  };

  private readonly addaJoined = (addaId: string, personId: string): void => {
    this.addaJoins.add(personId);
    window.setTimeout(() => this.addaJoins.delete(personId), COALESCE_MS * 2);
    this.adda.memberJoined(addaId, personId);
  };

  // ---- you ---------------------------------------------------------------------------------------

  readonly join = async (input: JoinInput, captchaToken: string | null): Promise<JoinOutcome> => {
    const { supabase } = this.start;
    const before = this.store.get().you;
    try {
      const me = await saveProfile(supabase, input, captchaToken);
      this.session = await supabase.auth.getSession().then((r) => r.data.session);
      this.store.set({ account: accountOf(this.session, me), joinPrefill: null });
      if (before) this.engine.remove(before.id);
      walkIn(this.engine, this.store, me.person);
      this.project();
      if (!before) this.trends.arrived(me.person);
      this.toasts.pushToast(
        before ? "Saved! Your bean walks back in." : "You're in! Watch yourself walk in.",
        "party_popper",
        "success",
      );
      if (!before) this.enter();
      void this.start.venue.pollNow();
      return { ok: true, person: me.person };
    } catch (error) {
      // A refused profile keeps the new session, so the next submit needs no new check.
      this.session = await supabase.auth.getSession().then((r) => r.data.session);
      this.store.set({ account: accountOf(this.session, null) });
      return { ok: false, problem: toBackendError(error).copy };
    }
  };

  /**
   * Checks a Telegram login with `telegram-link`: on success your Telegram username becomes your
   * verified handle and the ✓ shows (on other maps after their next venue poll).
   */
  private async verifyTelegram(login: TelegramLogin): Promise<void> {
    if (!this.store.get().you) {
      this.toasts.pushToast("Join coii first, then verify with Telegram.", null, "info");
      return;
    }
    try {
      const me = meFrom(await invoke(this.start.supabase, "telegram-link", login));
      if (!me) throw new Error("telegram-link returned no profile");
      this.store.set({ you: me.person });
      this.project();
      this.toasts.pushToast(
        `Telegram verified: @${me.person.telegram ?? ""}. Your ✓ is on the map.`,
        "sparkles",
        "success",
      );
    } catch (error) {
      this.toasts.pushToast(toBackendError(error).copy.text, null, "info");
    }
  }

  /** Clears you out locally after leaving or signing out. */
  private async forgetYou(): Promise<void> {
    await this.personal.close();
    removeYou(this.engine, this.store);
    this.meet.reset();
    this.adda.reset();
    this.yourScore = { p: 0, d: 0 };
    this.session = null;
    this.store.set({ account: null, overlay: "none", joinTopic: null });
    this.project();
    this.trends.sync();
  }

  readonly leave = async (): Promise<boolean> => {
    if (!this.store.get().you) return false;
    try {
      await deleteAccount(this.start.supabase);
    } catch (error) {
      this.toasts.pushToast(toBackendError(error).copy.text, null, "info");
      return false;
    }
    const you = this.store.get().you;
    if (you) {
      // Gone from the database already; don't let the cached venue walk you back in.
      const entries = new Map(this.entries);
      entries.delete(you.id);
      this.entries = entries;
    }
    await this.forgetYou();
    this.toasts.pushToast("You left coii. Come back anytime.", "waving_hand", "info");
    void this.start.venue.pollNow();
    return true;
  };

  readonly signOut = async (): Promise<void> => {
    try {
      await signOut(this.start.supabase);
      await this.forgetYou();
      this.toasts.pushToast(
        "Signed out. Sign in with Google to get your bean back.",
        "waving_hand",
        "info",
      );
    } catch (error) {
      this.toasts.pushToast(toBackendError(error).copy.text, null, "info");
    }
  };

  /** Google round trips leave the page; only a failure to start one lands back here. */
  readonly google = async (go: (supabase: Supabase) => Promise<void>): Promise<void> => {
    try {
      await go(this.start.supabase);
    } catch (error) {
      this.toasts.pushToast(toBackendError(error).copy.text, null, "info");
    }
  };
}

/** Builds the app for backend mode. The venue must already be loaded (see `bootBackend`). */
export function createBackendController(engine: EngineApi, start: BackendStart): AppController {
  const app = new BackendApp(engine, start);
  const { store, meet, adda } = app;
  const actions: Actions = {
    ...panelActions(engine, store),
    ...mapActions(engine, store),
    ...app.toasts,
    join: app.join,
    leave: app.leave,
    revealCard: meet.revealCard,
    wave: meet.wave,
    skip: meet.skip,
    dismissChai: meet.dismissChai,
    markMessaged: meet.markMessaged,
    confirmMet: meet.confirmMet,
    unmatch: meet.unmatch,
    toggleTribe: meet.toggleTribe,
    createAdda: adda.createAdda,
    editAdda: adda.editAdda,
    deleteAdda: adda.deleteAdda,
    inviteToAdda: adda.inviteToAdda,
    waveAndAdd: adda.waveAndAdd,
    removeFromAdda: adda.removeFromAdda,
    acceptAddaInvite: adda.acceptAddaInvite,
    declineAddaInvite: adda.declineAddaInvite,
    leaveAdda: adda.leaveAdda,
    viewAdda: adda.viewAdda,
    focusAdda: adda.focusAdda,
    moveAdda: adda.moveAdda,
    dismissAddaDrop: adda.dismissAddaDrop,
    shareAdda: adda.shareAdda,
    report: meet.report,
    block: meet.block,
    saveBean: () => app.google(linkGoogle),
    signInWithGoogle: () => app.google(signInGoogle),
    signOut: app.signOut,
  };
  followEngine(engine, store);
  followAddaTents(engine, store, adda);
  app.begin();
  return {
    store,
    actions,
    // Backend mode has no simulated crowd: arrivals come from the database.
    startArrivals: () => () => undefined,
    startDemoWaves: () => () => undefined,
    openJoinLink: (topic) => openJoinLink(store, actions, topic),
  };
}
