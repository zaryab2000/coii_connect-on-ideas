import { CACHE_CONTROL, venueResponse } from "@api/venue.js";
import { describe, expect, it } from "vitest";

const ENV = { url: "http://db.test/", key: "sb_publishable_test" };
const SNAPSHOT = '{"v":1,"cursor":"c","day":"d","id":[]}';

describe("/api/venue", () => {
  it("passes the snapshot through with a shared CDN cache", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const res = await venueResponse(ENV, (input, init) => {
      calls.push({ url: String(input), init });
      return Promise.resolve(new Response(SNAPSHOT, { status: 200 }));
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SNAPSHOT);
    expect(res.headers.get("Cache-Control")).toBe(CACHE_CONTROL);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://db.test/rest/v1/rpc/get_venue");
    // The publishable key is the only credential sent.
    expect(calls[0]?.init?.headers).toEqual({
      apikey: "sb_publishable_test",
      "Content-Type": "application/json",
    });
  });

  it("never caches an error", async () => {
    const down = await venueResponse(ENV, () =>
      Promise.resolve(new Response("x", { status: 500 })),
    );
    expect([down.status, down.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
    const offline = await venueResponse(ENV, () => Promise.reject(new TypeError("fetch failed")));
    expect([offline.status, offline.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
  });

  it("says so when the site has no Supabase settings (demo-mode deployments)", async () => {
    const res = await venueResponse({}, () => Promise.reject(new Error("must not be called")));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "coii:not_configured" });
  });
});
