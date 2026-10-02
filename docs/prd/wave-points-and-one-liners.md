# Wave points and catchy one-liners

|         |                                                                                   |
| ------- | --------------------------------------------------------------------------------- |
| Status  | Demo built on `iteration-v1` (2 Oct 2026); the backend version is part of Phase 1 |
| Related | [Who should I meet](who-should-i-meet.md) (waves, chais, daily 3)                 |

Two features that feed each other. **One-liners** pop up over beans on the map, so a newcomer
notices people and gets curious. **Waving** is how you connect: it gives the other person a
**wave point** and unlocks their Telegram and X. A live board ranks everyone by points.

## 1. Catchy one-liners

- Everyone can set **0 to 3 one-liners**, each at most 80 characters, no links. Blank lines and
  repeats are dropped. They show on the profile card as a stack of bubbles.
- **On the map**, a scheduler picks who speaks (`src/engine/quotes.ts`):
  - how many at once: **1** in the zoomed-out overview, **2** up close on phones, **3** on wider
    screens ("up close" means zoom 0.45 or more)
  - starts are **staggered** 1.6–2.8 s apart, so bubbles never appear or vanish together
  - each line stays up for **4–8 s**, longer for longer lines
  - a bubble never overlaps another bubble or a booth sign
  - each person waits **60 s** between turns and cycles through their lines
  - people standing still are picked 3× as often (they're easier to read), people in your tribe
    2×; with booth highlights on, only those booths speak
  - nobody speaks while grabbed, thrown, dizzy, arriving or selected; your own bean stays quiet
- Bubbles are DOM stickers (crisp at any zoom) that follow the bean and slide to stay on screen
  with the tail still pointing at the speaker. **Tapping a bubble opens that profile.**
- Emoji chat bubbles now only play in the zoomed-out view; up close, one-liners do the talking.
- Demo crowd: 332 hand-written lines (about 28 per booth plus 49 about conference life); people
  get 0–3, mostly from their first topic.

## 2. Wave points

- **Waving** (from a profile or a daily 3 card) is final: no take-back, because it gives a point
  and reveals contact details. Each person can wave at you once, so each point is a different
  person.
- **Contact is unlocked by waving.** Until you wave, a profile hides handles ("Wave to see their
  handles") and shows a lock card instead of the Telegram/X buttons. Chais count as unlocked.
  Unmatching removes your wave, so the point and the unlock go too.
- **Who waved stays private.** You see your points and "someone waved at you", never who. A wave
  back still turns into "Chai's on!" exactly as in the Meet PRD.
- **50 waves a day**, refilled at 06:00 IST (was 20 before wave points).
- **Your points** = everyone who has waved at you (hidden inbound waves plus chais).
- **On the map:** "+1 👋" floats up from whoever earns a point, and the **top three wear crowns**
  that stay about 22 px on screen at any zoom, so the leaders are visible from the overview.
- **Board:** a live pill in the HUD (your rank and points, or who leads before you join) opens a
  centred overlay with a podium, ranks 4–20 that slide when people overtake each other, a filter
  per booth, and your rank with who to chase next ("2 more waves to pass Zoya").

### Demo simulation (labelled demo, never used for real people)

- Demo people start with a long-tail number of points (most have a handful, a few have ~40),
  plus 2 per one-liner.
- Every 2.5–6 s one demo person waves at another; catchy one-liners and existing popularity
  attract more waves. These are remembered in this browser (`coii:points:v1`).
- Every 40–110 s (at most 8 times a visit) a demo person who shares your topics waves at you.

## 3. Backend

The [database PRD](database.md) specifies the backend: waves, points, the Today board, contact
unlocks and one-liner validation.

## 4. Decisions (owner, 2 Oct 2026)

1. **Board:** all-time plus a **Today** tab (points from waves received this Meet day).
2. **Moderation:** hidden (reported) people appear on neither board.
3. **Farming:** every wave counts for now; farming protections are deferred (50/day cap and
   Turnstile only).
