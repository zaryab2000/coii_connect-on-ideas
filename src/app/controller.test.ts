import { describe, expect, it } from "vitest";

import { createController } from "@/app/controller";
import type { JoinInput } from "@/app/controller";
import type { PeopleSource } from "@/data/source";
import type { Person, TopicId } from "@/data/types";
import { FakeEngine } from "@/engine/fake";

function person(id: string, topics: TopicId[], overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: `Person ${id}`,
    telegram: `demo_${id}`,
    x: null,
    topics,
    intent: [],
    oneLiners: [],
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: true,
    isYou: false,
    origin: "india",
    joinedAt: 0,
    ...overrides,
  };
}

const CROWD = [person("a", ["ai"]), person("b", ["defi", "privacy"])];

const JOIN: JoinInput = {
  name: "  Zara Khan ",
  telegram: "zara_builds",
  x: null,
  topics: ["wallets", "ai"],
  intent: ["building"],
  oneLiners: [],
  avatar: { skin: 1, hair: 2, hairColor: 3, accessory: 0 },
};

function setup(you: Person | null = null) {
  const engine = new FakeEngine();
  const controller = createController(engine, { people: CROWD, you, reducedMotion: false });
  const methods = () => engine.calls.map((c) => c.method);
  return { engine, controller, store: controller.store, actions: controller.actions, methods };
}

describe("controller panels and map taps", () => {
  it("starts with the crowd, plus you when you joined before", () => {
    expect(setup().store.get().people).toHaveLength(2);
    const you = person("me", ["ai"], { isYou: true, isDemo: false });
    const state = setup(you).store.get();
    expect(state.people.map((p) => p.id)).toEqual(["a", "b", "me"]);
    expect(state.you).toBe(you);
  });

  it("locate opens the profile, frames it and flies the camera", () => {
    const { store, actions, engine } = setup();
    actions.locate("b");
    expect(store.get()).toMatchObject({ selectedId: "b", panel: "profile", framed: true });
    expect(engine.calls.at(-1)).toEqual({ method: "locate", args: ["b"] });
  });

  it("a bean tapped on the map opens the profile, framed so the sheet will not cover it", () => {
    const { store, engine } = setup();
    engine.emitSelect("a");
    expect(store.get()).toMatchObject({ selectedId: "a", panel: "profile", framed: true });
  });

  it("clearing the selection on the map closes only a profile", () => {
    const { store, actions, engine } = setup();
    engine.emitSelect("a");
    engine.emitSelect(null);
    expect(store.get()).toMatchObject({ selectedId: null, panel: "none" });
    actions.openPanel("people");
    engine.emitSelect(null);
    expect(store.get().panel).toBe("people");
  });

  it("a booth tap replaces the profile and clears the map selection", () => {
    const { store, engine } = setup();
    engine.emitSelect("a");
    engine.emitBoothTap("defi");
    expect(store.get()).toMatchObject({
      boothTopic: "defi",
      panel: "booth",
      framed: true,
      selectedId: null,
    });
    expect(engine.calls.at(-1)).toEqual({ method: "select", args: [null] });
  });

  it("openBooth focuses the booth camera", () => {
    const { store, actions, engine } = setup();
    actions.openBooth("privacy");
    expect(store.get()).toMatchObject({ boothTopic: "privacy", panel: "booth" });
    expect(engine.calls.at(-1)).toEqual({ method: "focusBooth", args: ["privacy"] });
  });

  it("leaving a profile for another panel deselects the person", () => {
    const { store, actions, engine } = setup();
    actions.locate("a");
    actions.openPanel("people");
    expect(store.get()).toMatchObject({ selectedId: null, panel: "people" });
    expect(engine.calls.at(-1)).toEqual({ method: "select", args: [null] });
  });

  it("closePanel resets panel, selection, framing and the join preset", () => {
    const { store, actions } = setup();
    actions.locate("a");
    actions.closePanel();
    expect(store.get()).toMatchObject({
      panel: "none",
      selectedId: null,
      framed: false,
      joinTopic: null,
    });
  });
});

describe("controller overlays", () => {
  it("startJoin opens your profile overlay with a topic preset that closing clears", () => {
    const { store, actions } = setup();
    actions.openPanel("people");
    actions.startJoin("defi");
    expect(store.get()).toMatchObject({ overlay: "you", joinTopic: "defi", panel: "people" });
    actions.closeOverlay();
    expect(store.get()).toMatchObject({ overlay: "none", joinTopic: null, panel: "people" });
  });

  it("About opens over whatever panel is showing and leaves it alone", () => {
    const { store, actions } = setup();
    actions.locate("a");
    actions.openOverlay("about");
    expect(store.get()).toMatchObject({ overlay: "about", panel: "profile", selectedId: "a" });
    actions.closeOverlay();
    expect(store.get()).toMatchObject({ overlay: "none", panel: "profile" });
  });

  it("tapping your own bean opens your profile overlay instead of a profile panel", () => {
    const { store, actions, engine } = setup();
    const you = actions.join(JOIN);
    engine.emitSelect("a");
    engine.emitSelect(you.id);
    expect(store.get()).toMatchObject({ overlay: "you", panel: "none", selectedId: null });
    expect(engine.calls.at(-1)).toEqual({ method: "select", args: [null] });
  });

  it("picking yourself from a list opens your overlay; Show me on map flies there", () => {
    const { store, actions, engine } = setup();
    const you = actions.join(JOIN);
    actions.selectPerson(you.id);
    expect(store.get()).toMatchObject({ overlay: "you", panel: "none" });
    actions.locate(you.id);
    expect(store.get()).toMatchObject({ overlay: "none", panel: "none", selectedId: you.id });
    expect(engine.calls.at(-1)).toEqual({ method: "locate", args: [you.id] });
  });

  it("opening a booth or someone else's profile gets the overlay out of the way", () => {
    const { store, actions } = setup();
    actions.openOverlay("about");
    actions.openBooth("ai");
    expect(store.get()).toMatchObject({ overlay: "none", panel: "booth" });
    actions.openOverlay("you");
    actions.locate("b");
    expect(store.get()).toMatchObject({ overlay: "none", panel: "profile", selectedId: "b" });
  });
});

describe("controller map controls", () => {
  it("toggles and clears booth highlights in the engine", () => {
    const { store, actions, engine } = setup();
    actions.toggleHighlight("ai");
    actions.toggleHighlight("defi");
    actions.toggleHighlight("ai");
    expect(store.get().highlight).toEqual(["defi"]);
    expect(engine.calls.at(-1)).toEqual({ method: "highlightTopics", args: [["defi"]] });
    actions.clearHighlight();
    expect(store.get().highlight).toEqual([]);
    expect(engine.calls.at(-1)).toEqual({ method: "highlightTopics", args: [[]] });
  });

  it("fit unframes and fits the camera", () => {
    const { store, actions, methods } = setup();
    actions.locate("a");
    actions.fit();
    expect(store.get().framed).toBe(false);
    expect(methods().at(-1)).toBe("fit");
  });
});

describe("controller join and leave", () => {
  it("join closes the overlay, spawns your bean at the gate and celebrates", () => {
    const { store, actions, engine } = setup();
    actions.startJoin(null);
    const you = actions.join(JOIN);
    const state = store.get();
    expect(state.overlay).toBe("none");
    expect(you).toMatchObject({ name: "Zara Khan", isYou: true, isDemo: false });
    expect(state.you).toBe(you);
    expect(state.people.at(-1)).toBe(you);
    expect(state.panel).toBe("none");
    expect(engine.present.get(you.id)).toBe(you);
    expect(engine.calls).toContainEqual({ method: "spawn", args: [you.id, true] });
    expect(state.toasts.at(-1)).toMatchObject({ icon: "party_popper", tone: "success" });
  });

  it("joining again replaces your previous bean", () => {
    const { store, actions, engine } = setup();
    const first = actions.join(JOIN);
    const second = actions.join({ ...JOIN, name: "Zara K" });
    expect(store.get().people.filter((p) => p.isYou)).toEqual([second]);
    expect(engine.present.has(first.id)).toBe(false);
    expect(store.get().toasts.map((t) => t.tone)).toEqual(["success", "success"]);
  });

  it("leave removes you, closes your profile overlay and says goodbye", () => {
    const { store, actions, engine } = setup();
    const you = actions.join(JOIN);
    actions.locate(you.id);
    actions.openOverlay("you");
    actions.leave();
    const state = store.get();
    expect(state.you).toBeNull();
    expect(state.people.some((p) => p.id === you.id)).toBe(false);
    expect(state).toMatchObject({ selectedId: null, panel: "none", overlay: "none" });
    expect(engine.present.has(you.id)).toBe(false);
    expect(state.toasts.at(-1)).toMatchObject({ tone: "info", icon: "waving_hand" });
  });

  it("leave does nothing when you have not joined", () => {
    const { store, actions, methods } = setup();
    actions.leave();
    expect(store.get().toasts).toEqual([]);
    expect(methods()).not.toContain("remove");
  });
});

describe("controller toasts, readiness and arrivals", () => {
  it("keeps at most four toasts and dismisses by id", () => {
    const { store, actions } = setup();
    for (let i = 0; i < 6; i++) actions.pushToast(`t${i}`, null, "info");
    expect(store.get().toasts.map((t) => t.text)).toEqual(["t2", "t3", "t4", "t5"]);
    const first = store.get().toasts[0];
    if (!first) throw new Error("expected a toast");
    actions.dismissToast(first.id);
    expect(store.get().toasts.map((t) => t.text)).toEqual(["t3", "t4", "t5"]);
  });

  it("marks the app ready when the engine is", () => {
    const { store, engine } = setup();
    expect(store.get().ready).toBe(false);
    engine.mount();
    expect(store.get().ready).toBe(true);
  });

  it("live arrivals join the crowd, walk in and announce themselves", () => {
    const { store, controller, engine } = setup();
    const listeners: ((p: Person) => void)[] = [];
    let stopped = false;
    const source: PeopleSource = {
      start(onArrive) {
        listeners.push(onArrive);
        return () => {
          stopped = true;
        };
      },
    };
    const stop = controller.startArrivals(source);
    for (const onArrive of listeners)
      onArrive(person("new", ["ai", "defi"], { name: "Priya Shah" }));
    expect(store.get().people.at(-1)?.id).toBe("new");
    expect(engine.calls.at(-1)).toEqual({ method: "spawn", args: ["new", true] });
    expect(store.get().toasts.at(-1)?.text).toBe("Priya just walked in · AI Agents + DeFi");
    stop();
    expect(stopped).toBe(true);
  });
});
