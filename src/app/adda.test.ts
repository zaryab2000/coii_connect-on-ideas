import { describe, expect, it } from "vitest";

import { createController } from "@/app/controller";
import type { JoinInput } from "@/app/joinTypes";
import { WAVES_PER_DAY } from "@/app/meet";
import type { AddaView, AppState, Store } from "@/app/store";
import { ADDA_MAX, ADDAS_MAX } from "@/data/adda";
import { generateDemo } from "@/data/generateDemo";
import { FakeEngine } from "@/engine/fake";
import type { AddaMapView } from "@/engine/types";
import { fakeClock } from "@/test/fakeClock";

const START = Date.UTC(2026, 10, 3, 5, 0); // 3 Nov 2026, 10:30 IST
const CROWD = generateDemo({ seed: 5, count: 300, reserve: 0, now: START }).people;
const JOIN: JoinInput = {
  name: "Zara Khan",
  telegram: "zara_builds",
  x: null,
  topics: ["privacy", "core"],
  intent: ["building"],
  oneLiners: [],
  avatar: { skin: 1, hair: 0, hairColor: 0, accessory: 0 },
};
const LOOK = { style: "tambu", color: "leaf" } as const;

function setup() {
  const engine = new FakeEngine();
  const { clock, advance } = fakeClock(START);
  const controller = createController(engine, {
    people: CROWD,
    you: null,
    reducedMotion: false,
    clock,
  });
  return { engine, advance, store: controller.store, actions: controller.actions };
}

function addaOf(store: Store<AppState>): AddaView {
  const adda = store.get().adda;
  if (!adda) throw new Error("expected adda to be active after joining");
  return adda;
}

function lastMaps(engine: FakeEngine): readonly AddaMapView[] {
  const calls = engine.calls.filter((c) => c.method === "setAddas");
  return (calls.at(-1)?.args[0] as readonly AddaMapView[] | undefined) ?? [];
}

/** Joins and builds one adda; returns its id. */
async function withAdda(ctx: ReturnType<typeof setup>): Promise<string> {
  await ctx.actions.join(JOIN, null);
  const addaId = await ctx.actions.createAdda(LOOK);
  if (!addaId) throw new Error("expected a new adda");
  return addaId;
}

function membersOf(store: Store<AppState>, addaId: string) {
  return addaOf(store).addas.find((a) => a.id === addaId)?.members ?? [];
}

function id(index: number): string {
  return CROWD[index]?.id ?? "";
}

describe("Adda: your tents", () => {
  it("is off until you join, then waits for you to build one", () => {
    const { store, actions, engine } = setup();
    expect(store.get().adda).toBeNull();
    actions.join(JOIN, null);
    expect(addaOf(store)).toMatchObject({ addas: [], invites: [] });
    expect(lastMaps(engine)).toEqual([]);
  });

  it("builds up to three addas, named by default or by you", async () => {
    const { store, actions } = setup();
    actions.join(JOIN, null);
    const ids = [
      await actions.createAdda(LOOK),
      await actions.createAdda(LOOK, "  Rust   crew "),
      await actions.createAdda(LOOK, "see t.me/x"),
    ];
    expect(ids.every((addaId) => addaId !== null)).toBe(true);
    expect(await actions.createAdda(LOOK)).toBeNull();
    expect(addaOf(store).addas.map((a) => a.name)).toEqual([
      "Zara's adda",
      "Rust crew",
      "Zara's adda 3",
    ]);
    expect(addaOf(store).addas).toHaveLength(ADDAS_MAX);
  });

  it("only invites people you waved at, per adda", async () => {
    const ctx = setup();
    const { store, actions, engine } = ctx;
    const addaId = await withAdda(ctx);
    expect(await actions.inviteToAdda(id(0), "nope")).toBe("needs_adda");
    expect(await actions.inviteToAdda(id(0), addaId)).toBe("needs_wave");
    actions.wave(id(0));
    expect(await actions.inviteToAdda(id(0), addaId)).toBe("invited");
    expect(await actions.inviteToAdda(id(0), addaId)).toBe("already");
    expect(membersOf(store, addaId)).toEqual([
      { personId: id(0), status: "invited", invitedAt: START },
    ]);
    const [map] = lastMaps(engine);
    expect(map).toMatchObject({ id: addaId, label: "Zara's adda", look: LOOK, mine: true });
    expect(map?.members.map((m) => [m.person.name, m.pending])).toEqual([
      ["Zara Khan", false],
      [CROWD[0]?.name, true],
    ]);
  });

  it("the same person can be in two of your addas", async () => {
    const ctx = setup();
    const a = await withAdda(ctx);
    const b = (await ctx.actions.createAdda(LOOK)) ?? "";
    ctx.actions.wave(id(0));
    expect(await ctx.actions.inviteToAdda(id(0), a)).toBe("invited");
    expect(await ctx.actions.inviteToAdda(id(0), b)).toBe("invited");
  });

  it("stops at the size cap", async () => {
    const ctx = setup();
    const addaId = await withAdda(ctx);
    const results: string[] = [];
    for (const p of CROWD.slice(0, ADDA_MAX + 1)) {
      void ctx.actions.wave(p.id);
      // In order on purpose: the last invite must be the one that finds the adda full.
      // oxlint-disable-next-line eslint/no-await-in-loop
      results.push(await ctx.actions.inviteToAdda(p.id, addaId));
    }
    expect(results.filter((r) => r === "invited")).toHaveLength(ADDA_MAX);
    expect(results.at(-1)).toBe("full");
  });

  it("demo people answer: a yes joins and makes a chai, a no keeps showing as invited", async () => {
    const ctx = setup();
    const { store, actions, advance, engine } = ctx;
    const addaId = await withAdda(ctx);
    const invited = CROWD.slice(0, 25).map((p) => p.id);
    for (const pid of invited) {
      actions.wave(pid);
      actions.inviteToAdda(pid, addaId);
    }
    advance(31_000);
    const members = membersOf(store, addaId);
    const joined = members.filter((m) => m.status === "joined").map((m) => m.personId);
    expect(joined.length).toBeGreaterThan(0);
    expect(joined.length).toBeLessThan(invited.length);
    expect(members).toHaveLength(invited.length);
    const chais = new Set(store.get().meet?.chais.map((c) => c.personId));
    expect(joined.every((pid) => chais.has(pid))).toBe(true);
    const pending = lastMaps(engine)[0]?.members.filter((m) => m.pending).length;
    expect(pending).toBe(invited.length - joined.length);
  });

  it("removing someone cancels their pending answer; deleting takes the tent down", async () => {
    const ctx = setup();
    const addaId = await withAdda(ctx);
    ctx.actions.wave(id(1));
    ctx.actions.inviteToAdda(id(1), addaId);
    ctx.actions.removeFromAdda(id(1), addaId);
    ctx.advance(31_000);
    expect(membersOf(ctx.store, addaId)).toEqual([]);
    ctx.actions.deleteAdda(addaId);
    expect(addaOf(ctx.store).addas).toEqual([]);
    expect(lastMaps(ctx.engine)).toEqual([]);
  });

  it("remembers where you dragged a tent, per layout", async () => {
    const ctx = setup();
    const addaId = await withAdda(ctx);
    ctx.engine.emitAddaMoved(addaId, "portrait", { x: 0.2, y: 0.9 });
    expect(addaOf(ctx.store).addas[0]?.places).toEqual({ portrait: { x: 0.2, y: 0.9 } });
    expect(lastMaps(ctx.engine)[0]?.places).toEqual({ portrait: { x: 0.2, y: 0.9 } });
  });

  it("is forgotten when you leave coii", async () => {
    const ctx = setup();
    await withAdda(ctx);
    await ctx.actions.leave();
    expect(ctx.store.get().adda).toBeNull();
    expect(lastMaps(ctx.engine)).toEqual([]);
  });
});

describe("Adda: dropping someone on your tent", () => {
  it("asks you to wave and add first, then they drop into the tent", async () => {
    const ctx = setup();
    const addaId = await withAdda(ctx);
    ctx.engine.emitBeanDropped(id(2), addaId);
    expect(ctx.store.get()).toMatchObject({
      overlay: "drop",
      addaDrop: { personId: id(2), addaId },
    });
    expect(await ctx.actions.waveAndAdd(id(2), addaId)).toBe("invited");
    expect(ctx.store.get().meet?.waved).toContain(id(2));
    expect(membersOf(ctx.store, addaId).map((m) => m.personId)).toEqual([id(2)]);
    expect(ctx.engine.calls.at(-1)).toEqual({ method: "dropIn", args: [addaId, id(2)] });
    expect(ctx.store.get()).toMatchObject({ overlay: "none", addaDrop: null });
  });

  it("someone already in the tent just gets a toast", async () => {
    const ctx = setup();
    const addaId = await withAdda(ctx);
    await ctx.actions.waveAndAdd(id(3), addaId);
    ctx.engine.emitBeanDropped(id(3), addaId);
    expect(ctx.store.get().overlay).toBe("none");
    expect(ctx.store.get().toasts.at(-1)?.text).toContain("already in");
  });
});

/** Joins and waits for a demo invite to arrive. */
function withInvite() {
  const ctx = setup();
  ctx.actions.join(JOIN, null);
  ctx.advance(271_000);
  const invite = addaOf(ctx.store).invites[0];
  if (!invite) throw new Error("expected a demo invite within 270 s");
  return { ...ctx, invite };
}

describe("Adda: invites to you", () => {
  it("accepting joins their adda and makes a chai without using a wave", () => {
    const { store, actions, invite, engine } = withInvite();
    expect(invite.name).toMatch(/'s adda$/);
    actions.acceptAddaInvite(invite);
    const adda = addaOf(store);
    expect(adda.invites).toEqual([]);
    expect(adda.joined.map((j) => j.addaId)).toEqual([invite.addaId]);
    expect(store.get().meet?.chais.some((c) => c.personId === invite.ownerId)).toBe(true);
    expect(store.get().meet?.wavesLeft).toBe(WAVES_PER_DAY);
    expect(store.get().meet?.celebrate).toBeNull();
    actions.viewAdda(invite);
    const theirs = lastMaps(engine).find((m) => !m.mine);
    expect(theirs?.ownerId).toBe(invite.ownerId);
    expect(theirs?.members.every((m) => !m.pending)).toBe(true);
    expect(engine.calls.at(-1)).toEqual({ method: "focusAdda", args: [invite.addaId] });
  });

  it("saying not now just drops the invite", () => {
    const { store, actions, invite } = withInvite();
    actions.declineAddaInvite(invite);
    expect(addaOf(store).invites).toEqual([]);
    expect(store.get().meet?.chais.some((c) => c.personId === invite.ownerId)).toBe(false);
  });

  it("leaving their adda takes their tent off your map", () => {
    const { store, actions, invite, engine } = withInvite();
    actions.acceptAddaInvite(invite);
    actions.viewAdda(invite);
    actions.leaveAdda(invite);
    expect(addaOf(store)).toMatchObject({ joined: [], viewing: null });
    expect(lastMaps(engine).some((m) => !m.mine)).toBe(false);
  });
});
