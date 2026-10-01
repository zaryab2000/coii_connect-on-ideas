import { createStore } from "@/app/store";
import type { AppState, Panel, Store, Toast } from "@/app/store";
import { clearYou, saveYou } from "@/data/localUser";
import type { PeopleSource } from "@/data/source";
import { topicById } from "@/data/topics";
import type { Avatar, IconId, Person, TopicId } from "@/data/types";
import type { EngineApi } from "@/engine/types";

export interface JoinInput {
  readonly name: string;
  readonly telegram: string | null;
  readonly x: string | null;
  readonly topics: readonly TopicId[];
  readonly oneLiner: string | null;
  readonly avatar: Avatar;
}

export interface Actions {
  selectPerson(id: string | null): void;
  locate(id: string): void;
  openBooth(topic: TopicId): void;
  openPanel(panel: Panel): void;
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
}

function topicNames(person: Person): string {
  return person.topics.map((t) => topicById(t).short).join(" + ");
}

function newId(): string {
  return `you-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

type ToastFn = Actions["pushToast"];

function personFrom(input: JoinInput): Person {
  return {
    id: newId(),
    name: input.name.trim(),
    telegram: input.telegram,
    x: input.x,
    topics: [...input.topics],
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

type ViewActions = Pick<
  Actions,
  | "selectPerson"
  | "locate"
  | "openBooth"
  | "openPanel"
  | "closePanel"
  | "toggleHighlight"
  | "clearHighlight"
  | "fit"
>;

/** Selection, panels, highlighting and camera: state changes mirrored to the engine. */
function viewActions(engine: EngineApi, store: Store<AppState>): ViewActions {
  return {
    selectPerson(id) {
      store.set({ selectedId: id, panel: id ? "profile" : "none" });
      engine.select(id);
    },
    locate(id) {
      store.set({ selectedId: id, panel: "profile" });
      engine.locate(id);
    },
    openBooth(topic) {
      store.set({ boothTopic: topic, panel: "booth" });
      engine.focusBooth(topic);
    },
    openPanel(panel) {
      store.set({ panel });
    },
    closePanel() {
      if (store.get().panel === "profile") {
        engine.select(null);
        store.set({ selectedId: null });
      }
      store.set({ panel: "none" });
    },
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
      engine.fit();
    },
  };
}

/** Joining and leaving the venue as yourself; your profile is kept in this browser. */
function membershipActions(
  engine: EngineApi,
  store: Store<AppState>,
  pushToast: ToastFn,
): Pick<Actions, "join" | "leave"> {
  const leave = (): void => {
    const you = store.get().you;
    if (!you) return;
    clearYou();
    engine.remove(you.id);
    store.set((s) => ({
      you: null,
      people: s.people.filter((p) => p.id !== you.id),
      selectedId: s.selectedId === you.id ? null : s.selectedId,
      panel: s.selectedId === you.id ? "none" : s.panel,
    }));
  };
  const join = (input: JoinInput): Person => {
    if (store.get().you) leave();
    const person = personFrom(input);
    const saved = saveYou(person);
    store.set((s) => ({
      you: person,
      people: [...s.people, person],
      panel: "none",
      selectedId: null,
    }));
    engine.select(null);
    engine.spawn(person, true);
    const text = saved
      ? "You're in! Watch yourself walk in."
      : "You're in for this visit (this browser can't save it).";
    pushToast(text, "party_popper", "success");
    return person;
  };
  return { join, leave };
}

function toastActions(store: Store<AppState>): Pick<Actions, "pushToast" | "dismissToast"> {
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

function listenToEngine(engine: EngineApi, store: Store<AppState>): void {
  engine.on("ready", () => store.set({ ready: true }));
  engine.on("select", (id) => {
    if (id) store.set({ selectedId: id, panel: "profile" });
    else if (store.get().panel === "profile") store.set({ selectedId: null, panel: "none" });
  });
  engine.on("boothTap", (topic) => store.set({ boothTopic: topic, panel: "booth" }));
}

/** Owns app state and keeps the engine in sync with it. UI components only call `actions`. */
export function createController(engine: EngineApi, options: ControllerOptions): AppController {
  const store = createStore<AppState>({
    people: options.you ? [...options.people, options.you] : [...options.people],
    selectedId: null,
    boothTopic: null,
    panel: "none",
    highlight: [],
    you: options.you,
    toasts: [],
    reducedMotion: options.reducedMotion,
    ready: false,
  });
  const toasts = toastActions(store);
  const actions: Actions = {
    ...viewActions(engine, store),
    ...membershipActions(engine, store, toasts.pushToast),
    ...toasts,
  };
  listenToEngine(engine, store);
  return {
    store,
    actions,
    startArrivals(source) {
      return source.start((person) => {
        store.set((s) => ({ people: [...s.people, person] }));
        engine.spawn(person, true);
        const first = person.name.split(" ")[0] ?? person.name;
        actions.pushToast(
          `${first} just walked in · ${topicNames(person)}`,
          "waving_hand",
          "arrival",
        );
      });
    },
  };
}
