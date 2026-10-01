# Adda — pre-launch tracker

Ideas and dev tasks to make Adda fun, game-like and worth coming back to before the first launch.
Update the **Status** column as work moves.

**Status:** ☐ todo · ◐ doing · ☑ done
**Priority:** P0 must before launch · P1 strong before launch · P2 nice to have · P3 after launch
**Effort:** S = under 2h · M = half a day · L = a day or more
**Needs:**

- — means client-only (works in the current demo)
- BE needs the real backend (Supabase)
- ORG needs organizers or a partner

## Design principles

1. **Reward meeting people, not screen time.** The biggest rewards come from in-person moments,
   like scanning each other's QR. The app is the launchpad; the hallway is the game.
2. **Short, timed reasons to open it.** FrogCrypto at Devconnect Istanbul let you "search the
   swamp" every 15 minutes. 3,000+ of 5,000 Zupass users played, and people set alarms for it.
3. **Collections with a visible real-world payoff.** 50 frogs got you a frog bucket hat, and the
   hats became a walking billboard. About 500 were earned.
4. **Your bean is you.** Expression first (looks, emotes), status second (titles, auras).
5. **Every fun moment makes something shareable:** a card, a screenshot, a GIF.
6. **No dark patterns.** No fake urgency or notification spam, demo people are labelled, and
   leaving takes one tap.

## Recommended pre-launch pack

Mostly client-only, about 2 days, in this order:

1. P1 onboarding hints
2. G1 "my bean" share card
3. F2 emotes (gm, dance, wave)
4. T4 dance hour on the Mumbai (IST) clock
5. T7 easter eggs
6. T6 three more booth jokes
7. M1 "Today's Adda 3"
8. T1 yeet golf
9. S2 + S3 trending booth and milestones

Then, once the backend exists: L2–L4, C3 handshake QR, M2 waves, M5 meetup flares.

---

## 0. Launch must-haves (blocking, not fun)

| ID  | Task                                                                                     | Effort | Needs       | Pri                  | Status |
| --- | ---------------------------------------------------------------------------------------- | ------ | ----------- | -------------------- | ------ |
| L1  | Real-phone pass on iPhone + Android: FPS, pinch, long-press, sheets, keyboard            | S      | —           | P0                   | ☐      |
| L2  | Real sign-ups: Supabase table + RLS, Telegram Login, open form, behind `PeopleSource`    | L      | BE          | P0 for a real launch | ☐      |
| L3  | Live arrivals via Supabase Realtime, with 60s polling fallback                           | M      | BE          | P0 for a real launch | ☐      |
| L4  | Moderation: report button, auto-hide at 3 reports, name blocklist, admin hide            | M      | BE          | P0 for a real launch | ☐      |
| L5  | Demo-crowd rules: hide or thin demo people once real ones arrive, with a clear label     | S      | —           | P0                   | ☐      |
| L6  | Deploy to `gmadda.pages.dev` + Cloudflare Web Analytics                                  | S      | owner login | P0                   | ☐      |
| L7  | Privacy page, consent copy, "delete me"                                                  | S      | —           | P0                   | ☐      |
| L8  | Cold start: seed list (friends, speakers), QR poster, Devcon 8 India Telegram group post | S      | ORG         | P0                   | ☐      |

## 1. Your bean (make people care about their character)

| ID  | Task                                                                                                                                                      | Effort | Needs               | Pri | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- | --- | ------ |
| F1  | Customizer v2: festive wear (kurta, saree drape, Nehru jacket), booth-logo hoodies, sneakers, hats. Some items unlocked by playing                        | M      | —                   | P1  | ☐      |
| F2  | Emotes for your bean: wave, Bollywood hook-step dance, "gm!" shout, jump, chai sip. HUD buttons once joined; nearby beans react (wave back, turn to look) | M      | — (BE to broadcast) | P1  | ☐      |
| F3  | Status bubble above your bean, expires after 3h: "here till 6pm · Hall 2 · open to chat"                                                                  | S      | BE                  | P1  | ☐      |
| F4  | Pets that trot behind your bean: chai cup, robot, Mumbai pigeon, a frog (a nod to FrogCrypto). Unlocked through collections                               | M      | —                   | P2  | ☐      |
| F5  | Titles from behaviour: "Liquidity Lifeguard" (most pool time), "Chai Connoisseur", "Most Yeeted", "Booth Hopper"                                          | S      | —                   | P2  | ☐      |

## 2. Toys on the map (30 seconds of play, then again)

| ID  | Task                                                                                                                                                                                                                                                                                                                            | Effort | Needs | Pri         | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | ----------- | ------ |
| T1  | Yeet golf: fling any bean into the liquidity pool or onto the chai stall for points and a splash. Personal best and a "nice shot" toast                                                                                                                                                                                         | M      | —     | P1          | ☐      |
| T2  | Yeet counter on profiles + "Most yeeted today"                                                                                                                                                                                                                                                                                  | S      | BE    | P2          | ☐      |
| T3  | Conga line: long-press the plaza and nearby beans line up behind your bean, looping the chai stall                                                                                                                                                                                                                              | M      | —     | P2          | ☐      |
| T4  | Dance hour: at :00 every hour (IST) the plaza plays a beat and everyone there dances for 30s. It runs off the shared clock, so it's in sync on every device without a backend                                                                                                                                                   | S      | —     | P1          | ☐      |
| T5  | Time and weather: day/night on IST, string lights on booths in the evening, a surprise monsoon shower with tiny umbrellas                                                                                                                                                                                                       | M      | —     | P2          | ☐      |
| T6  | Remaining booth jokes:<br>• Stablecoins: a literal horse stable<br>• Core & L2s: a two-storey "Layer 2" stage<br>• Security: audit magnifying glass and laser rope<br>• Wallets: walk-through giant wallet arch<br>• Consumer: arcade cabinets beans play at<br>• Jobs: bulletin board with flying résumés and a megaphone bean | M each | —     | P1 (pick 3) | ☐      |
| T7  | Easter eggs:<br>• tap the chai stall and the chai-wala tosses cups to random beans<br>• tapping pigeons scatters them<br>• an auto-rickshaw at the gate honks<br>• the Konami code makes everyone dance<br>• a 1-in-500 golden bean (screenshot bait)                                                                           | S each | —     | P1          | ☐      |
| T8  | Sound pack, off by default: tabla loop, bubble pops, squeak on yeet, "gm!"                                                                                                                                                                                                                                                      | S      | —     | P2          | ☐      |

## 3. Collect and meet (the FrogCrypto loop, aimed at meeting people)

| ID  | Task                                                                                                                                                  | Effort | Needs                          | Pri                     | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------ | ----------------------- | ------ |
| C1  | Chai drops: every 15 min, "Get chai" at the plaza gives a random collectible sticker, from common up to legendary (masala, cutting, golden kulhad)    | M      | BE (localStorage for the demo) | P1                      | ☐      |
| C2  | Booth passport with 10 stamps. You earn a booth's stamp by meeting someone from that booth (see C3)                                                   | M      | BE                             | P1                      | ☐      |
| C3  | Handshake QR: show your Adda QR, and scanning each other in person links your beans with a 🤝 string on the map and saves the contact for both of you | L      | BE                             | P1 (the killer feature) | ☐      |
| C4  | Rainbow set: meet someone from every booth to earn a "Rainbow" title and aura                                                                         | S      | BE (after C2)                  | P2                      | ☐      |
| C5  | Real-world payoff: N stamps lets you claim a physical marigold sticker or badge at a meetup or partner booth (the frog-hat effect)                    | M      | ORG                            | P2                      | ☐      |
| C6  | Three daily quests: "Meet someone outside your topics", "Take a dip in the liquidity pool", "Wave at 3 people at Privacy"                             | M      | BE                             | P2                      | ☐      |

## 4. Who should I meet (matchmaking as a game)

Full spec: [docs/prd/who-should-i-meet.md](docs/prd/who-should-i-meet.md)

| ID  | Task                                                                                                                                            | Effort | Needs                            | Pri | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- | --- | ------ |
| M1  | "Today's Adda 3": three daily picks ranked by shared topics and complementary intent (hiring ↔ looking, founder ↔ investor). Swipe Wave or Skip | M      | — (client ranking); BE for waves | P1  | ☑      |
| M2  | Waves: send a 👋; when it's mutual, "It's a match!" confetti plus a suggested spot ("chai plaza, 4pm?")                                         | M      | BE                               | P1  | ◐      |
| M3  | "Find my tribe" spotlight: dim everyone except people who share 2+ of your topics                                                               | S      | —                                | P1  | ☑      |
| M4  | Intent props on beans so intent is visible on the map: hiring megaphone, résumé, laptop, briefcase                                              | S      | —                                | P2  | ☑      |
| M5  | Meetup flares: light a beacon on a booth ("agent payments jam · 4pm · Hall 2"). It glows on the map; joining walks your bean over               | M      | BE                               | P1  | ☐      |

## 5. Live and social proof (it feels alive)

| ID  | Task                                                                                           | Effort | Needs | Pri | Status |
| --- | ---------------------------------------------------------------------------------------------- | ------ | ----- | --- | ------ |
| S1  | Ticker upgrades: "🔥 Privacy +12 in the last hour", "🤝 Asha & Ravi just matched" (opt-in)     | S      | BE    | P1  | ☐      |
| S2  | Trending booth: flames or glow on the booth growing fastest                                    | S      | —     | P1  | ☐      |
| S3  | Booth milestones: fireworks at 100, 250 and 500 people                                         | S      | —     | P1  | ☐      |
| S4  | Kiosk mode for venue screens: automatic camera tour, big counters, a QR code to join           | M      | ORG   | P1  | ☐      |
| S5  | Spotlight: every 10 min one person's bean gets a spotlight and their one-liner hits the ticker | S      | —     | P2  | ☐      |

## 6. Share and grow (every fun moment becomes a card)

| ID  | Task                                                                                                                               | Effort | Needs    | Pri | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | --- | ------ |
| G1  | "My bean" card: a PNG of your bean at your booth with your one-liner and a QR, shared to X or Telegram via the phone's share sheet | M      | —        | P1  | ☐      |
| G2  | Yeet GIF: record 3s of your bean being flung, to share                                                                             | L      | —        | P2  | ☐      |
| G3  | Invite a friend: someone who joins from your link starts next to your bean                                                         | M      | BE       | P2  | ☐      |
| G4  | Telegram digest in the Devcon group: "312 people here; top combo AI × Stablecoins"                                                 | M      | BE + ORG | P2  | ☐      |
| G5  | "Devcon Wrapped" on Nov 6: who you met, booths stamped, yeets, chai collected                                                      | M      | BE       | P3  | ☐      |

## 7. First run and polish

| ID  | Task                                                                                                                     | Effort | Needs | Pri | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------ | ----- | --- | ------ |
| P1  | 10-second onboarding, shown once: three hint bubbles ("tap someone", "long-press to yeet", "join to put your bean here") | S      | —     | P0  | ☐      |
| P2  | Loading and empty states with walking beans                                                                              | S      | —     | P1  | ☐      |
| P3  | Haptics on grab and landing (Android); a squash on every tap                                                             | S      | —     | P1  | ☐      |
| P4  | Re-lay the venue out when the phone rotates                                                                              | M      | —     | P2  | ☐      |
| P5  | Keyboard and screen-reader access to the map: tab between booths, a spoken summary of who's where                        | M      | —     | P1  | ☐      |
| P6  | Privacy-friendly event analytics (join, wave, yeet, share, return visits) to learn what actually hooks people            | S      | —     | P1  | ☐      |

---

## References

- FrogCrypto at Devconnect Istanbul (2023) and FrogCrypto 2 at Devcon 7: [DIP-47 on the Devcon forum](https://forum.devcon.org/t/dip-47-frogcrypto-2/3866)
- Devconnect Argentina (2025) app numbers: 9,000+ users, 14,000 quests completed, 16,000 POAPs.
  [EF recap](https://blog.ethereum.org/2025/12/04/devconnect-arg-wrap)
