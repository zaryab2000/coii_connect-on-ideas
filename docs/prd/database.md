# PRD: Database and backend (Supabase)

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| Status       | Approved by owner for build · 2 Oct 2026                                              |
| Covers       | Tracker L2 (real sign-ups), L3 (live arrivals), L4 (moderation), Meet Phase 1 backend |
| Supersedes   | Meet PRD §8 data model, wave points PRD §3 backend notes (both now point here)        |
| Project      | Supabase `coii` · ref `fqemvlxftoixmihcmhmt` · Mumbai (`ap-south-1`) · Postgres 17    |
| Live app URL | `https://www.decipherclub.com/coii/` (hosting itself is a separate task)              |
| Event        | Devcon 8, 3–6 Nov 2026, Jio World Centre, Mumbai                                      |

This document is the single source of truth for the backend. Build it phase by phase (§20). Each
✋ checkpoint needs the owner's explicit go before you continue, and nothing touches the remote
project (`db push`, `functions deploy`, `secrets set`, dashboard changes) without that go.

---

## 1. Goal and scope

Replace the browser-only demo state (`coii:you:v1`, `coii:meet:v1`, `coii:points:v1` in
localStorage) with a shared backend, so real people can join, see each other, wave, earn wave
points, match ("Chai's on!"), and be moderated, all inside the Supabase free plan.

**In scope:** schema, security, database functions (RPC), Edge Functions, auth (anonymous +
Google + Telegram verification), personal realtime events, dummy data and its purge, connecting
the app (backend mode), backups, database CI, scheduled jobs, the admin runbook, and doc updates.

**Out of scope here** (separate tasks): hosting on `decipherclub.com`, the Cloudflare cache in
front of the venue snapshot (§13; required before public launch), meetup flares, handshake QR,
ticket verification, the demo-crowd mixing rule (tracker L5), Pause Meet, unblock, organizer CSV
import, any anti-farming rules beyond the 50/day wave cap.

## 2. Owner decisions (locked)

| Topic             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database          | Supabase free plan, one project, Mumbai                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Auth              | **Supabase Auth only.** Joining creates an anonymous Supabase session (Turnstile-protected). Nobody needs Telegram to join                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Account recovery  | Optional **Google** ("Save my bean") links the anonymous account; "Sign in with Google" restores it on another device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Telegram          | Optional **verification** only: proves the handle and adds the ✓ badge. Not a login method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Handles           | At least one of Telegram or X is required to join (already enforced by `validateJoin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Waves             | One per pair, ever. Final, except Unmatch and Block remove them. 50 per Meet day, refilling at 06:00 IST. Who waved stays private until mutual. A wave unlocks the target's handles. Open-form users can wave                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Points            | Every wave counts (no verification requirement for now). Points = number of people who currently have a wave to you                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Leaderboard       | All-time board plus a **Today** tab (points from waves received this Meet day). Hidden (reported) people are not on either                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 18+ gate          | **None.** Remove it from the docs (§18). No code exists for it; don't add a switch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Dummy data        | Allowed now, tagged `source = 'demo'`, purged with one function call before launch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Production domain | `https://www.decipherclub.com/coii/` (owner already holds `decipherclub.com` on Cloudflare)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Links             | **General rule** (owner, 2 Oct): `http(s)://`, `www.`, or any `word.word` whose part after the dot is 2+ letters (`claimdrop.ai`, `t.me`, `uniswap.org`). Numbers after the dot are fine (`v2.0`, `3.5`). Applies to one-liners as written. **Names** (re-review, 2 Oct) allow initials: there a link is `http(s)://`, `www.`, the short domains `t.me` / `x.com` / `t.co`, or 2+ characters before the dot with an all-lowercase or all-caps ending, so `K.Ravi Kumar`, `S.Priya`, `A.R.Rahman` and `Dr.Anita Rao` pass; error `coii:name_link_not_allowed`. Trade-off accepted: "I build with Node.js" is refused; the error says why |
| @mentions         | One-liners may not contain `@` followed by a letter, digit or underscore. Error `coii:mention_not_allowed`; copy: "No @usernames here. Your handles show after someone waves."                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Invisible text    | Zero-width and bidi format characters and blank-rendering characters (Hangul fillers, Braille blank) are stripped from names and one-liners before any check (they could hide a blocked word or a link)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Report weight     | Every report is stored, but auto-hide counts only reporters whose bean was at least 24 hours old when they reported, and only reports an admin hasn't reviewed. Newer accounts' reports never count, even later; they stay in the review queue                                                                                                                                                                                                                                                                                                                                                                                          |
| Going public      | **Launch gate:** no public posts (Devcon Telegram group, X) until the Cloudflare cache in front of `get_venue` is live (§13). Friends and testers are fine before that                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Deferred          | Point-farming protections, Cloudflare caching of the snapshot (hosting task)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 3. Facts and environment (already done)

| Item                      | State                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Supabase project          | `coii`, ref `fqemvlxftoixmihcmhmt`, `https://fqemvlxftoixmihcmhmt.supabase.co`, Postgres 17, healthy                          |
| CLI                       | Supabase CLI 2.119.0, owner logged in, repo **linked**. `supabase/config.toml` exists from `supabase init`, **not committed** |
| Docker                    | Installed and running (29.4.0), so `supabase start` and `supabase test db` work locally                                       |
| `.env.local` (gitignored) | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) are set                                          |
| Edge Function secret      | `TELEGRAM_BOT_TOKEN` is set on the remote project                                                                             |
| Telegram bot              | `@coii_bot`, branded; `/setdomain` not done yet (needs the live domain)                                                       |
| GitHub repo               | `zaryab2000/coii_connect-on-ideas` is **public**: no secrets, dumps or personal data may ever land in it or its artifacts     |

**Secret rules:** the secret key (`sb_secret_…`), legacy `service_role` key, DB password, bot
token, Google client secret and Turnstile secret never appear in the repo, in chat, in logs or in
client code. Edge Functions read the built-in `SUPABASE_URL`, the new `SUPABASE_PUBLISHABLE_KEYS` /
`SUPABASE_SECRET_KEYS` JSON (falling back to the legacy `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY`) and `TELEGRAM_BOT_TOKEN` from the environment. Only the
publishable key ships to the browser.

### Free-plan limits we design for (checked on supabase.com, 2 Oct 2026)

| Limit                | Free              | Design consequence                                                                |
| -------------------- | ----------------- | --------------------------------------------------------------------------------- |
| Database size        | 500 MB            | Not a concern: ~1 KB per person, ~150–200 B per wave (§13)                        |
| Egress               | 5 GB / month      | **The binding limit.** Likely metered on uncompressed bytes. §13 is mandatory     |
| Realtime concurrent  | 200               | Only joined users connect, only to their own private topic; polling fallback      |
| Realtime messages    | 2 M / month       | Each broadcast counts 1 sent + 1 per receiver. **No venue-wide broadcasts** (§11) |
| Edge Function calls  | 500 k / month     | Only 3 functions, called rarely (hand deal, Telegram link, delete)                |
| Monthly active users | 50 k              | Fine                                                                              |
| Backups              | None              | Own encrypted nightly dump (§16)                                                  |
| Pausing              | After 7 idle days | Daily backup job doubles as a keep-alive                                          |
| PostgREST `max_rows` | 1,000 rows        | Never return the crowd as table rows; the snapshot is one JSON value (§8.2)       |

## 4. URLs and origins

Production app: `https://www.decipherclub.com/coii/` (canonical; always with `www` and the trailing
slash). The browser origin is `https://www.decipherclub.com`. Local dev: `http://localhost:5173`.

| Where                                         | Value                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Supabase Auth → Site URL                      | `https://www.decipherclub.com/coii/`                                                              |
| Supabase Auth → Redirect URLs (allow list)    | `https://www.decipherclub.com/coii/**`, `http://localhost:5173/**`                                |
| Google OAuth client → Authorized JS origins   | `https://www.decipherclub.com`, `http://localhost:5173`                                           |
| Google OAuth client → Authorized redirect URI | `https://fqemvlxftoixmihcmhmt.supabase.co/auth/v1/callback`                                       |
| Telegram `/setdomain` for `@coii_bot`         | `www.decipherclub.com` (owner, once the site is live)                                             |
| Turnstile widget hostnames                    | `www.decipherclub.com` (local dev uses Cloudflare's always-pass test keys)                        |
| Edge Function CORS allow list                 | `ALLOWED_ORIGINS` env: `https://www.decipherclub.com,http://localhost:5173`; reject anything else |
| OAuth `redirectTo` in the client              | `location.origin + import.meta.env.BASE_URL` (Vite `base` becomes `/coii/` in the hosting task)   |

The Supabase session lives in localStorage on `www.decipherclub.com`, which the rest of the
decipherclub site shares. Any script on that origin can read it. Flag this in the hosting task:
no third-party scripts on `www.decipherclub.com` pages.

## 5. Architecture

```
 Browser (React + PixiJS; crowd sim stays client-side)
   │
   ├─ anon or signed in ─► RPC  get_venue() / get_venue_changes(since)      (polling, §13)
   ├─ signed in ─────────► RPC  upsert_profile, wave, get_meet_state, ...    (all writes)
   ├─ signed in ─────────► Edge Functions  deal-hand, telegram-link, delete-account
   └─ signed in ─────────► Realtime private topic  user:<auth uid>          (personal events)
                                   │
                    Supabase ──────┴──────────────────────────────────────────────
                    schema private : all tables (NOT exposed by the Data API)
                    schema public  : only RPC functions (SECURITY DEFINER), no tables
                    pg_cron        : orphan cleanup, tombstone prune, post-event purge
```

Principles:

1. **Tables live in a `private` schema** that the Data API does not expose. Even a broken policy
   can't leak a table through REST. RLS is still enabled on every table (defence in depth).
2. **The browser never touches tables.** Every read and write is a function in `public` with an
   explicit grant (§12). Functions validate everything; the client's validation is only UX.
3. **Edge Functions only where a secret or shared TypeScript is needed**: Telegram signature
   (bot token), deleting the auth user (admin API), and dealing hands (reuses `src/match/*`).
   Everything else is SQL, so it's transactional, fast and doesn't count as a function call.
4. **The crowd movement never reaches the server.** The server only knows profiles, waves, chais,
   hands and moderation state.
5. **Venue updates are pulled, personal events are pushed.** See §11 and §13 for the maths.

## 6. Data model

All tables in schema `private`. All timestamps are `timestamptz`. All foreign keys to people use
`on delete cascade`. Text limits match the client constants named in brackets; a parity test
(§17) fails if they drift.

### 6.1 Reference values (from the code)

| Thing               | Allowed values                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Topic ids           | `ai, prediction, defi, privacy, stablecoins, core, security, wallets, consumer, jobs` (`TOPIC_IDS`)                                     |
| Intent ids          | `building, hiring, job_hunting, cofounder, raising, investing, researching, learning, vibing` (`INTENT_IDS`)                            |
| Avatar              | `skin 0–5` (`SKIN_TONES`), `hair 0–11` (`HAIR_STYLES`), `hair_color 0–8` (`HAIR_COLORS`), `accessory 0–3` (`ACCESSORIES`)               |
| Name                | 1–40 chars after cleaning (`cleanText`: invisible characters stripped, whitespace collapsed), no links per `name_has_link` (`NAME_MAX`) |
| Topics              | 1–3, distinct, first = primary (`TOPICS_MAX`)                                                                                           |
| Intents             | 0–2, distinct (`INTENTS_MAX`)                                                                                                           |
| One-liners          | 0–3 (`ONE_LINERS_MAX`), each 1–80 chars (`ONE_LINER_MAX`), no links, no @usernames                                                      |
| Telegram handle     | `^[A-Za-z][A-Za-z0-9_]{4,31}$` (`TELEGRAM_PATTERN`), bare, no `@`                                                                       |
| X handle            | `^[A-Za-z0-9_]{1,15}$` (`X_PATTERN`), bare, no `@`                                                                                      |
| Waves per Meet day  | 50 (`WAVES_PER_DAY`), counted in `wave_quota`, which unmatch and block never lower                                                      |
| Skip length         | 7 Meet days (`SKIP_DAYS`)                                                                                                               |
| Bonus cards per day | max 3 (`BONUS_MAX`); base hand size 3 (`HAND_SIZE`)                                                                                     |

### 6.2 Helper functions (private, immutable)

- `private.meet_day(ts timestamptz) returns date` = `((ts at time zone 'UTC') - interval '30 minutes')::date`.
  This is exactly `meetDay()` in `src/match/day.ts` (IST is UTC+5:30, days roll at 06:00 IST,
  so the boundary is 00:30 UTC). **Do not** write `at time zone '+05:30'`: Postgres reads POSIX
  offsets with the sign inverted.
- `private.current_meet_day()` = `private.meet_day(now())`.
- `private.has_link(t text) returns boolean`: the server twin of `containsLink()` in
  `src/data/handles.ts`: `t ~* '(https?://|www\.|\y[a-z0-9-]+\.[a-z]{2,}\y)'` (§2 Links).
  Postgres uses `\y` for a word boundary; `\b` means backspace there.
- `private.name_has_link(t text) returns boolean`: the name rule (§2 Links), twin of
  `nameHasLink()` in `src/data/handles.ts`.
- `private.has_mention(t text) returns boolean`: `t ~* '@[a-z0-9_]'`, twin of `containsMention()`
  in `src/data/oneLinerRules.ts`.
- `private.strip_invisible(t text) returns text`: removes U+00AD, U+200B–200F, U+202A–202E,
  U+2060–2064, U+2066–2069, U+FEFF and the blank-rendering U+115F, U+1160, U+2800, U+3164 and U+FFA0
  (same list as `INVISIBLE` in `src/data/handles.ts`).
- `private.clean_name(t text) returns text`: `strip_invisible`, then trim and collapse runs of
  whitespace (newlines and Unicode spaces such as U+00A0 and U+3000 included) to one space. Twin
  of `cleanText()` in `src/data/handles.ts`.
- `private.clean_one_liners(lines text[]) returns text[]`: mirrors `cleanLines()` in
  `src/ui/joinDraft.ts`: `clean_name` each line, drop blanks, drop case-insensitive repeats, keep
  order.

### 6.3 Tables

**`private.people`**: one row per bean.

| Column                                    | Type / rule                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                      | `uuid` PK, default `gen_random_uuid()`. This is the public person id used everywhere in the app                                  |
| `user_id`                                 | `uuid` unique, nullable, FK `auth.users(id) on delete cascade`                                                                   |
| `source`                                  | `text` in (`self`, `demo`); `check ((source = 'demo') = (user_id is null))`                                                      |
| `name`                                    | `text`, length 1–40, must equal `private.clean_name(name)`                                                                       |
| `topics`                                  | `text[]`, cardinality 1–3, `<@` the 10 topic ids, no duplicates                                                                  |
| `intents`                                 | `text[]` default `'{}'`, cardinality ≤ 2, `<@` the 9 intent ids, no duplicates                                                   |
| `one_liners`                              | `text[]` default `'{}'`, cardinality ≤ 3, each 1–80 chars, none `has_link`                                                       |
| `skin`, `hair`, `hair_color`, `accessory` | `smallint` with the ranges in §6.1                                                                                               |
| `telegram_verified`                       | `boolean` default false                                                                                                          |
| `ticket_verified`                         | `boolean` default false (no flow yet; the app type already carries it)                                                           |
| `status`                                  | `text` in (`visible`, `hidden`) default `visible`                                                                                |
| `hidden_reason`                           | `text` in (`reports`, `impersonation`, `admin`), null while visible; `check ((status = 'hidden') = (hidden_reason is not null))` |
| `wave_points`                             | `integer` default 0, `>= 0`. Maintained by trigger (§7)                                                                          |
| `consent_at`                              | `timestamptz`; `check (source = 'demo' or consent_at is not null)`                                                               |
| `joined_at`                               | default `now()`                                                                                                                  |
| `profile_at`                              | default `now()`; bumped on any public-field change (drives deltas)                                                               |
| `points_at`                               | default `now()`; bumped on any points change (drives deltas)                                                                     |

Indexes: `(profile_at)`, `(points_at)`, partial `(id) where status = 'visible'`. (No points index:
the board is ranked in the browser.)

**`private.contacts`**: the only place handles live. Never part of the venue snapshot.

| Column             | Type / rule                                              |
| ------------------ | -------------------------------------------------------- |
| `person_id`        | `uuid` PK, FK people                                     |
| `telegram`         | `text` null, Telegram pattern                            |
| `x`                | `text` null, X pattern                                   |
| `telegram_user_id` | `bigint` unique null (set only by Telegram verification) |
| check              | `telegram is not null or x is not null`                  |

Unique indexes: `lower(telegram)` and `lower(x)` (where not null). One handle can't sit on two
beans; that is the impersonation guard (§9.2 describes how verification claims a handle).

**`private.waves`**

| Column       | Type / rule                                              |
| ------------ | -------------------------------------------------------- |
| `from_id`    | `uuid` FK people                                         |
| `to_id`      | `uuid` FK people                                         |
| `created_at` | default `now()`                                          |
| `meet_day`   | `date` not null, set by `wave()` to `current_meet_day()` |
| keys         | PK `(from_id, to_id)`, `check (from_id <> to_id)`        |

Indexes: `(to_id)`, `(meet_day, to_id)` (today board repair).

**`private.wave_quota`**: waves sent per Meet day. `person_id uuid FK, meet_day date, sent integer

> = 0`, PK `(person_id, meet_day)`. Incremented by the waves insert trigger and **never decremented**:
> unmatch and block delete waves (and their points) but must not refund the allowance, or "wave,
> block, wave again" would harvest every handle in the venue from one account.

**`private.daily_points`**: today-board counter, maintained by trigger.
`meet_day date, person_id uuid FK, points integer >= 0`, PK `(meet_day, person_id)`.

**`private.chais`**: mutual waves.

| Column                 | Type / rule                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `a_id`, `b_id`         | `uuid` FK people, `check (a_id < b_id)`, PK `(a_id, b_id)`                 |
| `created_at`           | default `now()`                                                            |
| `a_status`, `b_status` | `text` in (`new`, `messaged`, `met`) default `new`; each side owns its own |
| `a_seen`, `b_seen`     | `boolean` default false (has this side seen the "Chai's on!" moment)       |

**`private.daily_hands`**

| Column        | Type / rule                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `person_id`   | `uuid` FK people                                                                     |
| `meet_day`    | `date`                                                                               |
| `cards`       | `jsonb` array of `{ "personId", "wildcard", "reasons" }` (the `Card` type, in order) |
| `revealed`    | `uuid[]` default `'{}'`                                                              |
| `bonus`       | `smallint` 0–3 default 0                                                             |
| `dealt_bonus` | `smallint` 0–3: the bonus the stored cards were dealt for (set by `save_hand`)       |
| `dealt_at`    | last deal attempt; a short hand (few people yet) is re-dealt after 30 minutes        |
| `created_at`  | default `now()`                                                                      |
| keys          | PK `(person_id, meet_day)`                                                           |

**`private.skips`**: `person_id uuid FK, skipped_id uuid FK, until_day date`, PK
`(person_id, skipped_id)`. Active while `until_day > current_meet_day()` (same as the demo).

**`private.blocks`**: `blocker_id uuid FK, blocked_id uuid FK, created_at`, PK both,
`check (blocker_id <> blocked_id)`.

**`private.reports`**: `person_id uuid FK (reported), reporter_id uuid FK, reason text in
('scam', 'impersonation', 'spam', 'inappropriate', 'other'), created_at, reviewed_at` (set when an
admin un-hides the bean), PK `(person_id, reporter_id)`, `check (person_id <> reporter_id)`.
`private.report_counts(report)` decides whether a report counts towards auto-hide (§2 Report
weight).

**`private.blocked_terms`**: `term text PK` (lowercase). Seeded by migration with: `devcon`,
`support`, `admin`, `official`, `ethereum foundation`, `helpdesk`, `airdrop`, `coii`,
`moderator`. A name is refused when `lower(name)` contains any term. The owner edits this table in
the table editor; no deploy needed.

**`private.venue_tombstones`**: `person_id uuid PK (no FK), removed_at timestamptz`. Written when a
person is deleted or hidden, removed when a hidden person becomes visible again. Pruned after 30
days (§16).

## 7. Triggers and derived data

| Trigger                           | Does                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waves` AFTER INSERT              | `people.wave_points += 1`, `points_at = now()` for `to_id`; upsert `daily_points(meet_day, to_id) += 1`; `wave_quota(from_id, meet_day) += 1`; send `wave_in` to the recipient's private topic (§11) |
| `waves` AFTER DELETE              | `wave_points -= 1`, `points_at = now()` for `to_id` (skip if that person is being deleted); `daily_points -= 1` for the wave's `meet_day` if the row exists. Fires for cascaded deletes too          |
| `chais` AFTER INSERT              | Send `chai` (with the other person's id) to the side whose `user_id` is not the current `auth.uid()`; the waver learns from the `wave()` result                                                      |
| `reports` AFTER INSERT            | If the person now has ≥ 3 reports that `report_counts()` (unreviewed, from beans ≥ 24 h old at report time) and is `visible`: set `hidden`, `hidden_reason = 'reports'`, write a tombstone           |
| `people` BEFORE UPDATE            | Bump `profile_at` when any public column changes (name, topics, intents, one_liners, avatar, verified flags, status)                                                                                 |
| `people` AFTER UPDATE of `status` | `visible → hidden`: write tombstone. `hidden → visible`: delete tombstone (and `profile_at` is already bumped)                                                                                       |
| `people` AFTER DELETE             | Write a tombstone                                                                                                                                                                                    |

Realtime sends go only to people with a `user_id` (never to demo beans), so seeding sends nothing.

`private.recount_points()` (admin only) rebuilds `wave_points` and today's `daily_points` from
`waves`, for repairs. A pgTAP test asserts the triggers always match a full recount.

## 8. API contract (RPC functions)

All are `security definer`, `set search_path = ''`, fully qualified names, owner `postgres`.
"Caller" means the `people` row whose `user_id = (select auth.uid())`.

### 8.1 Functions and who can call them

| Function                                                                                      | Grant                                  | Returns / does                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_venue()`                                                                                 | anon, authenticated                    | Full snapshot (§8.2)                                                                                                                                                      |
| `get_venue_changes(since timestamptz)`                                                        | anon, authenticated                    | Delta since a cursor (§8.3)                                                                                                                                               |
| `get_me()`                                                                                    | authenticated                          | Caller's full profile incl. handles, status, points, today points; `null` if no profile yet                                                                               |
| `upsert_profile(name, topics, intents, one_liners, avatar smallint[4], telegram, x, consent)` | authenticated                          | Create or update the caller's profile (§8.5). Returns `get_me()`                                                                                                          |
| `wave(target uuid)`                                                                           | authenticated                          | §8.4                                                                                                                                                                      |
| `get_contacts(ids uuid[])`                                                                    | authenticated                          | `[{id, telegram, x}]` only for **visible** people the caller has a wave to (a hidden bean's handles stay locked). Max 200 ids, else `coii:too_many`                       |
| `get_meet_state()`                                                                            | authenticated                          | §8.6                                                                                                                                                                      |
| `reveal_card(person uuid)`                                                                    | authenticated                          | Adds to today's `revealed` if that person is in today's hand                                                                                                              |
| `skip(person uuid)`                                                                           | authenticated                          | Upsert skip with `until_day = today + 7`                                                                                                                                  |
| `set_chai_status(person uuid, status text)`                                                   | authenticated                          | Caller's side only, forward only (`new → messaged → met`). On `met`: today's hand `bonus += 1` if a hand exists and `bonus < 3`. Returns `{ bonus_awarded boolean }`      |
| `dismiss_chai(person uuid)`                                                                   | authenticated                          | Caller's `*_seen = true`                                                                                                                                                  |
| `unmatch(person uuid)`                                                                        | authenticated                          | Needs a chai. Deletes the chai **and both waves** of the pair (both points and both unlocks go, as in the demo's `unmatch`), then skips them for 7 days                   |
| `block(person uuid)`                                                                          | authenticated                          | Idempotent. Inserts the block, deletes any chai and both waves of the pair                                                                                                |
| `report(person uuid, reason text)`                                                            | authenticated                          | Idempotent per reporter; can't report yourself; **a hidden caller's reports are ignored** (no retaliation). Stored always; counts towards auto-hide per `report_counts()` |
| `hand_inputs(user uuid)`, `save_hand(user uuid, day date, cards jsonb, dealt_bonus smallint)` | service_role                           | Used by `deal-hand` only (§9.1). `hand_inputs` returns `{ready: true, hand}` at once when no deal is needed                                                               |
| `link_telegram(user uuid, tg_id bigint, username text)`                                       | service_role                           | Used by `telegram-link` only (§9.2)                                                                                                                                       |
| `recount_points()`, `purge_demo()`, `post_event_purge()`, `hide(person)`, `unhide(person)`    | none (SQL editor / cron as `postgres`) | Admin and scheduled jobs. `unhide` marks the bean's reports reviewed (so one new report can't re-hide it) and refuses (`coii:no_handle`) a bean left without a handle     |

Every `authenticated` function except `upsert_profile` and `get_me` fails with `coii:no_profile`
when the caller has no profile. A hidden caller can read their own state and edit their profile,
but `wave` returns `unavailable` and they appear nowhere public.

### 8.2 `get_venue()`: the snapshot

One JSON value, column-oriented to keep it small, visible people only, ordered by `joined_at`:

```json
{
  "v": 1,
  "cursor": "2026-11-03T10:15:02.120Z",
  "day": "2026-11-03",
  "id": ["…uuid…"],
  "n": ["Asha Rao"],
  "t": [["privacy", "core"]],
  "i": [["building"]],
  "o": [["building private UPI rails"]],
  "a": [[2, 5, 1, 0]],
  "f": [1],
  "p": [12],
  "d": [3],
  "j": [1793678400]
}
```

`f` is a bit mask: 1 = Telegram verified, 2 = ticket verified, 4 = demo. `p` = all-time points,
`d` = points this Meet day, `j` = joined at (epoch seconds). `cursor` is `now() - 5 seconds`, an
overlap that covers rows committed while the snapshot was being read; the client applies updates
idempotently by id. **Budget:** ≤ 260 bytes per person uncompressed with seed data (tested, §17).

### 8.3 `get_venue_changes(since)`

```json
{
  "v": 1,
  "cursor": "…",
  "day": "2026-11-03",
  "full": false,
  "people": {
    "id": [],
    "n": [],
    "t": [],
    "i": [],
    "o": [],
    "a": [],
    "f": [],
    "p": [],
    "d": [],
    "j": []
  },
  "points": { "id": [], "p": [], "d": [] },
  "removed": []
}
```

- `people`: visible people with `profile_at > since` (new arrivals and edits).
- `points`: visible people with `points_at > since` who aren't already in `people`.
- `removed`: tombstones with `removed_at > since`.
- `full: true` (and nothing else) when `since` is older than 30 days or in the future: the client
  must call `get_venue()` instead.
- When the Meet day changed since `since`, the client zeroes every `d` before applying the delta.

### 8.4 `wave(target uuid)`

Returns `{ "result": "waved" | "chai" | "already" | "quota" | "unavailable", "contacts": { "telegram", "x" } | null, "waves_left": int }`.
These are the same result names as `WaveResult` in `src/app/meet.ts`.

1. Resolve the caller (else `coii:no_profile`). `pg_advisory_xact_lock` on the **caller**, then
   on the **pair** (`least(a, b) || greatest(a, b)`), always in that order (no deadlocks). The pair
   lock makes two simultaneous mutual waves create exactly one chai.
2. `unavailable` if: the target doesn't exist, is the caller, is hidden, the caller is hidden, or a
   block exists in either direction (don't reveal which).
3. `already` (with contacts) if the caller already has a wave to the target.
4. `quota` if `wave_quota.sent` for the caller and today is 50 (a counter that unmatch and block
   never lower).
5. Insert the wave. If the target has a wave to the caller, insert the chai (ordered pair,
   `on conflict do nothing`) and return `chai`; else `waved`. Both return the target's contacts.

### 8.5 `upsert_profile(...)`

- Needs a session. Creating a profile needs `consent = true` (stored in `consent_at`); later edits
  keep the original `consent_at`.
- Normalise with `clean_name` and `clean_one_liners`, then validate every rule in §6.1. Handles
  arrive already normalised by `normalizeTelegram` / `normalizeX`; the server only validates them.
- A handle already used by another bean fails with `coii:handle_taken`. The UI says: "That
  username is already on coii. If it's yours, verify with Telegram to claim it."
- If the Telegram handle changes on a verified profile, `telegram_verified` becomes false
  (`telegram_user_id` stays, so the account still can't verify a second bean).

### 8.6 `get_meet_state()`

```json
{
  "day": "2026-11-03",
  "reset_at": "2026-11-04T00:30:00Z",
  "points": 12,
  "today_points": 3,
  "waves_left": 44,
  "waved": ["…"],
  "skipped": ["…"],
  "blocked": ["…"],
  "inbound": 2,
  "chais": [{ "person_id": "…", "at": "…", "status": "new", "seen": false }],
  "hand": { "cards": [], "revealed": [], "bonus": 0 },
  "deal_needed": false
}
```

- `inbound` = waves to the caller that the caller hasn't returned: a **count only**. No API
  anywhere returns who waved at you until it's mutual.
- `blocked` = people the caller blocked (never people who blocked the caller); the client hides them.
- `hand` drops cards whose person is gone, hidden or blocked. `deal_needed`
  (`private.hand_needs_deal`) is true when there's no hand for today, a bonus was earned after the
  last deal (`bonus > dealt_bonus`), or the hand came out short (fewer than `3 + bonus` cards) and
  the last deal was over 30 minutes ago; the client then calls `deal-hand`.

### 8.7 Errors

Validation failures raise an exception whose message is `coii:<code>`; the client maps codes to
field errors and copy. Codes: `not_signed_in`, `no_profile`, `invalid_name`, `name_blocked`,
`invalid_topics`, `invalid_intents`, `invalid_one_liner`, `link_not_allowed`, `invalid_telegram`,
`invalid_x`, `handle_required`, `handle_taken`, `consent_required`, `invalid_avatar`,
`not_in_hand`, `no_chai`, `invalid_status`, `invalid_reason`, `too_many`, `telegram_taken`,
`telegram_no_username`, `telegram_bad_signature`, `telegram_expired`, `mention_not_allowed`,
`name_link_not_allowed`,
`already_joined` (a second join from the same session raced the first), `no_handle`, `no_person`
and `invalid_hand` (admin and internal). Edge Functions add `origin_not_allowed`,
`method_not_allowed` and `server_error`. Only the `contacts_*` unique indexes map to
`handle_taken`. Normal outcomes (like `quota`) are return values, not errors.

## 9. Edge Functions

Three functions, all `POST`, all require a signed-in session (keep JWT verification on), all
enforce the `ALLOWED_ORIGINS` CORS list, all return `{ error: "coii:<code>" }` with a 4xx on
failure. Deploy with `supabase functions deploy <name> --use-api` (no Docker needed for deploys).

### 9.1 `deal-hand`

Makes sure the caller has today's hand with `3 + bonus` cards, using the **same** TypeScript as
the demo: `buildHand` from `src/match/hand.ts` (with `score.ts`, `reasons.ts`, `affinity.ts`,
`topics.ts`, `intents.ts`, `types.ts`; all pure, no DOM).

0. `hand_inputs(user)` first checks today's hand: when no deal is needed it returns
   `{ ready: true, hand }` straight away and `deal-hand` returns that, so repeat calls stay cheap.
1. Otherwise `hand_inputs(user)` returns, in one JSON (`ready: false`): the viewer; all visible candidates (id, name, topics,
   intents, one-liners, joined_at, source); excluded ids (caller's waves, chais, active skips,
   blocks both ways); recent hands (last 3 days) for `shownBefore`; ids who waved at the viewer
   (`wavedAtViewer`, hidden boost); pending inbound counts for eligible candidates only (`crowded`); today's
   exposure counts and number of hands; today's hand if any. This traffic is internal and is not
   egress.
2. Map rows to `Person` (`isDemo = source = 'demo'`, `isYou` false except the viewer), call
   `buildHand({ ..., size: 3 + bonus, keep: existing cards, exposure: { counts, cap: exposureCap(hands) }, eligibility: { excluded, allowDemo: true } })`.
   `allowDemo: true` is correct: demo rows exist only before the purge.
3. `save_hand(user, day, cards, dealt_bonus)`: insert, or on conflict replace the cards only if the
   new array is longer (bonus growth). `dealt_bonus` is the bonus the cards were dealt for, read in
   step 1: if "We met" landed in between, the hand stays due for a top-up instead of losing the
   card. Two racing calls end with one hand; both return what's stored.
4. Return the stored hand. Reasons never mention the hidden boost (already true in `reasons.ts`).

**Shared code, step one is a spike:** try a `supabase/functions/deno.json` import map that maps
`@/` to `../../src/` and confirm `functions deploy --use-api` bundles it. If the bundler refuses
files outside `supabase/`, add `scripts/sync-shared.ts` that copies the listed modules into
`supabase/functions/_shared/` (rewriting `@/` imports) and a vitest test that fails when the
copies drift. Report which way you went at the checkpoint.

### 9.2 `telegram-link`

Input: the Telegram Login Widget payload (`id, first_name, last_name, username, photo_url,
auth_date, hash`).

1. Verify: `data_check_string` = all fields except `hash`, sorted by key, `key=value` joined by
   `\n`; `secret = SHA-256(TELEGRAM_BOT_TOKEN)`; expect `hex(HMAC-SHA-256(secret, data_check_string)) == hash`
   with a constant-time compare. Else `telegram_bad_signature`.
2. `auth_date` older than 24 h, or more than 5 min in the future: `telegram_expired`.
3. No `username`: `telegram_no_username` ("Set a Telegram username first, then verify").
4. `link_telegram(user, id, username)`:
   - `tg_id` already on another bean: `telegram_taken` (one bean per Telegram account).
   - Another, unverified bean holds that username: clear it there. If that leaves it with no
     handle, set it `hidden` (it was impersonating).
   - Set the caller's `contacts.telegram = username`, `telegram_user_id = id`,
     `people.telegram_verified = true`.
5. Return `get_me()` for the caller.

The widget only runs on the domain set with `/setdomain`, so the full flow can only be tested on
the live site. Step 1–3 are covered by Deno unit tests with a fake token and computed hashes.

### 9.3 `delete-account`

Deletes the caller's auth user with the admin API. The FK cascade removes the bean, handles, both
directions of waves (other people's points drop by trigger), chais, hands, skips, blocks and
reports, and the tombstone trigger tells every map to remove the bean. Returns `204`. This is
what "Leave coii" does in backend mode.

## 10. Auth

Configure with `supabase/config.toml` for the **local** stack only. **Never run
`supabase config push` against production**: the local file holds localhost URLs and test keys.
Production settings are set once in the dashboard by the owner from the checklist in §19.

### 10.1 Settings

| Setting                                   | Local (`config.toml`)                 | Production (dashboard)                                                |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| Anonymous sign-ins                        | on                                    | on                                                                    |
| Manual identity linking (for Google)      | on                                    | on                                                                    |
| Email / phone sign-up                     | off                                   | off (Google covers recovery; built-in email can't send to the public) |
| Google provider                           | off (test Google against the remote)  | on, with the owner's client id and secret                             |
| CAPTCHA                                   | Turnstile with Cloudflare test secret | Turnstile with the real secret                                        |
| Site URL / redirect URLs                  | `http://localhost:5173`               | §4                                                                    |
| Rate limit: anonymous sign-ins per IP/h   | default 30                            | 30 now; **raise to 1,000 by 27 Oct** (venue Wi-Fi is one IP)          |
| Rate limit: sign-ins and sign-ups / 5 min | default                               | raise to 300 by 27 Oct                                                |
| Rate limit: token refreshes / 5 min       | default                               | raise to 1,000 by 27 Oct                                              |
| Realtime → allow public access            | n/a                                   | **off** (only private channels exist)                                 |

### 10.2 Flows

| Flow                      | Steps                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse (not joined)       | No session at all. Only `get_venue` / `get_venue_changes`. **Don't** create anonymous users for visitors                                                                                                                                                               |
| Join                      | Form valid → Turnstile token → `signInAnonymously({ options: { captchaToken } })` → `upsert_profile` → arrival animation. If `upsert_profile` fails, keep the session and show field errors; the next submit reuses the session                                        |
| Save my bean (Google)     | Signed-in anonymous user → `linkIdentity({ provider: 'google' })`. On `identity_already_exists`: explain that this Google account already holds a bean and offer to switch to it (this device's bean is deleted via `delete-account` first, after a confirm in the UI) |
| Sign in on another device | "Already joined? Sign in with Google" on the join form → `signInWithOAuth`. `get_me()` returns the bean. A Google user with no bean sees the join form                                                                                                                 |
| Verify with Telegram      | Signed-in user with a bean → Telegram widget → `telegram-link`. Optional at any time                                                                                                                                                                                   |
| Leave coii                | Confirm → `delete-account` → sign out → clear local caches                                                                                                                                                                                                             |
| Sign out (keep bean)      | Shown only when Google is linked; otherwise signing out would lose the bean, so only "Leave" exists                                                                                                                                                                    |

Client: `createClient(url, publishableKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`.

Google consent will name `fqemvlxftoixmihcmhmt.supabase.co` (a custom auth domain is a paid
add-on). Accepted for now.

## 11. Realtime (personal events only)

- Topic per signed-in user: `user:<auth uid>`, **private** channel (`config: { private: true }`).
- RLS on `realtime.messages`: `select` allowed to `authenticated` when
  `realtime.topic() = 'user:' || (select auth.uid())::text`. **No insert policy**: clients can't
  send anything.
- Sent from triggers with `realtime.send(payload, event, topic, true)`:
  - `wave_in` `{ "points": n }`: someone waved at you. No identity.
  - `chai` `{ "person_id": "…" }`: a wave of yours just became mutual.
- Fallback: if the channel can't join (more than 200 connections) or drops, poll
  `get_meet_state()` every 60 s while the tab is visible.
- **Why no venue-wide broadcast:** each broadcast counts once per receiver. 150k event-week waves
  × 200 viewers = 30 M messages against a 2 M monthly quota. Personal events are about 2 per wave
  (≈ 0.3 M total).

## 12. Security and privileges

Migration rules, in the first migration:

```sql
create schema private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- every function in public then gets an explicit grant from §8.1, nothing else
```

Also `revoke execute ... from public` on each new function (Postgres grants `execute` to
`public` by default). Enable RLS on every `private` table with **no** policies.

**Invariants** (each has a test):

1. `anon` and `authenticated` can't read or write any `private` table directly.
2. The exact set of functions executable by `anon` is `{get_venue, get_venue_changes}`; by
   `authenticated` exactly the §8.1 list; `service_role` adds the three internal ones.
3. No response of `get_venue`, `get_venue_changes`, `get_meet_state` or `get_me` (for another
   person) contains a handle, a `user_id`, a reporter, or who waved at whom.
4. `get_contacts` and `wave` return handles only for targets the caller has a wave to.
5. A user can only change their own bean, hand, chais, skips and blocks.
6. The 51st wave in one Meet day returns `quota`; the 50th succeeds; the count resets at 00:30 UTC.
7. Two opposite waves create exactly one chai; a repeated wave never adds a point.
8. `wave_points` and `daily_points` always equal a recount from `waves`.
9. Hidden people appear in no public output and can't wave.
10. Deleting an account removes every row that references it.

Run `supabase db lint` and the dashboard Security Advisor; zero findings, or each one justified in
the PR.

## 13. Egress budget and optimisations

Estimates for event month at ~3,000 people, assuming egress is metered on uncompressed bytes:

| Traffic                                         | Without caching | With what this PRD builds | Plus Cloudflare cache (hosting task) |
| ----------------------------------------------- | --------------- | ------------------------- | ------------------------------------ |
| First-time snapshot (~0.75 MB × 5,000 visitors) | 3.8 GB          | 3.8 GB                    | ~0.1 GB                              |
| Returning visits (full reload each time)        | 15 GB           | ~0.1 GB (cache + delta)   | ~0.1 GB                              |
| Venue polling (60 s, visible tabs only)         | n/a             | ~1 GB                     | ~1 GB                                |
| Meet, waves, profile, auth                      | ~0.3 GB         | ~0.3 GB                   | ~0.3 GB                              |
| Nightly encrypted dump                          | ~0.5 GB         | ~0.5 GB                   | ~0.5 GB                              |
| **Total**                                       | **~20 GB**      | **~5.7 GB (over)**        | **~2 GB (fits)**                     |

**Build in this PRD (mandatory):**

1. Column-oriented snapshot and delta (§8.2–8.3), ≤ 260 B per person.
2. Client cache: store the last snapshot plus cursor in localStorage (`coii:venue:v1`). On load,
   render the cache and call `get_venue_changes(cursor)`; only a missing, corrupt or `full: true`
   cache triggers `get_venue()`.
3. Polling: every 60 s while the tab is visible; every 5 min after 5 min without input; none while
   hidden; one immediate poll on refocus if the last one was over 60 s ago.
4. Waves, points and chais never trigger a snapshot reload; deltas carry them.
5. Only joined users open a realtime channel.

**Required before public launch (hosting task, listed so it isn't lost):** serve `get_venue()`
through a Cloudflare cache on `www.decipherclub.com` (for example a Worker route at
`/coii/api/venue` with a 30–60 s TTL), so the Supabase snapshot is read about once per minute
instead of once per visitor.

**Launch gate (owner, 2 Oct):** no public posts about coii (the Devcon Telegram group, X) until that
cache is live. Sharing with friends and testers is fine before then. Tracked in TRACKER and the
runbook.

**Monitoring:** check Dashboard → Usage weekly, and daily from 1 Nov. If egress passes 60% of the
month before 3 Nov, lengthen polling to 120 s and tell the owner. The whole event (3–6 Nov) falls
in the billing cycle that starts 2 Nov.

## 14. Dummy data

- `scripts/seed.ts` writes `supabase/seed.sql` (gitignored, about 1 MB) from the existing
  `generateDemo()` with a fixed seed: **1,500 people** (`source = 'demo'`, `user_id null`,
  `consent_at null`), their contacts with the generator's `demo_*` handles, and **~15,000 waves**
  among them across the last 3 Meet days, picked with `demoWaveTarget()` weights so the board has a
  realistic long tail. Chais are created wherever both directions exist. `pnpm db:seed` generates
  the file.
- **Local:** `supabase db reset` loads it (it's already in `[db.seed] sql_paths`).
- **Remote (after ✋ checkpoint):** `supabase db push --include-seed`, once.
- **Size:** the generated file is about 4 MB; in the database it's a few MB of the 500 MB.
- **Purge:** `select private.purge_demo();` in the SQL editor deletes every `source = 'demo'` bean.
  Cascades remove their contacts, waves (so real people's points from demo beans drop), chais and
  hands, and tombstones tell open maps to remove them. Run it on launch day; it's in the runbook.
- The client-generated demo crowd is unrelated: it never writes to the database, and the demo
  wave simulation (`startDemoWaves`, demo replies, drips) must never change real people's points.

## 15. Connecting the app

**Mode rule:** backend mode when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set;
demo mode (today's behaviour, unchanged) when they're empty. The Playwright suite runs in demo mode
(set both to empty in `playwright.config.ts`) so it stays deterministic and offline.

Add `@supabase/supabase-js` (look up the current stable version, pin it exactly, respect the 24 h
`minimumReleaseAge`). It is the only new runtime dependency. Load the Turnstile script from
`https://challenges.cloudflare.com/turnstile/v0/api.js` only when the join form opens.

| Module (new, `src/backend/`) | Responsibility                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `client.ts`                  | The one Supabase client (§10.2 options)                                                                                   |
| `database.types.ts`          | Generated by `supabase gen types typescript --local`; committed; CI fails if it drifts                                    |
| `venue.ts`                   | Snapshot, cache, delta polling, decoding the column format into `Person`; emits arrive / update / remove / points events  |
| `meet.ts`                    | Implements the existing `MeetController` interface from `src/app/meet.ts` against the RPCs, so the Meet UI doesn't change |
| `auth.ts`                    | Join, Save my bean, Sign in with Google, Verify with Telegram, Leave                                                      |
| `errors.ts`                  | `coii:<code>` → field and toast copy                                                                                      |

Behaviour in backend mode:

1. The venue shows database people only. Arrivals walk in, edits update in place, removals
   despawn, point changes play the "+1 👋" pop and refresh crowns (`engine.pointPop`,
   `setCrowns`). How to mix in the client demo crowd is tracker L5, a separate owner decision;
   until then backend mode shows no client demo crowd.
2. The board uses `p` (all-time) and `d` (Today) from the venue data; add the **All-time / Today**
   toggle to `BoardOverlay`. Ranks, booth filter and "who to chase" stay client-side.
3. Profiles of people you haven't waved at show the lock card; after a wave (or for anyone in
   `waved`), handles come from the `wave` result or `get_contacts`.
4. `localUser.ts`, `match/storage.ts` and `app/points.ts` storage are demo-mode only. If a demo-mode
   profile exists in localStorage when backend mode starts, prefill the join form from it
   (`draftFrom`) and then delete the old keys.
5. Every RPC failure surfaces as a toast or field error with the mapped copy; nothing fails
   silently.

## 16. Operations

**Migrations:** `supabase migration new <name>`, one logical change per file, never edit a
migration that reached the remote. Commit `supabase/` (config, migrations, functions, tests);
gitignore `supabase/seed.sql` and `supabase/.temp/`.

**Scheduled jobs (pg_cron, created by migration):**

| Job                 | When (UTC)       | Does                                                                                                                                                          |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orphan-anon-users` | daily 22:00      | Delete anonymous `auth.users` older than 24 h with no bean. If `postgres` lacks permission on `auth.users`, move this to an Edge Function using the admin API |
| `prune-tombstones`  | daily 22:10      | Delete tombstones older than 30 days                                                                                                                          |
| `post-event-purge`  | 6 Dec 2026 00:00 | `private.post_event_purge()`: delete waves, chais, hands, skips (Meet PRD §10 retention), then unschedule itself                                              |

**Backups** (`.github/workflows/db-backup.yml`):

- Daily at 21:30 UTC (03:00 IST) plus manual `workflow_dispatch`.
- `supabase db dump` (schema) and `supabase db dump --data-only` covering `private`, `public` and
  `auth` (auth rows are needed to restore `user_id` links), against `SUPABASE_DB_URL`: the
  **session pooler** connection string (GitHub runners have no IPv6; the direct host is IPv6-only).
- Compress, encrypt with `age` to the owner's public key (repo variable `AGE_RECIPIENT`), upload as
  an artifact kept 14 days. The repo is public, so **only encrypted files** may be uploaded, and
  nothing is ever echoed to logs.
- Actions pinned to full SHAs with version comments, `persist-credentials: false`, minimal
  `permissions`, and a clean `zizmor` scan.
- This daily connection also keeps the free project from pausing.
- Prove a restore once: decrypt, load into the local stack, run the pgTAP suite.

**Database CI** (`.github/workflows/db.yml`, on PRs touching `supabase/**`, `src/backend/**` or
`src/match/**`): `supabase start` (only the services needed), `supabase db reset`,
`supabase test db`, `pnpm test:db`, the generated-types drift check, and `supabase db lint`. Same
pinning and `zizmor` rules.

**Runbook** (`docs/runbooks/database.md`, new): copy-paste SQL for hide/unhide a bean, delete a
bean, review the reports queue, edit `blocked_terms`, `recount_points()`, `purge_demo()`, usage
checks and thresholds, restore from a backup, and what to do if the project pauses.

## 17. Tests

| Layer                                                                      | What                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pgTAP (`supabase/tests/database/`)                                         | Every invariant in §12; every validation rule and error code (including link cases: `https://`, `www.`, `foo.xyz`, `t.me/x` rejected; `I like DeFi.` and `v2.0` accepted); `meet_day` around 00:29 / 00:30 UTC; quota 50/51; unique pair; mutual chai; points triggers through insert, delete, unmatch, block and cascaded account delete; auto-hide on the third report; tombstones |
| Integration (`pnpm test:db`, vitest + supabase-js against the local stack) | The API contract end to end as anon and as two or three signed-in users; snapshot size budget with the 1,500-bean seed; delta cursor overlap; and **parity**: one shared fixture file of names, one-liners and handles checked against both the TS validators (`oneLinerError`, `normalizeTelegram`, `normalizeX`, `cleanLines`, `meetDay`) and the SQL functions                    |
| Deno (`supabase/functions/**/*_test.ts`)                                   | Telegram signature (valid, tampered, stale, future, missing username); `deal-hand` with fixtures: deterministic per (person, day), exclusions hold, bonus growth keeps existing cards                                                                                                                                                                                                |
| Existing                                                                   | `pnpm check` and the Playwright suite (demo mode) stay green                                                                                                                                                                                                                                                                                                                         |

Break each guarded rule once on purpose and confirm a test fails before calling it done.

### Acceptance criteria

1. With the seed loaded, an anonymous browser shows 1,500 beans from `get_venue()` and the
   response is ≤ 1,500 × 260 bytes.
2. Joining creates exactly one anonymous user and one bean; reloading keeps you signed in.
3. Another browser sees the new bean within 60 s, without a full reload.
4. Waving returns handles and `+1` for the target; the target's open tab gets `wave_in` within 5 s
   (or 60 s via fallback) and never learns who waved.
5. Two opposite waves give both people "Chai's on!" and exactly one chai row.
6. The 51st wave in a Meet day is refused; the 06:00 IST rollover restores 50.
7. Unmatch and Block remove both waves; both people's points drop by one.
8. Three distinct reports hide a bean from every map within 60 s.
9. Leave deletes every row for that person; their bean disappears for others within 60 s.
10. Save my bean with Google, then Sign in with Google on a second browser, returns the same bean.
11. `purge_demo()` removes all 1,500 seed beans and their waves; real beans are untouched.
12. A restore from an encrypted backup into the local stack passes the pgTAP suite.

## 18. Docs to update

- **Meet PRD** (`who-should-i-meet.md`): remove the 18+ gate everywhere (§4 youth persona row, §5
  phase 1 "18+ gate", §6.1 the `I'm 18 or older` bullet, §6.2 state "Under 18 or paused" →
  "Paused", §6.3 the under-18 exclusion, §8 `adult_confirmed`, §8 RLS bullet, §10 18+ bullet, §11
  under-18 test, §12 AC1 "adult" and AC2 "under-18", §13 Q4). Remove the two "no public
  leaderboard" lines (§3 non-goals, §6.9) since the wave board is a decided feature. Replace §8's
  data model with a pointer to this PRD.
- **Wave points PRD** (`wave-points-and-one-liners.md`): replace §3 with a pointer here; answer §4:
  (1) all-time plus a Today tab, (2) hidden people are excluded from the board, (3) every wave
  counts for now, farming protections deferred.
- **PLAN.md:** line 37 drop "18+ gate"; §6 architecture and §7 data model point here; §14 record
  the auth decision (Supabase Auth, Telegram optional, Google recovery) and the domain.
- **TRACKER.md:** L2, L3, L4 move to ◐ when the work starts.
- **README.md:** backend mode, `.env.local` variables, `pnpm db:*` scripts, link to the runbook.

## 19. Owner actions

| When             | Action                                                                                                                                                                                                                                                                                           | Gives the builder                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| ✋ After Phase 4 | Approve the remote push (migrations, functions, seed)                                                                                                                                                                                                                                            | Go                                                                      |
| ✋ After Phase 4 | Dashboard: Auth → anonymous sign-ins **on**, manual linking **on**, email/phone sign-up **off**, Site URL and Redirect URLs from §4; Realtime → public access **off**                                                                                                                            | Confirmation                                                            |
| Before Phase 5   | Cloudflare → Turnstile → add widget (hostname `www.decipherclub.com`, mode Managed). Paste the **secret** into Supabase → Auth → Attack Protection → CAPTCHA (Turnstile)                                                                                                                         | The **site key** (public) for `.env.local` as `VITE_TURNSTILE_SITE_KEY` |
| Before Phase 5   | Google Cloud Console: OAuth consent screen (External, app name "coii", scopes openid/email/profile, **publish to production** so it isn't limited to 100 test users) and a Web OAuth client with §4 origins and redirect URI. Paste client id + secret into Supabase → Auth → Providers → Google | Confirmation                                                            |
| Phase 6          | `age-keygen -o coii-backup.key`; store the file in the password manager                                                                                                                                                                                                                          | The `age1…` **public** key                                              |
| Phase 6          | In your own terminal (not via `!`): `gh secret set SUPABASE_DB_URL` and paste the session pooler connection string                                                                                                                                                                               | Confirmation                                                            |
| Hosting task     | `/setdomain` → `www.decipherclub.com` for `@coii_bot`                                                                                                                                                                                                                                            | Confirmation                                                            |
| By 27 Oct        | Raise the auth rate limits in §10.1                                                                                                                                                                                                                                                              | Confirmation                                                            |
| Launch day       | `select private.purge_demo();`                                                                                                                                                                                                                                                                   | n/a                                                                     |

## 20. Phases and checkpoints

| Phase | Work                                                                                                                                                                                                                                                                        | Done when                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | Doc updates (§18). Commit `supabase/` with `.gitignore` entries                                                                                                                                                                                                             | Docs no longer mention an 18+ gate; `pnpm check` green                              |
| 1     | Schema, helpers, privileges, RLS, triggers (§6, §7, §12), local only                                                                                                                                                                                                        | pgTAP for invariants 1, 2, 7, 8, 10 and all validation rules green                  |
| 2     | RPC functions (§8), local                                                                                                                                                                                                                                                   | pgTAP complete; integration tests green                                             |
| 3     | Edge Functions (§9): shared-code spike first, then the three functions, served locally                                                                                                                                                                                      | Deno tests green; `deal-hand` returns the same hand as the demo for the same inputs |
| 4     | Seed generator, purge, cron jobs, runbook draft                                                                                                                                                                                                                             | `db reset` loads 1,500 beans; AC 11 passes locally                                  |
| ✋    | **Owner review**, then push migrations, deploy functions, load the seed; owner does the dashboard checklist; **then verify on the real project** that the functions gateway accepts session JWTs signed with the new signing keys (call `deal-hand` from the deployed site) | Remote matches local; `supabase db lint` clean                                      |
| 5     | App integration (§15) against the remote, with Turnstile and Google from the owner                                                                                                                                                                                          | AC 1–10 pass on desktop and a real phone                                            |
| ✋    | **Owner phone test**                                                                                                                                                                                                                                                        | Owner sign-off                                                                      |
| 6     | Backups, database CI, final runbook                                                                                                                                                                                                                                         | AC 12; first nightly backup artifact exists and decrypts                            |

Commit per logical step on a feature branch; open a PR per phase.

## 21. Later (not in this PRD)

Cloudflare cache for the snapshot (before public launch), point-farming protections (for example,
verified-only points or caps on new accounts), Telegram as a sign-in method (verified payload →
`generateLink` → session), ticket verification, meetup flares, handshake QR, Pause Meet, unblock,
organizer CSV import, the L5 demo-crowd rule.

## 22. Risks

| Risk                                         | Mitigation                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Egress over 5 GB in event month              | §13 cache + deltas now; Cloudflare cache before launch; weekly usage checks                                      |
| Point farming with throwaway accounts        | 50/day cap and Turnstile now; runbook lets the owner delete farm beans; rules deferred                           |
| Venue Wi-Fi shares one IP                    | Raise auth rate limits by 27 Oct                                                                                 |
| Mass reports hide an innocent bean           | Admin runs `select private.unhide(id)` (runbook), which marks the reports reviewed; reports are one per reporter |
| Free project pauses                          | Daily backup connection; check before launch                                                                     |
| Lost anonymous session (cleared browser)     | Prompt "Save my bean" after joining and after the first chai                                                     |
| Session readable by other decipherclub pages | No third-party scripts on `www.decipherclub.com` (hosting task)                                                  |
