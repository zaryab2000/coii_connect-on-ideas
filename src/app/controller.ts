import { createAdda } from "@/app/adda";
import type { AddaActions, AddaController } from "@/app/adda";
import type { JoinInput, JoinOutcome } from "@/app/joinTypes";
import { createMeet, realClock } from "@/app/meet";
import type { MeetActions, MeetClock, MeetController } from "@/app/meet";
import { createPoints, loadPoints } from "@/app/points";
import type { PointsController } from "@/app/points";
import { createStore } from "@/app/store";
import type { AppMode, AppState, Overlay, Panel, Store, Toast } from "@/app/store";
import { createTrends } from "@/app/trends";
import type { TrendsController } from "@/app/trends";
import { clearYou, saveYou } from "@/data/localUser";
import type { ReportReason } from "@/data/report";
import type { PeopleSource } from "@/data/source";
import { topicById } from "@/data/topics";
import type { IconId, Person, TopicId } from "@/data/types";
import type { EngineApi } from "@/engine/types";

/** Your account in backend mode: safety tools and Google. Demo mode never shows these. */
export interface AccountActions {
  /** Reports someone to the moderators; three reports hide a bean. Resolves false on failure. */
  report(personId: string, reason: ReportReason): Promise<boolean>;
  /** Blocks someone: no waves, chais or addas between you, ever. Resolves false on failure. */
  block(personId: string): Promise<boolean>;
  /** "Save my bean": links Google so the bean survives this browser (redirects to Google). */
  saveBean(): Promise<void>;
  /** "Already joined? Sign in with Google" on another device (redirects to Google). */
  signInWithGoogle(): Promise<void>;
  /** Signs out but keeps the bean; only offered when Google is linked. */
  signOut(): Promise<void>;
}

export interface Actions extends MeetActions, AddaActions, AccountActions {
  selectPerson(id: string | null): void;
  locate(id: string): void;
  openBooth(topic: TopicId): void;
  openPanel(panel: Panel): void;
  closePanel(): void;
  /** Shows About or your own profile as a centred overlay above the moving venue. */
  openOverlay(overlay: Exclude<Overlay, "none">): void;
  closeOverlay(): void;
  /** Opens your profile overlay on the form, optionally with a topic preselected (or added). */
  startJoin(topic: TopicId | null): void;
  /** The invite card, its link starting at this booth (or any booth). */
  openInvite(topic: TopicId | null): void;
  toggleHighlight(topic: TopicId): void;
  clearHighlight(): void;
  fit(): void;
  /**
   * Puts your bean on the map, or saves your edits. Backend mode needs a Turnstile token the
   * first time (no session yet); demo mode ignores it.
   */
  join(input: JoinInput, captchaToken: string | null): Promise<JoinOutcome>;
  /** Takes your bean off coii for good. Resolves false if it didn't work (you stay). */
  leave(): Promise<boolean>;
  pushToast(text: string, icon: IconId | null, tone: Toast["tone"]): void;
  dismissToast(id: number): void;
}

export interface AppController {
  readonly store: Store<AppState>;
  readonly actions: Actions;
  /** Starts live arrivals; returns a stop function. */
  startArrivals(source: PeopleSource): () => void;
  /** Starts the demo crowd waving at each other (live wave points); returns a stop function. */
  startDemoWaves(): () => void;
  /**
   * Someone opened a shared join link: the join form opens straight away (with the booth the
   * link names), or your profile if you've already joined in this browser.
   */
  openJoinLink(topic: TopicId | null): void;
}

export interface ControllerOptions {
  readonly people: readonly Person[];
  readonly you: Person | null;
  readonly reducedMotion: boolean;
  /** Time, randomness and timers for Meet; defaults to the real ones. */
  readonly clock?: MeetClock;
}

export type AppStore = Store<AppState>;

/** "Rahul just walked in · DeFi + Privacy". */
export function arrivalText(person: Person): string {
  const topics = person.topics.map((t) => topicById(t).short).join(" + ");
  return `${person.name.split(" ")[0] ?? person.name} just walked in · ${topics}`;
}

function newId(): string {
  return `you-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function personFromJoin(input: JoinInput): Person {
  return {
    id: newId(),
    name: input.name.trim(),
    telegram: input.telegram,
    x: input.x,
    topics: [...input.topics],
    intent: [...input.intent],
    oneLiners: [...input.oneLiners],
    avatar: input.avatar,
    telegramVerified: false,
    ticketVerified: false,
    isDemo: false,
    isYou: true,
    origin: null,
    joinedAt: Date.now(),
  };
}

export interface InitialState {
  readonly mode: AppMode;
  readonly people: readonly Person[];
  readonly you: Person | null;
  readonly reducedMotion: boolean;
}

/** App state before anything happened; both modes start here. */
export function initialState(init: InitialState): AppState {
  return {
    mode: init.mode,
    people: init.you ? [...init.people, init.you] : [...init.people],
    scores: null,
    account: null,
    turnstileSiteKey: null,
    joinPrefill: null,
    selectedId: null,
    boothTopic: null,
    panel: "none",
    overlay: "none",
    highlight: [],
    framed: false,
    joinTopic: null,
    you: init.you,
    toasts: [],
    meet: null,
    adda: null,
    addaDrop: null,
    shareAddaId: null,
    inviteTopic: null,
    lastArrival: null,
    race: { rows: [], hot: null },
    tribe: false,
    points: { extra: new Map(), lastBump: null },
    reducedMotion: init.reducedMotion,
    ready: false,
  };
}

/** Clears the map selection, e.g. when the profile gives way to another panel. */
function deselect(engine: EngineApi, store: AppStore): void {
  if (store.get().selectedId === null) return;
  engine.select(null);
  store.set({ selectedId: null });
}

/** Takes you off the map (and, in demo mode, out of storage); returns who was removed. */
export function removeYou(engine: EngineApi, store: AppStore): Person | null {
  const you = store.get().you;
  if (!you) return null;
  if (store.get().mode === "demo") clearYou();
  engine.remove(you.id);
  store.set((s) => ({
    you: null,
    people: s.people.filter((p) => p.id !== you.id),
    selectedId: s.selectedId === you.id ? null : s.selectedId,
    panel: s.selectedId === you.id ? "none" : s.panel,
  }));
  return you;
}

export type ToastActions = Pick<Actions, "pushToast" | "dismissToast">;

export function toastActions(store: AppStore): ToastActions {
  let toastId = 0;
  return {
    pushToast(text, icon, tone) {
      toastId += 1;
      const toast: Toast = { id: toastId, text, icon, tone };
      store.set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    },
    dismissToast(id) {
      store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
  };
}

function isYourId(store: AppStore, id: string | null): boolean {
  return id !== null && store.get().you?.id === id;
}

/** Your own bean opens the "you" overlay instead of a profile panel. */
function openYou(engine: EngineApi, store: AppStore): void {
  engine.select(null);
  store.set((s) => ({
    overlay: "you",
    selectedId: null,
    panel: s.panel === "profile" ? "none" : s.panel,
    framed: false,
  }));
}

/** Flies to your bean with every panel and overlay out of the way, so you can see yourself. */
function showYouOnMap(engine: EngineApi, store: AppStore, id: string): void {
  store.set({ selectedId: id, panel: "none", overlay: "none", framed: false, joinTopic: null });
  engine.locate(id);
}

export type PanelActions = Pick<
  Actions,
  | "selectPerson"
  | "locate"
  | "openBooth"
  | "openPanel"
  | "closePanel"
  | "openOverlay"
  | "closeOverlay"
  | "startJoin"
  | "openInvite"
>;

export function panelActions(engine: EngineApi, store: AppStore): PanelActions {
  const openPanel = (panel: Panel): void => {
    if (panel !== "profile") deselect(engine, store);
    store.set({ panel });
  };
  return {
    selectPerson(id) {
      if (isYourId(store, id)) return openYou(engine, store);
      store.set({ selectedId: id, panel: id ? "profile" : "none", framed: false });
      engine.select(id);
    },
    locate(id) {
      if (isYourId(store, id)) return showYouOnMap(engine, store, id);
      store.set({ selectedId: id, panel: "profile", overlay: "none", framed: true });
      engine.locate(id);
    },
    openBooth(topic) {
      deselect(engine, store);
      store.set({ boothTopic: topic, panel: "booth", overlay: "none", framed: true });
      engine.focusBooth(topic);
    },
    openPanel,
    closePanel() {
      deselect(engine, store);
      store.set({ panel: "none", framed: false });
    },
    openOverlay(overlay) {
      store.set({ overlay, joinTopic: null, inviteTopic: null });
    },
    closeOverlay() {
      store.set({ overlay: "none", joinTopic: null, inviteTopic: null });
    },
    openInvite(topic) {
      store.set({ overlay: "invite", joinTopic: null, inviteTopic: topic });
    },
    startJoin(topic) {
      store.set({ overlay: "you", joinTopic: topic });
    },
  };
}

export type MapActions = Pick<Actions, "toggleHighlight" | "clearHighlight" | "fit">;

export function mapActions(engine: EngineApi, store: AppStore): MapActions {
  return {
    toggleHighlight(topic) {
      const current = store.get().highlight;
      const highlight = current.includes(topic)
        ? current.filter((t) => t !== topic)
        : [...current, topic];
      store.set({ highlight });
      engine.highlightTopics(highlight);
    },
    clearHighlight() {
      store.set({ highlight: [] });
      engine.highlightTopics([]);
    },
    fit() {
      store.set({ framed: false });
      engine.fit();
    },
  };
}

/** You just walked in (or back in): every panel closes and your bean comes in from the gate. */
export function walkIn(engine: EngineApi, store: AppStore, person: Person): void {
  store.set((s) => ({
    you: person,
    people: [...s.people.filter((p) => p.id !== person.id), person],
    panel: "none",
    overlay: "none",
    selectedId: null,
    framed: false,
    joinTopic: null,
  }));
  engine.select(null);
  engine.spawn(person, true);
}

/** The demo game loops that follow you in and out. */
interface Loops {
  readonly meet: MeetController;
  readonly adda: AddaController;
  readonly points: PointsController;
  readonly trends: TrendsController;
}

function youActions(
  engine: EngineApi,
  store: AppStore,
  toasts: ToastActions,
  { meet, adda, points, trends }: Loops,
): Pick<Actions, "join" | "leave"> {
  return {
    join(input) {
      removeYou(engine, store);
      const person = personFromJoin(input);
      const saved = saveYou(person);
      walkIn(engine, store, person);
      trends.arrived(person);
      meet.forget();
      meet.sync();
      adda.forget();
      adda.sync();
      points.refreshCrowns();
      toasts.pushToast(
        saved
          ? "You're in! Watch yourself walk in."
          : "You're in for this visit (this browser can't save it).",
        "party_popper",
        "success",
      );
      return Promise.resolve({ ok: true, person });
    },
    leave() {
      if (!removeYou(engine, store)) return Promise.resolve(false);
      store.set({ overlay: "none", joinTopic: null });
      meet.forget();
      adda.forget();
      trends.sync();
      points.refreshCrowns();
      toasts.pushToast("You left coii. Come back anytime.", "waving_hand", "info");
      return Promise.resolve(true);
    },
  };
}

/** Mirrors taps on the map (beans, empty floor, booth signs) into app state. */
export function followEngine(engine: EngineApi, store: AppStore): void {
  engine.on("ready", () => store.set({ ready: true }));
  engine.on("select", (id) => {
    if (isYourId(store, id)) openYou(engine, store);
    // The engine centres a tapped bean, so the phone layout can lift it above the sheet.
    else if (id) store.set({ selectedId: id, panel: "profile", framed: true });
    else if (store.get().panel === "profile")
      store.set({ selectedId: null, panel: "none", framed: false });
    else store.set({ selectedId: null });
  });
  engine.on("boothTap", (topic) => {
    deselect(engine, store);
    store.set({ boothTopic: topic, panel: "booth", framed: true });
  });
}

function meetActionsOf(meet: MeetController): MeetActions {
  return {
    revealCard: meet.revealCard,
    wave: (personId) => Promise.resolve(meet.wave(personId)),
    skip: meet.skip,
    dismissChai: meet.dismissChai,
    markMessaged: meet.markMessaged,
    confirmMet: meet.confirmMet,
    unmatch: meet.unmatch,
    toggleTribe: meet.toggleTribe,
  };
}

function addaActionsOf(adda: AddaController): AddaActions {
  return {
    createAdda: (look, name) => Promise.resolve(adda.createAdda(look, name)),
    editAdda: adda.editAdda,
    deleteAdda: adda.deleteAdda,
    inviteToAdda: (personId, addaId) => Promise.resolve(adda.inviteToAdda(personId, addaId)),
    waveAndAdd: (personId, addaId) => Promise.resolve(adda.waveAndAdd(personId, addaId)),
    removeFromAdda: adda.removeFromAdda,
    acceptAddaInvite: adda.acceptAddaInvite,
    declineAddaInvite: adda.declineAddaInvite,
    leaveAdda: adda.leaveAdda,
    viewAdda: adda.viewAdda,
    focusAdda: adda.focusAdda,
    moveAdda: adda.moveAdda,
    dismissAddaDrop: adda.dismissAddaDrop,
    shareAdda: adda.shareAdda,
  };
}

/** Demo mode has no accounts: the UI never offers these, and they do nothing. */
const demoAccount: AccountActions = {
  report: () => Promise.resolve(false),
  block: () => Promise.resolve(false),
  saveBean: () => Promise.resolve(),
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};

/** Taps, drags and drops on adda tents. */
export function followAddaTents(
  engine: EngineApi,
  store: AppStore,
  adda: Pick<AddaController, "moveAdda" | "beanDropped">,
): void {
  engine.on("addaTap", () => {
    deselect(engine, store);
    store.set({ panel: "adda", framed: false });
  });
  engine.on("addaMoved", adda.moveAdda);
  engine.on("beanDropped", adda.beanDropped);
}

/** Someone opened a shared join link: the join form, or your profile if you're already in. */
export function openJoinLink(store: AppStore, actions: Actions, topic: TopicId | null): void {
  if (!store.get().you) {
    actions.startJoin(topic);
    return;
  }
  actions.openOverlay("you");
  actions.pushToast("You're already on coii. Here's your bean.", "waving_hand", "info");
}

/**
 * Demo mode: owns app state, keeps the engine in sync with it and runs the game loops in this
 * browser. UI components only call `actions`.
 */
export function createController(engine: EngineApi, options: ControllerOptions): AppController {
  const store = createStore<AppState>({
    ...initialState({ mode: "demo", ...options }),
    points: loadPoints(),
  });
  const toasts = toastActions(store);
  const clock = options.clock ?? realClock;
  const points = createPoints(engine, store, clock);
  const meet = createMeet({
    engine,
    store,
    pushToast: toasts.pushToast,
    clock,
    onPoint: points.bump,
  });
  const adda = createAdda({ engine, store, meet, pushToast: toasts.pushToast, clock });
  const trends = createTrends({ engine, store, clock });
  const actions: Actions = {
    ...panelActions(engine, store),
    ...mapActions(engine, store),
    ...youActions(engine, store, toasts, { meet, adda, points, trends }),
    ...toasts,
    ...meetActionsOf(meet),
    ...addaActionsOf(adda),
    ...demoAccount,
  };
  followEngine(engine, store);
  followAddaTents(engine, store, adda);
  meet.sync();
  adda.sync();
  points.refreshCrowns();
  trends.sync();

  return {
    store,
    actions,
    startArrivals(source) {
      return source.start((person) => {
        store.set((s) => ({ people: [...s.people, person] }));
        engine.spawn(person, true);
        trends.arrived(person);
        actions.pushToast(arrivalText(person), "waving_hand", "arrival");
      });
    },
    startDemoWaves: points.startDemoWaves,
    openJoinLink: (topic) => openJoinLink(store, actions, topic),
  };
}
