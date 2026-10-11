# coii

Find your people at Devcon by **ideas**, not logos. A live cartoon venue where every booth is a
topic and every attendee is a tiny bean person hanging around the booths they care about. Tap
someone to see what they want to talk about and how to reach them.

> **coii**: connect on ideas & interests.

The app runs in one of two modes:

- **Demo mode** (no Supabase settings): a generated crowd (70% Indian, 30% international names),
  simulated arrivals and waves, everything kept in this browser. Vercel previews and the
  `pnpm test:e2e` suite run this way.
- **Backend mode** (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set): the shared
  database. Only real beans (and, until launch day, the seeded demo beans) show; no simulated
  crowd or waves ever run.

Product plan: [PLAN.md](PLAN.md).

## Run it

```bash
pnpm install          # Node 24, pnpm 10
pnpm dev              # http://localhost:5173 (also on your LAN for phone testing)
```

URL switches (combine with `&`):

| Param    | Effect                                                       |
| -------- | ------------------------------------------------------------ |
| `?debug` | FPS / frame time / particle overlay                          |
| `?still` | No live demo arrivals (handy for screenshots and tests)      |
| `?n=800` | Crowd size (10–4000, default 1500)                           |
| `?res=1` | Force canvas resolution (default `min(devicePixelRatio, 2)`) |

In dev builds `window.__coii` exposes `{ engine, controller }` for scripting.

## Scripts

| Command                 | What it does                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm check`            | Format check, lint (zero warnings), type check, unit tests                                      |
| `pnpm test`             | Unit and property tests (vitest + fast-check)                                                   |
| `pnpm test:e2e`         | Browser smoke tests on desktop and phone viewports, demo mode (uses system Chrome)              |
| `pnpm test:e2e:backend` | The app in backend mode against the local stack: join, wave, chai, report, leave, adda          |
| `pnpm dev:local`        | Dev server in backend mode against the local stack, Edge Functions included                     |
| `pnpm test:load`        | Load test on the local stack only: 5,000 beans, 150,000 waves, 1,000 users (`-- --fast-commit`) |
| `pnpm test:csp`         | Production build under the real CSP (local stack); fails on any CSP violation                   |
| `pnpm build`            | Type check + production build into `dist/`                                                      |
| `pnpm test:db`          | Database integration tests and Edge Functions over HTTP (local stack)                           |
| `pnpm test:functions`   | Deno unit tests for the Edge Functions                                                          |
| `pnpm db:seed`          | Writes `supabase/seed.sql`: 1,500 demo beans and ~15,000 waves                                  |
| `pnpm sync:shared`      | Copies the matching code the Edge Functions reuse into `supabase/functions/_shared`             |
| `pnpm db:types`         | Regenerates `src/backend/database.types.ts` from the local stack (`:check` compares)            |

Git hooks run through [prek](https://github.com/j178/prek): `prek install` once, then every commit
runs the same checks as `pnpm check`.

## Backend (Supabase)

The database, its functions and the Edge Functions live in `supabase/` (spec:
[docs/prd/database.md](docs/prd/database.md), operations: [docs/runbooks/database.md](docs/runbooks/database.md)).
The app's side of it is `src/backend/` (venue snapshot and deltas, Meet, adda, auth, realtime).
The snapshot comes through `api/venue.js`, a Vercel Function at `/api/venue` that Vercel's CDN
caches for 60 s; `pnpm dev` and `pnpm preview` serve the same function locally.

Needs Docker (local stack), the Supabase CLI and [Deno](https://deno.com) (`pnpm db:seed` and the
Edge Function tests run on Deno).

```bash
supabase start                      # local stack (needs Docker)
pnpm db:seed && supabase db reset   # schema + demo seed
supabase test db                    # pgTAP: security invariants, validation, operations
pnpm test:db                        # resets + seeds, then integration tests (needs internet)
pnpm dev:local                      # the app in backend mode against the local stack
pnpm test:e2e:backend               # resets + seeds, then the backend browser suite (~13 min)
```

Settings (all public; only these three may ever reach the browser):

| Variable                        | Means                                           |
| ------------------------------- | ----------------------------------------------- |
| `VITE_SUPABASE_URL`             | Backend mode when this and the key are set      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The `sb_publishable_…` key                      |
| `VITE_TURNSTILE_SITE_KEY`       | Cloudflare Turnstile site key for the join form |

`pnpm dev` and `pnpm build` read them from `.env.local` (gitignored). **If `.env.local` holds the
live project's values, `pnpm dev` talks to the live database**: use `pnpm dev:local` for local
work. Secret keys never go in the repo or the browser.

## Deploy (Vercel)

`coii.decipherclub.com` is a Vercel project built from `main` (`vercel.json`: build, rewrites for
`/join`, `/privacy` and `/telegram`, security headers and the Content-Security-Policy).

| Vercel environment | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY` | Result                                   |
| ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Production         | set                                                                             | backend mode, the live database          |
| Preview            | empty                                                                           | demo mode: PRs never write to production |

The same two Supabase values feed `api/venue.js` (the CDN-cached snapshot). Nothing secret goes
into Vercel. Without them the site runs in demo mode, as it does today.

## How it works

```
src/
  data/    demo crowd generator, topics, handles, people source (demo timer today)
  sim/     pure-TS crowd simulation: layout, spots, steering, grab/throw physics (unit-tested)
  engine/  PixiJS venue: one ParticleContainer draws the whole crowd, own camera + gestures
  app/     store + controller (the only place UI actions reach the engine)
  ui/      React panels, HUD, sheets, design tokens
```

- **One draw call crowd.** All bean parts are drawn once with Canvas2D into a mip-mapped atlas;
  each frame the visible crowd is written into a single `ParticleContainer` in depth order.
- **Simulation is client-side.** Movement is simulated in every browser at 30 Hz; it never
  represents anyone's real location. The server (later) only needs to know who is interested in
  what.
- **Engine outside React.** The engine is a module singleton; React only attaches its canvas, so
  StrictMode and re-renders never create a second WebGL context.
- **Accessible alternative.** Booth labels are real buttons, and the People list mirrors
  everything on the map.

## Credits

Emoji icons: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT, see
`src/assets/icons/LICENSE-fluentui-emoji.txt`). Fonts: Baloo 2 and Mukta by Ek Type (OFL).
