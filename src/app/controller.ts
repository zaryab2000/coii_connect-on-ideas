import { createAdda } from "@/app/adda";
import type { AddaActions, AddaController } from "@/app/adda";
import { createMeet, realClock } from "@/app/meet";
import type { MeetActions, MeetClock, MeetController } from "@/app/meet";
import { createPoints, loadPoints } from "@/app/points";
import type { PointsController } from "@/app/points";
import { createStore } from "@/app/store";
import type { AppState, Overlay, Panel, Store, Toast } from "@/app/store";
import { createTrends } from "@/app/trends";
import type { TrendsController } from "@/app/trends";
import { clearYou, saveYou } from "@/data/localUser";
import type { PeopleSource } from "@/data/source";
import { topicById } from "@/data/topics";
import type { Avatar, IconId, IntentId, Person, TopicId } from "@/data/types";
import type { EngineApi } from "@/engine/types";

export interface JoinInput {
  readonly name: string;
  readonly telegram: string | null;
  readonly x: string | null;
  readonly topics: readonly TopicId[];
  readonly intent: readonly IntentId[];
  readonly oneLiners: readonly string[];
  readonly avatar: Avatar;
}

export interface Actions extends MeetActions, AddaActions {
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
  join(input: JoinInput): Person;
  leave(): void;
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

function topicNames(person: Person): string {
  return person.topics.map((t) => topicById(t).short).join(" + ");
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

type AppStore = Store<AppState>;

/** Clears the map selection, e.g. when the profile gives way to another panel. */
function deselect(engine: EngineApi, store: AppStore): void {
  if (store.get().selectedId === null) return;
  engine.select(null);
  store.set({ selectedId: null });
}

/** Takes you off the map and out of storage; returns who was removed. */
function removeYou(engine: EngineApi, store: AppStore): Person | null {
  const you = store.get().you;
  if (!you) return null;
  clearYou();
  engine.remove(you.id);
  store.set((s) => ({
    you: null,
    people: s.people.filter((p) => p.id !== you.id),
    selectedId: s.selectedId === you.id ? null : s.selectedId,
    panel: s.selectedId === you.id ? "none" : s.panel,
  }));
  return you;
}

type ToastActions = Pick<Actions, "pushToast" | "dismissToast">;

function toastActions(store: AppStore): ToastActions {
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

type PanelActions = Pick<
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

function panelActions(engine: EngineApi, store: AppStore): PanelActions {
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

type MapActions = Pick<Actions, "toggleHighlight" | "clearHighlight" | "fit">;

function mapActions(engine: EngineApi, store: AppStore): MapActions {
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

/** The game loops that follow you in and out. */
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
      store.set((s) => ({
        you: person,
        people: [...s.people, person],
        panel: "none",
        overlay: "none",
        selectedId: null,
        framed: false,
        joinTopic: null,
      }));
      engine.select(null);
      engine.spawn(person, true);
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
      return person;
    },
    leave() {
      if (!removeYou(engine, store)) return;
      store.set({ overlay: "none", joinTopic: null });
      meet.forget();
      adda.forget();
      trends.sync();
      points.refreshCrowns();
      toasts.pushToast("You left coii. Come back anytime.", "waving_hand", "info");
    },
  };
}

/** Mirrors taps on the map (beans, empty floor, booth signs) into app state. */
function followEngine(engine: EngineApi, store: AppStore): void {
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
    wave: meet.wave,
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
  };
}

/** Taps, drags and drops on adda tents. */
function followAddaTents(engine: EngineApi, store: AppStore, adda: AddaController): void {
  engine.on("addaTap", () => {
    deselect(engine, store);
    store.set({ panel: "adda", framed: false });
  });
  engine.on("addaMoved", adda.moveAdda);
  engine.on("beanDropped", adda.beanDropped);
}

/** Owns app state and keeps the engine in sync with it. UI components only call `actions`. */
export function createController(engine: EngineApi, options: ControllerOptions): AppController {
  const store = createStore<AppState>({
    people: options.you ? [...options.people, options.you] : [...options.people],
    selectedId: null,
    boothTopic: null,
    panel: "none",
    overlay: "none",
    highlight: [],
    framed: false,
    joinTopic: null,
    you: options.you,
    toasts: [],
    meet: null,
    adda: null,
    addaDrop: null,
    shareAddaId: null,
    inviteTopic: null,
    lastArrival: null,
    race: { rows: [], hot: null },
    tribe: false,
    points: loadPoints(),
    reducedMotion: options.reducedMotion,
    ready: false,
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
        actions.pushToast(
          `${person.name.split(" ")[0] ?? person.name} just walked in · ${topicNames(person)}`,
          "waving_hand",
          "arrival",
        );
      });
    },
    startDemoWaves: points.startDemoWaves,
    openJoinLink(topic) {
      if (!store.get().you) {
        actions.startJoin(topic);
        return;
      }
      actions.openOverlay("you");
      actions.pushToast("You're already on coii. Here's your bean.", "waving_hand", "info");
    },
  };
}
