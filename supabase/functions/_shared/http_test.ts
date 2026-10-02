import type { SupabaseClient, User } from "@supabase/supabase-js";
import { assertEquals } from "jsr:@std/assert@1.0.13";

import { handle, noContent, projectKey } from "./http.ts";
import type { Deps, Handler } from "./http.ts";

const ORIGIN = "https://www.decipherclub.com";
const USER = { id: "user-1" } as User;

function deps(user: User | null = USER): Deps {
  return {
    allowedOrigins: [ORIGIN, "http://localhost:5173"],
    userOf: () => Promise.resolve(user),
    admin: () => ({}) as SupabaseClient,
  };
}

function request(method = "POST", origin: string | null = ORIGIN): Request {
  return new Request("http://edge/fn", {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}

const ok: Handler = () => Promise.resolve(new Response("{}", { status: 200 }));

function allowOrigin(res: Response): string | null {
  return res.headers.get("Access-Control-Allow-Origin");
}

Deno.test("every response to an allowed origin carries CORS headers", async () => {
  const cases: [string, Response][] = [
    ["preflight", await handle(request("OPTIONS"), ok, deps())],
    ["wrong method", await handle(request("GET"), ok, deps())],
    ["no session", await handle(request(), ok, deps(null))],
    ["success", await handle(request(), ok, deps())],
    [
      "204 from the handler",
      await handle(request(), (_r, c) => Promise.resolve(noContent(c.origin)), deps()),
    ],
    [
      "handler forgot headers",
      await handle(request(), () => Promise.resolve(new Response(null, { status: 204 })), deps()),
    ],
    ["handler threw", await handle(request(), () => Promise.reject(new Error("boom")), deps())],
  ];
  for (const [name, res] of cases) assertEquals([name, allowOrigin(res)], [name, ORIGIN]);
  assertEquals(
    cases.map(([, res]) => res.status),
    [204, 405, 401, 200, 204, 204, 500],
  );
});

Deno.test("a failure while checking the session is a 500 that still carries CORS headers", async () => {
  const broken: Deps = { ...deps(), userOf: () => Promise.reject(new Error("missing key")) };
  const res = await handle(request(), ok, broken);
  assertEquals([res.status, allowOrigin(res)], [500, ORIGIN]);
});

Deno.test("refuses other origins without CORS headers, so the browser blocks the reply", async () => {
  const res = await handle(request("POST", "https://evil.example"), ok, deps());
  assertEquals([res.status, allowOrigin(res)], [403, null]);
  assertEquals(await res.json(), { error: "coii:origin_not_allowed" });
});

Deno.test("serves non-browser clients (no Origin) when they have a session", async () => {
  const res = await handle(request("POST", null), ok, deps());
  assertEquals([res.status, allowOrigin(res)], [200, null]);
});

Deno.test("reads the new key variables and falls back to the legacy ones", () => {
  Deno.env.set("COII_TEST_KEYS", JSON.stringify({ default: "sb_secret_new" }));
  Deno.env.set("COII_TEST_LEGACY", "eyJ.legacy");
  assertEquals(projectKey("COII_TEST_KEYS", "COII_TEST_LEGACY"), "sb_secret_new");
  Deno.env.delete("COII_TEST_KEYS");
  assertEquals(projectKey("COII_TEST_KEYS", "COII_TEST_LEGACY"), "eyJ.legacy");
  Deno.env.delete("COII_TEST_LEGACY");
});
