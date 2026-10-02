# PRD: Who should I meet? (matchmaking as a game)

|               |                                                                                     |
| ------------- | ----------------------------------------------------------------------------------- |
| Status        | Draft for owner review · 2 Oct 2026                                                 |
| Tracker items | M1 Today's 3 · M2 Waves & matches · M3 Find my tribe · M4 Intent · M5 Meetup flares |
| Depends on    | L2 real sign-ups, L4 moderation; C3 handshake QR for verified "we met"              |
| Event         | Devcon 8, Jio World Centre, Mumbai, 3–6 Nov 2026                                    |

---

## 1. Problem

Devcon has 10,000+ attendees and four days. The map already shows _who cares about what_, but
three hard parts remain:

1. **Choosing.** "AI Agents · 548 interested" is a crowd, not a person. Scrolling 548 profiles
   between talks doesn't happen.
2. **Permission.** First-timers make up a large share of this crowd (many Indian students and
   new builders). They hesitate to DM a stranger and need a low-stakes signal that the other side
   wants to talk too.
3. **Turning interest into a meeting.** Even mutual interest dies in DMs without a concrete
   _where and when_.

## 2. Solution in one paragraph

Each day you get a small hand of **three people worth meeting** (the "daily 3"), flipped over
like trading cards, each with the reason you two should talk. You **wave** at the ones you like.
Who waved stays private until it's mutual (a wave does give the other person a wave point and
unlocks their contact; see [wave points](wave-points-and-one-liners.md)). When both of you wave,
**"Chai's on!"**: your beans run
to each other on the map and clink chai cups. You get a suggested venue spot and a one-tap
Telegram opener. **My tribe** lights up everyone who shares your topics on the map, and
**flares** let anyone call a group meetup at a booth. The best rewards go to meeting in person,
not to time spent in the app.

### Product vocabulary

Use these words consistently in UI and code.

| Concept                         | UI name        | Notes                                               |
| ------------------------------- | -------------- | --------------------------------------------------- |
| The feature / tab               | **Meet**       | Tab on phone, side-panel tab on desktop             |
| Daily suggestions               | **Today's 3**  | 3 cards, reset 06:00 IST                            |
| Interest signal                 | **Wave** 👋    | Private until mutual                                |
| Mutual interest                 | **Chai's on!** | Deliberately non-romantic; never "match" in UI copy |
| What you're here for            | **Intent**     | 1–2 chips on your profile                           |
| Map highlight of similar people | **My tribe**   | Map mode toggle                                     |
| Group meetup beacon             | **Flare**      | Time-boxed, tied to a booth                         |

## 3. Goals, non-goals, success metrics

**Goals**

- G1: Every joined person gets relevant picks within 5 seconds of joining.
- G2: Turn browsing into a light action (waves) without spamming anyone.
- G3: Turn mutual interest into in-person conversations at the venue.
- G4: Make the map feel more social: matches and flares are visible moments.

**Non-goals (v1)**

- Not a dating product: no photos, no romantic copy, no hearts, no swipe-to-judge looks.
- No in-app chat. Hand off to Telegram or X, where users already have controls.
- No LLM or embeddings ($0 budget). Rules-based, explainable scoring.
- No public "most popular" leaderboards of people.
- No physical location tracking. "We met" is a mutual confirmation, not GPS.

**Metrics** (aggregate, privacy-friendly; targets for event week)

| Metric                                                | Target                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Joined people who reveal their daily 3 on a given day | ≥ 60%                                                              |
| Wave rate per revealed card                           | 20–35% (outside this range means picks are too weak or too strong) |
| Waves that become "Chai's on!"                        | ≥ 15%                                                              |
| Matches confirmed "we met" (button or handshake QR)   | ≥ 30%                                                              |
| People returning on a second event day                | ≥ 40%                                                              |
| Flares with ≥ 3 joiners                               | ≥ 50%                                                              |

**Guardrails**

- Reports below 1 per 1,000 waves.
- Under 5% of people hit the daily wave cap.
- No person appears in more than 5× the median number of hands (exposure fairness, §6.4).

## 4. Users

| Persona                                                          | Wants                                                 | Risk to design for                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| **First-timer** (student, new builder; large share of the crowd) | Someone friendly in their topic; permission to say hi | Shyness: hidden waves protect them from visible rejection   |
| **Builder / founder**                                            | Co-founders, users, investors in a niche topic        | Wants precision: strong topic + intent matching             |
| **Hiring manager / recruiter**                                   | Candidates                                            | Can spam: wave cap, hidden waves                            |
| **Job seeker**                                                   | Hiring teams                                          | Needs complements: hiring ↔ looking                         |
| **Speaker / well-known person**                                  | Fewer, better conversations                           | Gets flooded: popularity dampening, "pause Meet"            |
| **Youth attendee** (Devcon sells youth tickets for ages 3–17)    | Browse the map                                        | Must not be matched privately with adults: 18+ gate on Meet |

Context: phones on venue Wi-Fi or mobile data, short bursts between talks, Telegram as the
default chat app, English plus Indian languages.

## 5. Scope and phasing

| Phase                                 | Ships                                                                                                                                                                                 | Needs       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **0: Demo (pre-launch, client-only)** | Intent field + map props (M4), scoring library, Daily 3 UI with reveal, waves to demo people with **simulated** "Chai's on!" (labelled demo), My tribe (M3), pick sparkles on the map | Nothing new |
| **1: Launch**                         | Server-side hands, real hidden waves, matches, block, pause, 18+ gate, match screen with Telegram opener, matches list, rate limits                                                   | L2, L4      |
| **2: Event week**                     | Flares (M5), "we met" + handshake QR (C3), rewards and titles, Daily streak, bonus cards for in-person meetups                                                                        | C3          |

---

## 6. Detailed requirements

### 6.1 Profile inputs

Existing fields: name, handles, topics (1–3, first = primary), one-liner, avatar.

**New: Intent** (optional, pick up to 2). Added to the join form right after topics as
"What are you here for?":

| Id            | Chip                        | Map prop (M4) |
| ------------- | --------------------------- | ------------- |
| `building`    | 💻 Building something       | laptop        |
| `hiring`      | 📣 Hiring                   | megaphone     |
| `job_hunting` | 📄 Looking for a role       | résumé        |
| `cofounder`   | 🤝 Looking for a co-founder | handshake     |
| `raising`     | 🚀 Raising                  | rocket        |
| `investing`   | 💼 Investing                | briefcase     |
| `researching` | 🔬 Researching              | magnifier     |
| `learning`    | 🌱 First Devcon / learning  | sprout        |
| `vibing`      | ☕ Just here for chai       | chai cup      |

**New: Meet settings** (on your profile, launch phase):

- `I'm 18 or older` — required to use Meet; youth attendees can still browse.
- `Pause Meet` — you stop appearing in hands and can't receive waves. You can still browse.
- Languages (P2, optional): small bonus when you share a language.

Intent is public on your profile and the map. The join form says so next to the field.

### 6.2 Today's 3 (M1)

**Hand rules**

- 3 cards per day: the **2 best-scored** people plus **1 wildcard** from an adjacent topic
  (§6.3). Wildcards are labelled "Wildcard" so the serendipity is explicit.
- The hand resets at **06:00 IST**, before the first talks. Before the event it resets daily too,
  which is the pre-event return hook.
- **Stable within a day.** The hand is seeded by `(person id, IST date)`, so reloading never
  rerolls. Scarcity is the point; there is no reroll button.
- **Bonus cards:** +1 card each time you confirm meeting someone in person (max +3 per day).
  This rewards the behaviour we want.
- Fewer than 3 eligible people: show what exists, plus "More people arrive every day".

**Reveal ritual** (the daily hook)

1. The Meet tab badge shows "3 new".
2. Three face-down cards with the marigold card back and "tap to reveal".
3. Each tap flips one card. Spring flip with confetti for the first card of the day. Under
   reduced motion it fades instead.

**Card front**

- Animated bean (waving), name, ✓ Telegram badge, intent chip.
- Topics, with the shared ones highlighted in their colour.
- One-liner as a speech bubble.
- **"Why you two"**: up to 2 reasons generated from the score (§6.3), e.g.
  - "You both: Privacy · Core"
  - "They're hiring · you're looking for a role"
  - "You both mention UPI"
- Actions: **Wave 👋** (primary), **Skip**, **Show on map** (flies the camera, their bean waves).
- Swipe right = wave, swipe left = skip. Buttons are always there; never gesture-only.

**After the last card:** "That's today's 3", a countdown to 06:00, a nudge toward My tribe
and flares, and the share card (G1).

**On the map:** today's picks get a small sparkle above their bean, visible only to you, so you
can spot them in the crowd.

**States**

| State                     | Shows                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Not joined                | Three locked face-down cards + "Join to get your daily picks" |
| Under 18 or paused        | Explanation + My tribe still available                        |
| Cold start (few people)   | Partial hand + "More people arrive every day"                 |
| Nobody shares your topics | Wildcard-heavy hand + "Here's who's nearby in idea-space"     |

### 6.3 Scoring (rules-based and explainable)

For viewer **V** and candidate **C**, every component is normalised to 0–1. The weights are
starting values to tune with the simulation in §11.

```
score(V, C) =
    3.0 × topicOverlap      // shared topics; primary-primary counts most
  + 2.5 × intentComplement  // table below
  + 0.8 × keywordOverlap    // shared meaningful words in one-liners (Jaccard, stopwords removed)
  + 0.6 × wavedAtYou        // hidden boost: C already waved at V (server-side only)
  + 0.4 × fresh             // joined in the last 48h
  + 0.4 × activeToday       // seen today
  + 0.3 × sharedLanguage    // P2
  − 1.5 × shownBefore       // appeared in V's earlier hands (decays over 3 days)
  − 0.8 × crowded           // C already has many pending inbound waves (spreads attention)
```

**topicOverlap:** for each shared topic, add the weight from the pair of positions (V's
position × C's position) below, then divide by 3:

| V's position \ C's position | Primary | Secondary |
| --------------------------- | ------- | --------- |
| Primary                     | 3       | 2         |
| Secondary                   | 2       | 1         |

**intentComplement** (symmetric; any intent pair not listed scores 0; take the best pair across
both people's intents):

| Pair                                                         | Value |
| ------------------------------------------------------------ | ----- |
| hiring ↔ job_hunting                                         | 1.0   |
| raising ↔ investing                                          | 1.0   |
| cofounder ↔ cofounder                                        | 0.8   |
| cofounder ↔ building                                         | 0.6   |
| building ↔ investing                                         | 0.6   |
| hiring ↔ learning (internships)                              | 0.5   |
| building ↔ learning (mentoring)                              | 0.5   |
| researching ↔ building                                       | 0.5   |
| researching ↔ researching                                    | 0.4   |
| learning ↔ researching                                       | 0.4   |
| vibing ↔ anything                                            | 0.2   |
| same "competing" intent (hiring ↔ hiring, raising ↔ raising) | 0.0   |

**Hard exclusions** (never shown):

- yourself
- anyone blocked, in either direction
- people you've already waved at, skipped (for 7 days) or have a chai with
- paused profiles, hidden or reported profiles
- under-18 profiles
- demo people, once real mode is on

**Wildcard slot:** the best-scored person whose primary topic is _adjacent_ to yours (it uses the
same affinity pairs as the demo generator: AI ↔ Stablecoins, DeFi ↔ Prediction Markets,
Privacy ↔ Core, …) and shares none of your topics. The minimum score is 0.5 × the median
best-two score.

**Diversity:** avoid two cards with identical topic sets when an alternative within 10% of the
score exists.

**Reasons:** take the top two contributing components and render them with templates:

| Component        | Template                                         |
| ---------------- | ------------------------------------------------ |
| topicOverlap     | "You both: {topics}"                             |
| intentComplement | "They're {intent} · you're {intent}"             |
| keywordOverlap   | "You both mention {word}"                        |
| wildcard         | "Wildcard: {topic} is next door to {your topic}" |

The hidden `wavedAtYou` boost is **never** rendered as a reason.

### 6.4 Exposure fairness

Without care, the same few people end up in everyone's hand. The `crowded` penalty, the
`shownBefore` decay and a per-day cap (no person in more than 2% of all hands that day,
enforced server-side) keep attention spread out. This is checked in simulation (§11).

### 6.5 Waves and "Chai's on!" (M2)

**Hidden waves.** A wave is private. Nobody can see who waved at them until it's mutual. This
protects first-timers from rejection, makes waves useless for spam, and makes the mutual moment
a surprise.

- **Where you can wave:** a daily 3 card, any profile card (map or People list), the booth list.
- **Limits:**
  - 50 waves per day, shown as "44 waves left today"
  - waves are final (they award a wave point and unlock contact details)
  - waves last until 6 Nov 23:59 IST
- **Teaser for recipients:** "🔒 2 people waved at you. They may show up in your next picks."
  This is a count only; identities are never sent to the client.
- **Wave feedback for the sender:** the card stamps "Waved 👋" and, on the map, the other person's
  bean briefly waves toward the camera. This is local and the other person doesn't see it.

**"Chai's on!" moment** (when the second wave lands):

- **If you're online:** a full-screen sticker card, "Chai's on! You & Asha both waved", with
  both beans clinking chai cups and confetti.
- **On the map**, if both beans are visible on your screen, they walk toward each other and do the
  clink.
- **If you're offline:** a banner the next time you open the app, plus a dot on the Meet tab.
- **The chai card contains:**
  - reasons
  - **suggested spot and time:** a venue spot from an organizer-provided list (e.g. "Hall 1
    food court"), plus a time ("today, in 30 min", or the next free slot between talks if the
    schedule is available)
  - **Message on Telegram**, which opens `https://t.me/{handle}?text={opener}`. Telegram supports
    prefilled draft text on username links, and the user still presses send. Example opener:
    "gm Asha! Found you on coii: we both like Privacy + Core. Chai at Hall 1 food court around 4?"
  - **X**, when the person has no Telegram: opens their profile and copies the opener to the
    clipboard
  - **Show on map**, **We met ✓**, **Unmatch**
- **Your chais:** a list in the Meet tab with statuses: New → Messaged → Met ✓.

**"We met ✓"** needs both sides: tap on both phones, or a handshake QR scan (C3), which counts as
both. Rewards:

- the booth stamp for their primary topic (C2)
- a bonus card in the daily 3 tomorrow
- an optional public "friendship string" between your beans, off by default

### 6.6 My tribe (M3)

- A map-mode toggle in the HUD, shown once you've joined.
- **On:** everyone who shares 2 or more of your topics gets a soft glow; everyone else dims. The
  threshold falls back to 1 shared topic when fewer than 15 people qualify.
- A HUD pill shows "38 in your tribe" and opens the People list sorted by "Best match", which
  already exists.
- Today's picks keep their sparkle on top.
- Combines with topic highlight chips as an intersection.

### 6.7 Intent on the map (M4)

- The intent prop is held at the bean's side (megaphone, résumé, laptop…), drawn from the crowd
  atlas like the phone prop.
- Hidden at far zoom, to keep the crowd readable and cheap to draw.
- People list gains an intent filter row.

### 6.8 Meetup flares (M5)

A flare is a time-boxed group meetup that anyone who has joined can light.

**Form:**

- Title (≤ 60 chars; no links; blocklist)
- Booth (required; decides where the beacon appears)
- Venue spot (organizer list or free text ≤ 40)
- Start (Now / +30 min / +1 h / pick a time)
- Duration (30–120 min)
- Optional cap

**On the map:**

- A tall glowing marigold beacon above the booth with a floating label and countdown:
  "🔥 Agent payments jam · Hall 2 · in 25 min · 7 going".
- When you tap **I'm going**, your bean walks to the beacon. A visible cluster forming is the
  social proof.

**Discovery:**

- Active flares in your topics appear as a 4th card, "Flare near your ideas", in the Meet tab.
- Live ticker: "🔥 Asha lit a flare at Privacy".

**Limits:**

- 2 active flares per host
- flares expire automatically
- report → auto-hide at 3 reports
- the host can end a flare early

### 6.9 Game layer (healthy addiction)

| Mechanic     | Rule                                                                                             | Why                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Daily reveal | Face-down cards at 06:00 IST                                                                     | A ritual and a reason to return, like FrogCrypto's 15-minute swamp searches |
| Daily streak | Flame on your bean for consecutive days you revealed your hand; never punished, just shown       | Light return habit                                                          |
| Bonus cards  | +1 per in-person meeting (max +3/day)                                                            | Rewards real conversations, not screen time                                 |
| Titles       | "Connector" (5 chais), "Chai Champion" (10 met), "Flare Starter" (host a flare with ≥ 3 joiners) | Status you can show on your bean                                            |
| Unlocks      | Cosmetics and pets (F1/F4) from meetings                                                         | Ties into the bean you care about                                           |
| Wrapped      | End-of-event card: who you met, booths stamped, chais                                            | Shareable payoff (G5)                                                       |

No public leaderboard of people, so there's nothing to rank humans by.

---

## 7. UX flows and wireframes

**Flow A, first join:**

1. Join form, with the new intent step.
2. Your bean walks in.
3. Toast: "Today's 3 is ready".
4. The Meet tab pulses.
5. Reveal.
6. Wave or skip.
7. Done screen.

**Flow B, returning:**

1. The Meet tab shows "3 new".
2. Reveal.
3. If anyone you waved at waved back, "Chai's on!" shows first.

**Flow C, mutual wave:**

1. The second wave lands.
2. Both see the chai card (live, or on next open).
3. Tap the Telegram opener.
4. Meet in person.
5. Tap "We met" (or scan the handshake QR).
6. Get the stamp and bonus card.

**Flow D, flare:**

1. Meet tab → "Light a flare".
2. Fill in the form.
3. The beacon appears.
4. Others tap "I'm going".
5. Beans gather.
6. The flare expires.

```
Phone · Meet tab (before reveal)      Phone · card                       Phone · Chai's on!
┌───────────────────────────┐         ┌───────────────────────────┐      ┌───────────────────────────┐
│ Today's 3     resets 06:00│         │ ◀ 2 of 3            Skip ▸│      │      ☕  CHAI'S ON!  ☕     │
│                           │         │   (bean waving)           │      │  [you bean]  clink  [Asha] │
│  ┌────┐ ┌────┐ ┌────┐     │         │ Asha Rao ✓   📄 Looking   │      │  You both waved 👋👋       │
│  │ ✿  │ │ ✿  │ │ ✿  │     │         │ ● Privacy  ● Core         │      │  You both: Privacy · Core │
│  │tap │ │tap │ │tap │     │         │ “building private UPI…”   │      │  📍 Hall 1 food court ~4pm│
│  └────┘ └────┘ └────┘     │         │ Why you two:              │      │ [ Message on Telegram ]   │
│ 🔒 2 people waved at you  │         │ • You both: Privacy, Core │      │ [Copy opener] [Show on map]│
│ 🔥 1 flare near your ideas│         │ • You both mention UPI    │      │ [ We met ✓ ]   Unmatch    │
│ [ My tribe on the map ]   │         │ [ Skip ]  [ 👋 Wave ]     │      └───────────────────────────┘
└───────────────────────────┘         │      Show on map          │
                                      └───────────────────────────┘
```

---

## 8. Data model and API (launch phase, Supabase)

```sql
alter table people add column intent text[] not null default '{}'
  check (cardinality(intent) <= 2);
alter table people add column meet_paused boolean not null default false;
alter table people add column adult_confirmed boolean not null default false;
alter table people add column last_seen_at timestamptz;

create table daily_hands (
  person_id uuid references people on delete cascade,
  day date not null,                       -- IST calendar day
  cards uuid[] not null,                   -- ordered; wildcard flagged separately
  wildcard uuid,
  bonus int not null default 0,
  revealed_at timestamptz,
  primary key (person_id, day)
);

create table waves (
  from_id uuid references people on delete cascade,
  to_id uuid references people on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

create table chais (                        -- mutual waves
  a_id uuid references people on delete cascade,
  b_id uuid references people on delete cascade,
  created_at timestamptz not null default now(),
  met_a boolean not null default false,
  met_b boolean not null default false,
  primary key (a_id, b_id),
  check (a_id < b_id)
);

create table skips (person_id uuid, skipped_id uuid, until date, primary key (person_id, skipped_id));
create table blocks (blocker uuid, blocked uuid, primary key (blocker, blocked));

create table flares (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references people on delete cascade,
  topic text not null,
  title text not null check (char_length(title) <= 60),
  place text check (char_length(place) <= 40),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'visible'
);
create table flare_joins (flare_id uuid references flares on delete cascade, person_id uuid, primary key (flare_id, person_id));
```

**RLS principles**

- Clients never read `waves` rows addressed to them; only counts come back, via an RPC.
- `chais` are readable by their two participants only.
- All writes go through Edge Functions, which check quotas, 18+, pause, blocks and the
  blocklist.

**Edge Functions**

| Function                                              | Does                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `get_hand()`                                          | Computes or returns today's hand (§6.3) for the caller            |
| `wave(to)`                                            | Quota 50/day; awards a point; makes a `chais` row if reciprocal   |
| `skip(id)`                                            | 7-day skip                                                        |
| `confirm_met(chai)`                                   | Sets the caller's side; when both are set, awards stamp and bonus |
| `inbound_count()`                                     | Number of hidden waves only                                       |
| `light_flare(…)` / `join_flare(id)` / `end_flare(id)` | Flare lifecycle and limits                                        |
| `block(id)` / `report(id)`                            | Safety                                                            |

**Realtime**

- Subscribe to your own `chais` inserts for the live "Chai's on!".
- Subscribe to `flares` for beacons.
- Fall back to 60s polling.

**Client modules** (pure and unit-tested, shared by demo and server)

| Module                  | Holds                                     |
| ----------------------- | ----------------------------------------- |
| `src/match/score.ts`    | Components, weights, exclusions           |
| `src/match/hand.ts`     | Seeded hand assembly, wildcard, diversity |
| `src/match/reasons.ts`  | Reason templates                          |
| `src/match/demoBots.ts` | Demo-mode simulated responses             |

**App / engine changes**

- `Panel` gains `"meet"`.
- Store: `hand`, `inboundCount`, `chais`, `tribe`, `flares`.
- New actions: `reveal`, `wave`, `skip`, `confirmMet`, `toggleTribe`, `lightFlare`,
  `joinFlare`.
- `EngineApi` gains:
  - `highlightPeople(ids, style)` for tribe glow and pick sparkles
  - `chaiMoment(aId, bId)`
  - `setFlares(flares)`
  - intent props in the atlas

## 9. Demo mode (Phase 0, before the backend)

- Hands are computed client-side over the demo crowd with the same `score.ts`.
- Waves at demo people get a **simulated** reply after 4–25 s with probability
  `0.25 + 0.15 × topicOverlap`. The result shows as "Chai's on! (demo)", and contact buttons stay
  disabled, as for every demo profile.
- One or two demo flares per hour appear at popular booths ("Agentic payments jam · Hall 2").
- All simulation switches off automatically in real mode. Real people are never faked.

## 10. Privacy, safety and trust

- **Hidden waves:** identities of inbound waves never leave the server; the teaser is a count.
- **18+ gate for Meet.** Devcon sells tickets to under-18s, who can browse the map but not wave
  or match.
- **Pause Meet** at any time; leaving coii deletes waves, chais and flares.
- **Block and report** from every card, profile and chai. Blocked people are excluded both ways.
- **Telegram hand-off only.** No DMs hosted. Every chai card carries a safety line: "Meet in
  public areas of the venue. Nobody legit asks for seed phrases or funds."
- **Verified first:** Telegram-verified people get a small ranking preference in launch mode,
  as an anti-scam measure.
- **Retention:** waves, skips, hands and chais are deleted 30 days after the event.
- **Analytics** are aggregate counts with no profile data.

## 11. Simulation and tests

**Unit and property tests (vitest + fast-check):**

- Scores stay in range.
- Exclusions always hold: self, blocked, waved, skipped, paused, under-18.
- The hand is deterministic per (person, day) and differs across days.
- The wildcard shares no topic with the viewer.
- Diversity rule holds.
- Reasons never mention hidden boosts.
- A mutual wave creates exactly one chai.
- Wave quota is enforced.

**Population simulation** (script, run before tuning weights):

- 2,000 synthetic people × 4 days, using the demo generator plus random intents.
- Report: share of hands with at least one shared topic (target ≥ 90%), intent complements per
  hand, and the exposure distribution (max/median ≤ 5).

**E2E (Playwright, desktop + phone):** reveal 3 cards, wave, demo chai appears, Telegram button
URL, tribe dims non-tribe beans, reduced motion fades instead of flipping.

## 12. Acceptance criteria

1. Given a joined adult on IST day D, opening Meet shows exactly 3 face-down cards (fewer only if
   fewer people are eligible), and reloading during D shows the same people.
2. No card ever shows yourself, a blocked person, someone you waved at or skipped, someone you
   share a chai with, a paused or under-18 profile, or (in real mode) a demo person.
3. Every card shows at least one reason that comes from real profile data.
4. Waving updates the card within 100 ms. The 51st wave in a day is refused with "You've used
   today's 50 waves. They refill at 06:00."
5. Two reciprocal waves create exactly one chai. Both people see "Chai's on!" live, or on their
   next open.
6. No API response lets a person learn who waved at them before it's mutual.
7. "Message on Telegram" opens `https://t.me/{handle}?text={url-encoded opener}`.
8. My tribe dims non-tribe beans within one frame, and the count equals the tribe list length.
9. A flare appears on others' maps within 5 s (realtime) or 60 s (polling) and disappears at its
   end time.
10. With reduced motion there are no flips or flying beans, only fades.
11. In simulation, no person appears in more than 5× the median number of hands.

## 13. Open questions for the owner

| #   | Question                                                   | Recommendation                                                                    |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Hidden or visible waves?                                   | **Hidden**: protects first-timers, kills spam, creates the surprise moment        |
| 2   | Hand size and reset time                                   | **3 per day at 06:00 IST**, +1 bonus card per in-person meeting                   |
| 3   | Make demo people wave-able with simulated chais at launch? | **Yes**, clearly labelled; turn off once real people pass ~300                    |
| 4   | 18+ gate on Meet?                                          | **Yes** (youth tickets exist)                                                     |
| 5   | Real venue meeting spots                                   | Ask organizers for a list of Jio World Centre spots (halls, food courts, lounges) |
| 6   | Final intent list (9 chips above)                          | Keep it, but allow only 2 picks                                                   |
| 7   | Public friendship strings on the map?                      | **Opt-in, off by default**                                                        |
| 8   | "Chai's on!" naming                                        | Keep; it's on-brand, non-romantic and memorable                                   |
