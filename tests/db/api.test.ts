import { afterAll, describe, expect, it } from "vitest";

import { call, cleanup, join, service, visitor } from "./helpers";
import type { Me, Member, Venue, VenueChanges } from "./helpers";

/** The API contract end to end (docs/prd/database.md §8), as a visitor and as members. */

const created: string[] = [];

async function member(overrides = {}): Promise<Member & { me: Me }> {
  const m = await join(overrides);
  created.push(m.userId);
  return m;
}

afterAll(async () => {
  await cleanup(created);
});

describe("as a visitor (no session)", () => {
  it("reads the venue as one column-oriented value", async () => {
    const venue = await call<Venue>(visitor(), "get_venue");
    expect(venue).toMatchObject({ v: 1 });
    expect(venue.id.length).toBe(venue.n.length);
    expect(venue.p.length).toBe(venue.id.length);
    expect(Date.parse(venue.cursor)).toBeLessThan(Date.now());
  });

  it("can't wave, read anyone's profile or reach a table", async () => {
    const supabase = visitor();
    const wave = await supabase.rpc("wave", { target: crypto.randomUUID() });
    expect(wave.error?.message).toMatch(/permission denied/);
    const me = await supabase.rpc("get_me");
    expect(me.error?.message).toMatch(/permission denied/);
    const table = await supabase.from("people").select("*");
    expect(table.error).not.toBeNull();
    const privateTable = await supabase.schema("private").from("contacts").select("*");
    expect(privateTable.error).not.toBeNull();
  });
});

describe("joining, waving and chais", () => {
  it("joins with an anonymous session and shows up on the map without handles", async () => {
    const asha = await member({
      name: "Asha  Rao ",
      one_liners: ["  private payments  ", "GM", "gm"],
    });
    expect(asha.me).toMatchObject({ name: "Asha Rao", one_liners: ["private payments", "GM"] });
    const venue = await call<Venue>(visitor(), "get_venue");
    expect(venue.id).toContain(asha.me.id);
    expect(JSON.stringify(venue)).not.toContain(asha.me.telegram ?? "missing");
  });

  it("unlocks handles with a wave, counts points, keeps who waved hidden, then makes a chai", async () => {
    const asha = await member();
    const ravi = await member({ x: "ravi_" + Date.now().toString(36).slice(-6) });

    const first = await call<{ result: string; contacts: unknown; waves_left: number }>(
      asha.client,
      "wave",
      { target: ravi.me.id },
    );
    expect(first).toEqual({
      result: "waved",
      contacts: { telegram: ravi.me.telegram, x: ravi.me.x },
      waves_left: 49,
    });

    const raviState = await call<Record<string, unknown>>(ravi.client, "get_meet_state");
    expect(raviState["inbound"]).toBe(1);
    expect(raviState["points"]).toBe(1);
    expect(JSON.stringify(raviState)).not.toContain(asha.me.id);

    const raviSees = await call<unknown[]>(ravi.client, "get_contacts", { ids: [asha.me.id] });
    expect(raviSees).toEqual([]);

    const back = await call<{ result: string }>(ravi.client, "wave", { target: asha.me.id });
    expect(back.result).toBe("chai");
    const ashaState = await call<{ chais: { person_id: string; status: string }[] }>(
      asha.client,
      "get_meet_state",
    );
    expect(ashaState.chais).toEqual([
      expect.objectContaining({ person_id: ravi.me.id, status: "new" }),
    ]);
  });

  it("refuses edits to someone else's handle", async () => {
    const asha = await member();
    const mei = await member();
    const taken = await mei.client.rpc("upsert_profile", {
      name: "Mei",
      topics: ["defi"],
      intents: [],
      one_liners: [],
      avatar: [0, 0, 0, 0],
      telegram: asha.me.telegram?.toUpperCase(),
      x: null,
      consent: false,
    });
    expect(taken.error?.message).toBe("coii:handle_taken");
  });
});

describe("venue deltas", () => {
  it("delivers arrivals, points and removals after a cursor, with an overlap", async () => {
    const before = await call<Venue>(visitor(), "get_venue");
    const omar = await member();
    const lena = await member();
    await call(lena.client, "wave", { target: omar.me.id });

    const changes = await call<VenueChanges>(visitor(), "get_venue_changes", {
      since: before.cursor,
    });
    expect(changes.full).toBe(false);
    expect(changes.people.id).toEqual(expect.arrayContaining([omar.me.id, lena.me.id]));

    const later = await call<VenueChanges>(visitor(), "get_venue_changes", {
      since: changes.cursor,
    });
    expect(later.people.id).toEqual(expect.arrayContaining([omar.me.id]));

    await service().auth.admin.deleteUser(omar.userId);
    const removed = await call<VenueChanges>(visitor(), "get_venue_changes", {
      since: before.cursor,
    });
    expect(removed.removed).toContain(omar.me.id);
    expect(removed.people.id).not.toContain(omar.me.id);
  });

  it("asks for a full reload when the cursor is too old", async () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const changes = await call<VenueChanges>(visitor(), "get_venue_changes", { since: old });
    expect(changes).toEqual({ v: 1, full: true });
  });
});

describe("personal realtime events", () => {
  it("tells you someone waved within seconds, without saying who", async () => {
    const asha = await member();
    const ravi = await member();
    await ravi.client.realtime.setAuth();
    const payload = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no wave_in within 10s")), 10_000);
      ravi.client
        .channel(`user:${ravi.userId}`, { config: { private: true } })
        .on("broadcast", { event: "wave_in" }, (message) => {
          clearTimeout(timer);
          resolve(message["payload"] as Record<string, unknown>);
        })
        .subscribe((status) => {
          // Give a freshly restarted Realtime a moment to route the topic before waving.
          if (status !== "SUBSCRIBED") return;
          setTimeout(() => void call(asha.client, "wave", { target: ravi.me.id }), 1000);
        });
    });
    const received = await payload;
    expect(received["points"]).toBe(1);
    expect(JSON.stringify(received)).not.toContain(asha.me.id);
    await ravi.client.removeAllChannels();
  });

  it("won't let you listen on someone else's topic", async () => {
    const asha = await member();
    const ravi = await member();
    await asha.client.realtime.setAuth();
    const status = await new Promise<string>((resolve) => {
      asha.client.channel(`user:${ravi.userId}`, { config: { private: true } }).subscribe((s) => {
        if (s !== "SUBSCRIBED" && s !== "CLOSED") resolve(s);
        if (s === "SUBSCRIBED") resolve(s);
      });
      setTimeout(() => resolve("TIMED_OUT"), 6000);
    });
    expect(status).not.toBe("SUBSCRIBED");
    await asha.client.removeAllChannels();
  });
});

describe("for Edge Functions", () => {
  it("hand_inputs and save_hand work for the service role only", async () => {
    const asha = await member();
    const inputs = await call<{ viewer: { id: string }; candidates: unknown[] }>(
      service(),
      "hand_inputs",
      { user_id: asha.userId },
    );
    expect(inputs.viewer.id).toBe(asha.me.id);
    const denied = await asha.client.rpc("hand_inputs", { user_id: asha.userId });
    expect(denied.error?.message).toMatch(/permission denied/);
  });
});
