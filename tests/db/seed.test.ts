import { describe, expect, it } from "vitest";

import { PUBLISHABLE_KEY, SUPABASE_URL } from "./helpers";

/** With the 1,500-bean seed loaded (`pnpm db:seed` + `supabase db reset`). */

/** Bytes per bean the snapshot may cost, uncompressed (docs/prd/database.md §8.2). */
const BUDGET = 260;

describe("the seeded venue", () => {
  it("serves every bean in one snapshot within the size budget", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_venue`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.ok).toBe(true);
    const body = await res.text();
    const venue = JSON.parse(body) as { id: string[]; f: number[]; p: number[] };
    const demo = venue.f.filter((flags) => (flags & 4) !== 0).length;
    expect(demo, "load the seed first: pnpm db:seed && supabase db reset").toBeGreaterThanOrEqual(
      1500,
    );
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(venue.id.length * BUDGET);
    expect(Math.max(...venue.p)).toBeGreaterThan(0);
  });
});
