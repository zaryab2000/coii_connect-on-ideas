# Adda — Plan

> _adda_ (Hindi/Urdu): the spot where friends gather and talk for hours.
> Find your people at Devcon by **ideas**, not logos.

Name: **Adda** (final). On-site wordmark: "gm adda". Free web address: `gmadda.pages.dev`
(`adda.pages.dev` is taken). The repo folder is still `conDevCon`; renaming it is optional.

A playful live map of a cartoon venue. Every booth is a topic (AI Agents, Prediction Markets,
DeFi, …). Every registered attendee is a tiny "bean" human hanging around the booths they care
about. Tap a bean to see how to reach them, then DM them. A sortable list view sits next to the map.

---

## 1. Facts & constraints

|               |                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Event         | **Devcon 8**: 3–6 Nov 2026, Jio World Centre, BKC, Mumbai                                                                             |
| Today         | 1 Oct 2026, so **~33 days** to the event                                                                                              |
| Budget        | **$0** (a custom domain at ~$10/yr is the only optional spend)                                                                        |
| Platforms     | **Responsive web only**: phone, tablet, desktop browsers. No native app, PWA, or Mini App                                             |
| Data          | Seeded dummy data for the demo (70% Indian names, 30% international); real data later from opt-in sign-ups and organizer opt-in lists |
| Current focus | **Localhost demo only.** No external services (Telegram, Supabase, hosting) until the demo is approved                                |
| X / Twitter   | No X API at all. An X handle is just an optional, self-reported text field                                                            |

Devcon 8 official tracks (for reference): Core Protocol · Privacy & Consent · Security · Futures
Worth Building · Users, Builders & Agents · Rights, Freedoms & Governance · Applied Cryptography ·
Permissionless Networks · Open & Verifiable Stack.

---

## 2. The experience

**Opening the site:** a bright, sticker-style venue fills the screen. Ten colorful booths sit around
a central chai-stall plaza. Hundreds of tiny beans wander, chat in pairs (emoji speech bubbles),
sip chai, and walk between booths. Each booth shows a live counter badge and grows with its crowd.

**Core loop:** browse → tap a bean → profile card (name, topics, one-liner, Telegram/X buttons)
→ DM them.

### Signature moments (the parts people will screenshot)

1. **Your arrival.** You register and the camera swoops to the entrance gate. Your bean walks in
   under confetti with a "YOU" marker, nearby beans wave, and it heads to your booth. A share card
   pops up: "I'm hanging at the 🕶️ Privacy booth. Come find me."
2. **Yeet physics.** Grab any bean (drag on desktop, long-press on mobile). Its legs flail. Fling
   it and it bounces, gets dizzy stars, shows a "!" and sprints back to its booth.
3. **Commuters.** People with 2–3 interests walk between their booths. Shirt color = primary topic,
   so a green DeFi shirt strolling into the Privacy zone is visibly a cross-pollinator.
4. **Desire paths.** The floor wears visible paths between booths in proportion to shared
   interests. The map doubles as a data viz of how ideas connect.
5. **Find my tribe.** One tap dims everyone except people who share 2+ of your topics, plus a
   ranked list of them.
6. **Where's Waldo search.** Search a name and the camera flies to that bean, which jumps and
   waves under a spotlight.
7. **Booth puns.** The DeFi booth is a literal _liquidity pool_ with beans on floaties. Beans in the
   Privacy zone wear hoodies and shades and look slightly pixelated. Prediction Markets has a
   ticker board ("YES 62¢"). Tiny robot NPCs carrying coins roam AI Agents. Jobs has a bulletin
   board with flying résumés.
8. **Live ticker.** "🆕 Priya joined Privacy + Stablecoins · 🔥 AI Agents hit 200 · 🤝 Top combo:
   DeFi × Prediction Markets"
9. **Mumbai flavor.** Marigold garlands over booths, a chai tapri plaza, an auto-rickshaw at the
   gate, pigeons, kites, a BKC skyline backdrop, and day/night that follows IST.
10. **Kiosk mode** (`?kiosk=1`) for a venue screen: the camera auto-tours booths, counters are big,
    and a QR code says "Join the map". This is the strongest growth lever if organizers give us a
    screen.

The movement is simulated in each browser. It never represents anyone's real location. The server
only knows who is interested in what.

---

## 3. Features by priority

**P0: Playable demo (dummy data, no backend)**

- Venue with 10 booths, 1,500 seeded demo beans: wander, idle animations, pair chats, commuting
- Tap/click a bean to open its profile card (bottom sheet on mobile, side card on desktop)
- Drag/fling physics with run-back; long-press to grab on touch so it doesn't fight panning
- Pan / zoom / pinch; tap a booth to zoom in and list everyone there
- People list: search, multi-topic filter (any/all), sort (newest, name, best match), "locate on map"
- Join form that adds you locally (arrival animation)
- Runs on **localhost** with seeded demo data (70% Indian / 30% international names, `demo_*`
  handles); no external services

**P1: Real registrations**

- Supabase schema + RLS; writes only through Edge Functions
- Two sign-up paths: **Telegram Login** (verified ✓) and an **open form** (self-reported, no ✓)
- Optional X handle (plain text, no API)
- Live arrivals via Realtime, with a polling fallback
- Edit / delete yourself; report button; name blocklist; no URLs in free text
- Bean customizer (skin, hair, accessory, 🎲 reroll); consent checkbox; privacy page

**P2: Delight & growth (public launch)**

- Find my tribe, Where's Waldo search, live ticker, trending 🔥 booth, milestone celebrations
- Desire paths, booth pun props, NPCs (robots, pigeons, chai-wala; never fake attendees)
- Share card (OG image) per person/booth
- Organizer CSV import + "claim your avatar" via Telegram login

**P3: Event week**

- Kiosk mode, stats page for organizers (topic counts, top topic pairs), sound (off by default)
- Load test (5k people, simulated viewers), usage monitoring, moderation runbook

**Stretch (only if time allows)**

- _Meetup flares_: light a time-boxed beacon on a booth ("Agentic payments jam, 4pm, Hall 2")
- _Handshake QR_: scan each other's QR in person and both beans get a 🤝 stamp
- _Multiplayer yeets_: others see your throws live (Realtime broadcast)
- Optional "I am…" prop: builder 💻 / founder 🚀 / investor 💼 / hiring 📣 / job-hunting 📄
- ENS name/avatar via Sign-In with Ethereum

---

## 4. Booths (default proposal: 10)

| Booth                           | Emoji | Notes                        |
| ------------------------------- | ----- | ---------------------------- |
| AI Agents & Agentic Payments    | 🤖    | robot NPCs                   |
| Prediction Markets              | 🔮    | ticker board                 |
| DeFi                            | 🏊    | liquidity pool pun           |
| Privacy & ZK                    | 🕶️    | blur/hoodie effect           |
| Stablecoins & Payments          | 💵    |                              |
| Core Protocol & Scaling (L1/L2) | ⛓️    |                              |
| Security                        | 🛡️    |                              |
| Wallets & UX                    | 👛    |                              |
| Consumer, Social & Gaming       | 🎮    |                              |
| Jobs & Hiring                   | 💼    | hirers and seekers meet here |

Rules: 1–3 topics per person (beyond 3 the map stops carrying signal). Topics live in a DB table,
so booths can change without a code change. 8–12 booths is the readable maximum on a phone.

---

## 5. Identity & trust (decided: Telegram + open form)

Crypto conferences attract scammers. A public list of attendee Telegram handles will draw fake
"Devcon Support" profiles and impersonators. A Devcon Telegram group already exists, which makes
Telegram the natural primary sign-up.

- **Telegram Login (primary).** Telegram's signed payload verifies the handle, and the bean gets a
  ✓ badge. One bean per Telegram account. Edit/delete by logging in again.
- **Open form (secondary).** Our own on-site form that looks and feels like a Google Form: name +
  handle + topics, protected by Cloudflare Turnstile and a secret edit link. These handles are
  self-reported and show no ✓. The list view can filter to "verified only".
- **X handle:** optional plain text. No X API anywhere (X ended its free API tier for new
  developers in Feb 2026).

For the localhost demo, both paths are mocked: "Join" adds you locally, with no external calls.

### 5a. Verifying Devcon ticket holders (researched 1 Oct 2026)

**Current state: we can't do it alone.**

- Devcon 8 tickets run on Pretix (`tickets.devcon.org`), which has no public verification API.
- General Admission tickets are anonymous and transferable.
- The public "Devcon 8 India 🇮🇳" Telegram group (~2k members) has an open invite link on
  devcon.org, so membership proves nothing.
- Self.xyz is used only for Indian residency at purchase.

Three ways that work, each needing one thing from organizers:

| Path                      | How                                                                                                                                                       | Needs                                                                                                                                        | Privacy                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Zupass ticket proof**   | "Verify with Zupass" popup returns a zero-knowledge proof (`@pcd/zuauth`) that the user holds a Devcon 8 ticket. A nullifier gives one profile per ticket | Devcon 8 tickets issued in Zupass, as at Devcon 7 (2024). Not yet announced for Devcon 8                                                     | Best: reveals nothing but "has a ticket" |
| **Gated chat membership** | After Telegram sign-in, our bot calls `getChatMember` on the official ticket-gated attendee chat                                                          | That chat exists (Zupass-gated at Devcon 7 and Devconnect ARG; invite sent ~8 days before the event), and organizers add our bot as an admin | Reveals only membership                  |
| **Invite codes by email** | We generate single-use codes; organizers mail-merge one per ticket holder into a pre-event email                                                          | Organizers willing to send it                                                                                                                | We never see attendee data               |

Not recommended:

- Asking users for a ticket QR or order code: the QR secret is the entry credential, and short
  order codes can be brute-forced.
- On-chain ETH purchase checks: fiat buyers are excluded, tickets are transferable, and it links
  wallets to identities.
- POAP: it only proves attendance from day 1 of the event, so it's at most an event-week "here now"
  badge.

**Decision pending (owner):** launch open, with a "🎟️ ticket verified" badge and filter added
when a path becomes available? Or hard-gate sign-ups? Gating before late October likely means an
empty map, since the gated chat and Zupass tickets (if any) typically arrive about a week before
the event. The demo data includes a mocked badge state so the UI is designed for it.

---

## 6. Architecture & stack ($0)

```
  Browser (phone / tablet / desktop)
 ┌──────────────────────────────────────────────┐
 │ React UI (list, sheets, forms)               │
 │ PixiJS venue canvas ← crowd sim runs locally │
 └──────┬─────────────────────────┬─────────────┘
        │ static files            │ read:  people_public view (anon key)
        │ (free, unlimited)       │ live:  Realtime row changes
   Cloudflare Pages               │ write: Edge Functions only
                          ┌───────▼─────────────────────────┐
                          │ Supabase (free)                 │
                          │ Postgres + RLS                  │
                          │ Edge Fns: join, update, delete, │
                          │           report                │
                          └─────────────────────────────────┘
```

| Layer          | Choice                                                       | Why                                                              |
| -------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| UI shell       | Vite + React + TypeScript                                    | Fast to build forms, sheets, list                                |
| Venue renderer | PixiJS (WebGL) + pixi-viewport                               | Thousands of animated sprites at 60fps; pinch/pan/zoom on mobile |
| Crowd sim      | Custom pure-TS module                                        | Behaviors are bespoke; pure functions are unit-testable          |
| List           | TanStack Virtual                                             | Smooth with thousands of rows                                    |
| Backend        | Supabase free                                                | Postgres, Realtime, Edge Functions, table editor for moderation  |
| Hosting        | Cloudflare Pages                                             | Static requests free and unlimited                               |
| Auth           | Telegram Login Widget (HMAC verified in Edge Fn) + open form | Free; verifies Telegram handles                                  |
| Anti-bot       | Cloudflare Turnstile                                         | Free                                                             |
| Art            | Procedural vector beans + hand-built booths; Google Fonts    | Zero asset cost, crisp at any zoom                               |

Exact package versions are looked up when scaffolding, not assumed.

**Why it stays free under load:** the simulation runs client-side, so there is no per-frame server
traffic. Each visit makes one snapshot read (~100 KB gzipped for 3k people) plus tiny realtime
deltas.

Supabase free limits: 500 MB DB · 5 GB egress · 200 concurrent Realtime connections · 2M Realtime
messages/mo · 500k Edge Function calls/mo · pauses after 1 week idle. Above 200 live viewers,
clients fall back to 60-second delta polling.

---

## 7. Data model (sketch)

```sql
create table topics (
  id text primary key,            -- 'privacy'
  label text not null,
  emoji text not null,
  color text not null,            -- shirt/booth color
  sort int not null
);

create table people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 40),
  telegram_user_id bigint unique,           -- from verified payload
  telegram text,                            -- 5–32 chars [a-z0-9_]
  x_handle text,                            -- 1–15 chars [A-Za-z0-9_], self-reported
  topics text[] not null check (cardinality(topics) between 1 and 3),
  one_liner text check (char_length(one_liner) <= 80),  -- "what I want to talk about"; URLs rejected
  avatar jsonb not null,                    -- skin, hair, accessory, seed
  source text not null check (source in ('self', 'organizer', 'demo')),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (telegram is not null or x_handle is not null)
);

create table reports (
  person_id uuid references people on delete cascade,
  reporter_telegram_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (person_id, reporter_telegram_id)
);
-- 3 unique reports → status = 'hidden' pending review.
-- people_public view exposes only safe columns where status = 'visible'.
-- RLS: anon can select people_public; no direct writes from clients.
```

Handle input accepts `@name`, `name`, `t.me/name`, and `x.com/name`, and normalizes all of them.
This normalizer gets property-based tests.

---

## 8. Crowd simulation

- **Agent states:** `arriving → wandering ⇄ idle → commuting → chatting`, plus
  `grabbed → thrown → dizzy → running_home`.
- **Steering:** seek target + separation (spatial hash grid) + booth avoidance.
- **Zones:** booth zone radius ∝ √(people), so crowded booths visibly swell.
- **Determinism:** appearance and initial placement are seeded by person id, so a bean looks the
  same on every device.
- **Loop:** fixed 30 Hz sim step, render interpolation, pauses when the tab is hidden.
- **Level of detail:** zoomed out, beans render as simple dots. A crowded booth caps rendered beans
  and shows "+212".
- **Accessibility:** `prefers-reduced-motion` gives a static crowd and no physics. The list view is
  the full accessible alternative to the canvas.
- **Performance budget:** 3,000 beans at 60fps on desktop and ≥30fps on a mid-range Android.

---

## 9. Art direction

**Recommended: "sticker-pop".** Flat vector, chunky dark outlines, saturated palette, squash-and-
stretch bean people (Fall Guys energy), and a chunky display font. It is procedural, so there are
no sprite sheets to buy and it stays crisp at every zoom level.

Alternatives considered: isometric pixel art (needs sprite sheets, gets fiddly when zoomed) and
3D low-poly (most "wow" but the slowest build and riskiest on phones with thousands of characters).

The project stays visually distinct from official Devcon branding unless organizers approve its use.
Label it "unofficial community project" until then.

---

## 10. Privacy, safety & consent

- Opt-in only. Minimal fields. Delete anytime. A clear "your handle will be public" consent.
- Organizer-supplied data only for people who explicitly consented to public display (GDPR and
  India's DPDP Act both require consent). A better route is organizers sending attendees the link.
- No URLs in free text (anti-phishing). Name blocklist: devcon, support, admin, official,
  ethereum foundation, helpdesk, airdrop, …
- Safety tip on every profile card: "No one legit will ask for your seed phrase or funds."
- Demo data uses obviously fake `demo_*` handles. Contact buttons are disabled in demo mode, since
  made-up handles may belong to real people.
- No tracking beyond privacy-friendly page analytics (Cloudflare Web Analytics, free).

**Organizer CSV template (consenting people only):**
`display_name, telegram, x_handle, topics (semicolon-separated ids), one_liner, consent_public (yes)`

---

## 11. Roadmap

### Stage A: localhost demo (now → ~Oct 6), no external services

| Step                          | What                                                                                                                                                                                              | Done when                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A1. Design direction**      | Use `frontend-design` to produce 2 directions: palette, fonts, bean character sheet, booth style, venue layout, phone + desktop UI. Delivered as a static HTML mockup plus Playwright screenshots | Owner picks one ✋                                                 |
| **A2. Scaffold & guardrails** | git init; Vite + React + strict TS; PixiJS v8 + pixi-viewport; pnpm supply-chain settings; oxlint/oxfmt; vitest + fast-check; Playwright; prek hooks                                              | `pnpm dev` shows an empty venue; all checks green                  |
| **A3. Demo data**             | 1,500 seeded people: 70% Indian (regional mix) / 30% international names; weighted topics with realistic overlaps; one-liners; mocked ✓ Telegram + 🎟️ ticket badges; `demo_*` handles             | Generator unit-tested (deterministic, distribution, valid handles) |
| **A4. Venue + crowd**         | 10 booths with live counters; procedural beans; wander / idle / chat / commute sim; pan / pinch / zoom; level of detail                                                                           | Living map; owner checks the crowd feel ✋                         |
| **A5. Interactions**          | Tap → profile card; grab / fling / dizzy / run home; booth sheet; search fly-to + wave; find my tribe                                                                                             | All work with mouse and touch                                      |
| **A6. UI shell**              | Phone tab bar (Map / People / Join); desktop side panel; People list (search, filter, sort, locate on map); Google-Form-style Join form with a mocked Telegram button → your bean walks in        | Full flow works end to end                                         |
| **A7. Polish & verify**       | Screenshots at 375 / 768 / 1440 px; perf budget (1,500 beans: 60fps desktop, ≥30fps phone); reduced motion; real-phone test over home Wi-Fi                                                       | Demo review with owner ✋                                          |

✋ = checkpoint where the owner reviews before work continues.

### Stage B: go live (after the demo is approved)

| Target  | Milestone                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| ~Oct 8  | Free accounts ready: GitHub, Supabase, Cloudflare, Telegram bot                                              |
| ~Oct 12 | Real sign-ups (Telegram ✓ + form), moderation, deploy to `gmadda.pages.dev`, soft launch to friends/speakers |
| ~Oct 19 | P2 delighters + **public launch** (Devcon 8 India Telegram group, X)                                         |
| ~Oct 30 | P3 done, load-tested, **feature freeze**                                                                     |
| Nov 3–6 | Event: monitor, moderate, kiosk mode on screens                                                              |

**In parallel (owner, any time):** the organizer conversation (§14).

If time runs short, cut in this order: stretch → P3 sound/stats → desire paths → booth puns.
Never cut: map, profile card, list, Telegram sign-up, moderation.

---

## 12. Risks

| Risk                     | Mitigation                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty map at launch      | Launch ~2 weeks early; seed with friends, speakers, organizer opt-ins; cozy booth design for small crowds; ambient NPCs that are clearly not people |
| Scammers / impersonation | Telegram-verified handles, blocklist, no URLs, report → auto-hide, safety tips                                                                      |
| Free-tier limits at peak | Static on CDN, client-side sim, snapshot + deltas, polling fallback                                                                                 |
| Phone performance        | WebGL, LOD, reduced motion, test on a real mid-range Android                                                                                        |
| Branding / endorsement   | "Unofficial" label unless organizers approve                                                                                                        |
| Supabase idle pause      | Ongoing dev + traffic keeps it active; check before launch                                                                                          |

---

## 13. Repo layout & tooling

```
conDevCon/            (package name: adda)
  .claude/skills/     project skills (PixiJS, mobile-native, animate, game feel, playwright-cli)
  src/
    engine/      PixiJS venue, rendering, camera
    sim/         pure-TS crowd simulation (unit-tested)
    ui/          React components (list, sheets, join flow)
    data/        API client, demo-data generator, handle normalizer
  supabase/
    migrations/  schema, RLS, views
    functions/   join, update, delete, report
  scripts/       import-csv.ts
  PLAN.md
```

Node 24 LTS (installed), ESM, pnpm (exact pins, `minimumReleaseAge 1440`, `ignore-scripts`), strict tsconfig,
oxlint + oxfmt, vitest (+ fast-check for parsers), Playwright smoke test (map loads, card opens,
list filters), prek hooks, GitHub Actions with SHA-pinned actions + zizmor.

---

## 14. What's needed from the owner

**Decided:**

- Name: Adda
- Sign-up: Telegram ✓ plus an on-site form
- Responsive web only
- No X API
- Ticket verification parked (launch open; add the 🎟️ badge later)

**Still open:**

- Art direction: picked at A1
- Final booth list: the default 10 unless changed

**Free accounts (~20 min):** GitHub repo, Supabase project, Cloudflare account, Telegram bot via
@BotFather. Secrets go into Supabase/Cloudflare secret stores directly, never into chat or the repo.

**From organizers:**

1. OK to reference Devcon 8 / use branding, or stay "unofficial"?
2. Distribution: newsletter/Telegram mention, QR posters, a venue screen for kiosk mode.
3. Data: opt-in lists only (CSV template above). Ideally they send attendees the link.
4. Ticket verification (see §5a):
   - Will Devcon 8 tickets be in Zupass? If so, what are the event ID and signer key?
   - Will there be a ticket-gated attendee Telegram chat? Can our bot be added as a read-only admin?
   - Failing both: can an Adda invite code go into a pre-event email?
5. Do they want the stats page (topic popularity, top combos) for their own planning?

**Optional:** a custom domain (~$10/yr); otherwise `gmadda.pages.dev`.
