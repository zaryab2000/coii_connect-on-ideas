// Load test on the LOCAL Supabase stack only (pre-release tracker P12; never production).
// Seeds 5,000 demo beans and 150,000 waves, then measures what PLAN §8 and PRD §13 depend on:
// the venue snapshot's size and time, 300 parallel delta pollers, 1,000 near-simultaneous
// deal-hand calls (the 06:00 IST rush) and wave throughput under the advisory locks.
// `node scripts/load-test.mjs [--skip-seed]`; prints a Markdown summary. Needs internet (each
// of the 1,000 test users passes Cloudflare's always-pass Turnstile check).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { requireTurnstile, run, serveFunctions, stackStatus } from "./local-stack.mjs";

const CAPTCHA = "XXXX.DUMMY.TOKEN.XXXX";
const ORIGIN = "http://localhost:5173";
const PEOPLE = 5000;
const WAVES = 150_000;
const POLLERS = 300;
const USERS = 1000;
const WAVES_PER_USER = 10;
const SIGNUP_CONCURRENCY = 25;
const WAVE_CONCURRENCY = 100;
/** Makes this run's test handles unique, so the script can run again on the same data. */
const RUN = Date.now().toString(36).slice(-5);

const status = stackStatus();
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(status.API_URL)) {
  console.error(`Refusing to load-test ${status.API_URL}: local stack only.`);
  process.exit(1);
}
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync("supabase/config.toml", "utf8"),
)?.[1];

/** One SQL statement inside the local database container (as `postgres`, or another role). */
function sql(query, role = "postgres") {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      role,
      "-d",
      "postgres",
      "-At",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

function ms(value) {
  return `${Math.round(value)} ms`;
}

function stats(times) {
  const sorted = times.toSorted((a, b) => a - b);
  return `p50 ${ms(percentile(sorted, 0.5))}, p95 ${ms(percentile(sorted, 0.95))}, max ${ms(sorted.at(-1) ?? 0)}`;
}

/** Runs `tasks` with at most `limit` in flight; resolves with every result in order. */
async function pool(tasks, limit) {
  const results = Array.from({ length: tasks.length });
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each worker runs its tasks one by one
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** An error's message plus its network cause (`ECONNRESET`, …) when fetch hides it. */
function describe(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = /** @type {{ code?: string, message?: string } | undefined} */ (error.cause);
  const detail = cause?.code ?? cause?.message;
  return detail ? `${error.message} (${detail})` : error.message;
}

async function timed(fn) {
  const start = performance.now();
  try {
    await fn();
    return { ms: performance.now() - start, error: null };
  } catch (error) {
    return { ms: performance.now() - start, error: describe(error) };
  }
}

async function rest(fn, body, headers = {}) {
  const res = await fetch(`${status.API_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: status.PUBLISHABLE_KEY, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text.slice(0, 120)}`);
  return text;
}

const results = [];
const report = (name, value) => {
  results.push([name, value]);
  console.log(`${name}: ${value}`);
};

/**
 * `--fast-commit`: Docker Desktop's disk makes every local commit wait ~250 ms for fsync, which
 * caps local writes near 35/s whatever the app does. This turns synchronous commit off on the
 * local test database for the run (restored at the end) so the numbers show the app's own locks
 * and queries. Hosted Postgres commits in a few milliseconds.
 */
const FAST_COMMIT = process.argv.includes("--fast-commit");
function setSynchronousCommit(on) {
  // Only the local stack's superuser may change it; `postgres` isn't one.
  sql(`alter system set synchronous_commit = ${on ? "on" : "off"}`, "supabase_admin");
  sql("select pg_reload_conf()", "supabase_admin");
}

// ---- seed ---------------------------------------------------------------------------------------
if (!process.argv.includes("--skip-seed")) {
  run("pnpm", ["db:seed", `--people=${PEOPLE}`, `--waves=${WAVES}`]);
  run("supabase", ["db", "reset"]);
}
if (FAST_COMMIT) setSynchronousCommit(false);
report("Commit mode", FAST_COMMIT ? "synchronous_commit off (--fast-commit)" : "default (fsync)");
report("Seeded beans", sql("select count(*) from private.people"));
report("Seeded waves", sql("select count(*) from private.waves"));

// ---- the snapshot -------------------------------------------------------------------------------
const venueRuns = [];
let venueBytes = 0;
let cursor = "";
for (let i = 0; i < 10; i++) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- one after another, to time each alone
  const run1 = await timed(async () => {
    const text = await rest("get_venue", {});
    venueBytes = text.length;
    cursor = JSON.parse(text).cursor;
  });
  venueRuns.push(run1.ms);
}
const beans = Number(sql("select count(*) from private.people where status = 'visible'"));
report(
  "get_venue size",
  `${(venueBytes / 1024).toFixed(0)} KB, ${(venueBytes / beans).toFixed(0)} B per bean`,
);
report("get_venue time (10 runs)", stats(venueRuns));

// ---- 300 pollers --------------------------------------------------------------------------------
const since = new Date(Date.parse(cursor) - 60_000).toISOString();
for (let round = 1; round <= 3; round++) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- rounds are sequential on purpose
  const polls = await Promise.all(
    Array.from({ length: POLLERS }, () => timed(() => rest("get_venue_changes", { since }))),
  );
  const failed = polls.filter((p) => p.error);
  report(
    `get_venue_changes, ${POLLERS} at once (round ${round})`,
    `${stats(polls.map((p) => p.ms))}, ${failed.length} errors${failed[0] ? ` (first: ${failed[0].error})` : ""}`,
  );
}

// ---- 1,000 joined people ------------------------------------------------------------------------
await requireTurnstile();
const TOPICS = [
  "ai",
  "prediction",
  "defi",
  "privacy",
  "stablecoins",
  "core",
  "security",
  "wallets",
  "consumer",
  "jobs",
];
const signups = await pool(
  Array.from({ length: USERS }, (_, i) => async () => {
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInAnonymously({
      options: { captchaToken: CAPTCHA },
    });
    if (error || !data.session) throw new Error(`sign-in ${i}: ${error?.message}`);
    const profile = await client.rpc("upsert_profile", {
      name: `Load Tester ${i}`,
      topics: [TOPICS[i % TOPICS.length], TOPICS[(i * 7 + 3) % TOPICS.length]].filter(
        (t, k, all) => all.indexOf(t) === k,
      ),
      intents: [],
      one_liners: [],
      avatar: [i % 6, i % 12, i % 9, i % 4],
      telegram: `lt${RUN}_${String(i).padStart(4, "0")}`,
      x: "",
      consent: true,
    });
    if (profile.error) throw new Error(`profile ${i}: ${profile.error.message}`);
    return { client, token: data.session.access_token, id: profile.data.id };
  }),
  SIGNUP_CONCURRENCY,
);
report("Joined test users", signups.length);

/** One `deal-hand` call as this user, timed. */
function dealHand(user) {
  return timed(async () => {
    const res = await fetch(`${status.API_URL}/functions/v1/deal-hand`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        apikey: status.PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Origin: ORIGIN,
      },
      body: "{}",
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 100)}`);
  });
}

// ---- the 06:00 rush: 1,000 deal-hand calls at once ----------------------------------------------
const functions = await serveFunctions(status, ORIGIN);
try {
  const deals = await Promise.all(signups.map((u) => dealHand(u)));
  const failed = deals.filter((d) => d.error);
  report(
    `deal-hand, ${USERS} at once`,
    `${stats(deals.map((d) => d.ms))}, ${failed.length} errors${failed[0] ? ` (first: ${failed[0].error})` : ""}`,
  );
  // The realistic rush: everyone opens Meet within the first minutes after 06:00, so about 100
  // requests are in flight at a time. Hands already dealt above come back at once (ready path).
  const paced = await pool(
    signups.map((u) => () => dealHand(u)),
    100,
  );
  const pacedFailed = paced.filter((d) => d.error);
  report(
    "deal-hand, 100 in flight (all 1,000 users)",
    `${stats(paced.map((d) => d.ms))}, ${pacedFailed.length} errors${pacedFailed[0] ? ` (first: ${pacedFailed[0].error})` : ""}`,
  );
  report("Hands stored", sql("select count(*) from private.daily_hands"));
} finally {
  functions.stop();
}

// ---- wave throughput ----------------------------------------------------------------------------
const seedIds = sql(
  "select id from private.people where source = 'demo' order by random() limit 2000",
).split("\n");
// Real people wave one at a time, so consecutive tasks come from different people: wave k of
// everyone, then wave k + 1. (Each person's waves are serialised by their advisory lock; firing
// one person's waves all at once would only measure that queue.)
const rpcTask = (client, target) => () =>
  timed(async () => {
    const { error } = await client.rpc("wave", { target });
    if (error) throw new Error(error.message);
  });
const waveTasks = [];
for (let k = 0; k < WAVES_PER_USER; k++) {
  signups.forEach((u, i) => {
    waveTasks.push(rpcTask(u.client, seedIds[(i * WAVES_PER_USER + k) % seedIds.length]));
  });
}
// Then pairs of test users wave at each other at the same moment: the pair lock must make
// exactly one chai per pair.
signups.forEach((u, i) => {
  const partner = signups[i ^ 1];
  if (partner) waveTasks.push(rpcTask(u.client, partner.id));
});
const waveStart = performance.now();
const waves = await pool(waveTasks, WAVE_CONCURRENCY);
const seconds = (performance.now() - waveStart) / 1000;
const waveErrors = waves.filter((w) => w.error);
report(
  `Waves, ${waveTasks.length} with ${WAVE_CONCURRENCY} in flight`,
  `${(waveTasks.length / seconds).toFixed(0)} waves/s, ${stats(waves.map((w) => w.ms))}, ${waveErrors.length} errors`,
);
if (waveErrors.length > 0) report("wave first error", waveErrors[0].error);
report(
  "Deadlocks reported by Postgres",
  sql("select deadlocks from pg_stat_database where datname = current_database()"),
);
report(
  "Mutual test pairs with exactly one chai",
  `${sql(`select count(*) from private.chais c join private.people a on a.id = c.a_id join private.people b on b.id = c.b_id where a.source = 'self' and b.source = 'self'`)} of ${USERS / 2}`,
);
report(
  "People whose points don't match a recount",
  sql(`select count(*) from private.people p
         where p.wave_points <> (select count(*) from private.waves w where w.to_id = p.id)`),
);

if (FAST_COMMIT) setSynchronousCommit(true);

console.log("\n| Measure | Result |\n| --- | --- |");
for (const [name, value] of results) console.log(`| ${name} | ${value} |`);
