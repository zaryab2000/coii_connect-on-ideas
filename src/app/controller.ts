import { createMeet, realClock } from "@/app/meet";
import type { MeetActions, MeetClock, MeetController } from "@/app/meet";
import { createStore } from "@/app/store";
import type { AppState, Panel, Store, Toast } from "@/app/store";
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
  readonly oneLiner: string | null;
  readonly avatar: Avatar;
}

export interface Actions extends MeetActions {
  selectPerson(id: string | null): void;
  locate(id: string): void;
  openBooth(topic: TopicId): void;
  openPanel(panel: Panel): void;
  /** Opens the join form, optionally with a topic preselected (or added, when editing). */
  startJoin(topic: TopicId | null): void;
  closePanel(): void;
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
    oneLiner: input.oneLiner,
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

type PanelActions = Pick<
  Actions,
  "selectPerson" | "locate" | "openBooth" | "openPanel" | "startJoin" | "closePanel"
>;

function panelActions(engine: EngineApi, store: AppStore): PanelActions {
  const openPanel = (panel: Panel): void => {
    if (panel !== "profile") deselect(engine, store);
    store.set(panel === "join" ? { panel } : { panel, joinTopic: null });
  };
  return {
    selectPerson(id) {
      store.set({ selectedId: id, panel: id ? "profile" : "none", framed: false });
      engine.select(id);
    },
    locate(id) {
      store.set({ selectedId: id, panel: "profile", framed: true });
      engine.locate(id);
    },
    openBooth(topic) {
      deselect(engine, store);
      store.set({ boothTopic: topic, panel: "booth", framed: true });
      engine.focusBooth(topic);
    },
    openPanel,
    startJoin(topic) {
      openPanel("join");
      store.set({ joinTopic: topic });
    },
    closePanel() {
      deselect(engine, store);
      store.set({ panel: "none", framed: false, joinTopic: null });
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

function youActions(
  engine: EngineApi,
  store: AppStore,
  toasts: ToastActions,
  meet: MeetController,
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
        selectedId: null,
        framed: false,
        joinTopic: null,
      }));
      engine.select(null);
      engine.spawn(person, true);
      meet.forget();
      meet.sync();
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
      meet.forget();
      toasts.pushToast("You left coii. Come back anytime.", "waving_hand", "info");
    },
  };
}

/** Mirrors taps on the map (beans, empty floor, booth signs) into app state. */
function followEngine(engine: EngineApi, store: AppStore): void {
  engine.on("ready", () => store.set({ ready: true }));
  engine.on("select", (id) => {
    // The engine centres a tapped bean, so the phone layout can lift it above the sheet.
    if (id) store.set({ selectedId: id, panel: "profile", framed: true });
    else if (store.get().panel === "profile")
      store.set({ selectedId: null, panel: "none", framed: false });
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
    unwave: meet.unwave,
    skip: meet.skip,
    dismissChai: meet.dismissChai,
    markMessaged: meet.markMessaged,
    confirmMet: meet.confirmMet,
    unmatch: meet.unmatch,
    toggleTribe: meet.toggleTribe,
  };
}

/** Owns app state and keeps the engine in sync with it. UI components only call `actions`. */
export function createController(engine: EngineApi, options: ControllerOptions): AppController {
  const store = createStore<AppState>({
    people: options.you ? [...options.people, options.you] : [...options.people],
    selectedId: null,
    boothTopic: null,
    panel: "none",
    highlight: [],
    framed: false,
    joinTopic: null,
    you: options.you,
    toasts: [],
    meet: null,
    tribe: false,
    reducedMotion: options.reducedMotion,
    ready: false,
  });
  const toasts = toastActions(store);
  const meet = createMeet(engine, store, toasts.pushToast, options.clock ?? realClock);
  const actions: Actions = {
    ...panelActions(engine, store),
    ...mapActions(engine, store),
    ...youActions(engine, store, toasts, meet),
    ...toasts,
    ...meetActionsOf(meet),
  };
  followEngine(engine, store);
  meet.sync();

  return {
    store,
    actions,
    startArrivals(source) {
      return source.start((person) => {
        store.set((s) => ({ people: [...s.people, person] }));
        engine.spawn(person, true);
        actions.pushToast(
          `${person.name.split(" ")[0] ?? person.name} just walked in · ${topicNames(person)}`,
          "waving_hand",
          "arrival",
        );
      });
    },
  };
}
