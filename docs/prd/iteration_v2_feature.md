# Iteration v2: new features

Everything built in this iteration, on branches `iteration-v2` (PR #3) and `iteration-adda`.

## Summary

- **Branding:** "gm coii" is now just "coii" everywhere.
- **About:** new copy, three feature cards, "Built for Devcon 8" footer, invite button.
- **Adda:** up to three crews per person, drawn as tents you can move around the map. You add
  people by waving or by dragging their bean onto a tent. When they join, it counts as a chai.
- **Share an adda:** a square picture of your crew, plus share buttons for X, LinkedIn and
  Telegram.
- **Join link:** `coii.decipherclub.com/join` opens the join form straight away. There's also an
  invite screen for sharing it.
- **Narrative race:** a live race of the ten booths (who's biggest, who's rising fastest), with
  flames on the booth signs and an invite-to-climb loop.
- **Backend:** adda tables, RPCs and pgTAP tests in Supabase. The client still runs on demo data
  until real sign-ups are connected.

---

## 1. "gm coii" → "coii"

- Changed the wordmark in the HUD, the venue sign on the map, About, `index.html` (title and og
  tags), README and PLAN to "coii".
- Removed the gm accent styles that were no longer used.
- Branch `iteration-v2`, PR #3.

## 2. About section rework

- **Hero:** "coii", tagline "connect on ideas & interests", a row of beans.
- **Lead:** "Plan & connect with people that value your interests. Make the most of Devcon 8."
- **Why:** "Don't waste your time and social energy at an event (especially for nerds)." coii
  helps you:
  - Plan and strategize beforehand who you want to meet
  - Connect with people who share your ideas and interests
  - Make friends
- **"With coii you can:"**, three cards with text of roughly equal length:
  - **Create your own adda:** the group of people (and frens) you want to meet at Devcon 8.
  - **Wave and earn wave points:** every wave you get is a point up the leaderboard.
  - **coii recommends your matches:** daily recommendations matched on ideas.
- **Removed:** the "How it works" section.
- **Ground rules:** kept.
- **Footer:**
  - "Built for Devcon 8".
  - Join coii (or See today's 3), Explore the map, and Invite friends.
  - **"With love, from Decipher Club"** ❤️.

## 3. Adda: your crews for Devcon

### Rules

- **Up to three addas per person, 30 people each.** The 30 counts invited and joined people
  together, not the owner.
- **Name, style and colour:**
  - Each adda has a name: at most 24 characters, no links or @handles.
  - If you leave the name empty you get a default: "Zara's adda", "Zara's adda 2", and so on.
  - Each adda also has a tent style (Shamiana, Tambu, Chhatri) and a colour (rani, marigold,
    peacock, leaf, violet, chai).
- **Wave first.** "Add to <adda>" only appears after you've waved at someone. The limit of 50
  waves a day also caps invites.
- **The same person can be in more than one of your addas.**
- **Invites show who they're from.** The invitee sees your name and the adda's name, then picks
  **Join** or **Not now**.
- **Joining counts as a chai.** Accepting waves back for free (it doesn't use a daily wave). That
  makes a chai: contacts both ways, plus a wave point for the owner. Instead of the big "Chai's
  on!" card, the tent celebrates with a toast and confetti.
- **"Not now" is never shown to the owner.** They keep seeing "waiting" and can withdraw the
  invite.
- **Silent actions:** removing someone, leaving an adda and taking a tent down send no
  notification.
- **People stay at their booths.** The tent shows a stand-in bean for each member, and tapping one
  opens the real person.

### On the map

- **Where tents go:** in a free band around the venue, anywhere outside the ring of booths. A tent
  can't overlap a booth, the plaza, the gate or your other tents.
- **Moving a tent:**
  - Drag it with the mouse, or long-press and drag on a phone.
  - The ground ring turns green where the tent fits and red where it doesn't. Dropping it on red
    sends it back.
  - The crowd walks over to the new spot.
  - The position is saved separately for landscape and portrait.
- **Default spots:** new tents start beside the gate (right, then left), then go around the ring.
  The default view frames the venue plus the first two tent spots.
- **Size:**
  - The tent art gets bigger at 6 and 16 members.
  - The ground ring widens with every member.
  - Each joined member adds one bunting flag.
- **Invited vs joined:** invited people stand still and see-through. Joined people stroll and
  chat, and hop with confetti the moment they join.
- **What the map shows:** your tents, plus one adda you're in if you pick "Show on map".

### Drag a bean onto a tent

- Drag anyone's bean onto one of your tents.
- If you haven't waved at them yet, a centred popup appears and **Wave + add** does both in one
  tap.
- Their stand-in then drops into the tent from above while the camera follows.
- If they're already in that adda, you just get a toast.

### Screens

- **Profile:**
  - With no adda yet, "Add to my adda" opens name and look and builds the tent and sends the
    invite in one go.
  - After that, each adda has one line: Add to <adda> → Invited · waiting → In <adda>.
- **Adda tab** (in the phone tab bar and the desktop side panel):
  - One card per adda, with Share, On map, Edit, Take down, and the member list with remove
    buttons.
  - **New adda** (n of 3).
  - Invites for you, with Join / Not now.
  - Addas you're in, with Show on map / Leave.
  - The tab badge counts invites waiting for you.

### Demo behaviour

- **Saved in the browser** under `coii:adda:v1` (format 2). An old format-1 save becomes your
  first adda.
- **Demo answers:** demo people answer invites within 5–30 s. The more topics you share, the more
  likely they say yes.
- **Demo invites:** up to two arrive per visit, the first one 2.5–4.5 minutes in.

## 4. Share an adda as a picture

- **The picture:**
  - **Share** on an adda (once at least one person has said yes) opens a 1350 × 1350 PNG drawn in
    the browser with the map's bean art.
  - It's square, so X, LinkedIn and Telegram show it without cropping.
- **On the card:**
  - You in the middle, marked "host".
  - Everyone who said yes in a ring around you, each with their bean and full name. Faces shrink
    as the ring fills, so all 30 fit.
  - People still invited, or who said no, are left out. No handles are shown.
  - A header in the adda's colour, with its name and "N people meeting at Devcon 8 · Mumbai".
  - A footer with the coii wordmark and `coii.decipherclub.com`.
- **Text:** "Check out my adda on coii 🎪 These are the people I'm meeting at Devcon 8, Mumbai:
  https://coii.decipherclub.com/join"
- **Buttons:**
  - **Share picture + text** (on browsers that can share files, mostly phones): opens the system
    share sheet, so the picture and the text go to X, LinkedIn, Telegram, WhatsApp and others in
    one step.
  - **Share on X / LinkedIn / Telegram:** opens the composer with the text filled in, copies the
    picture to the clipboard (or downloads it), and shows a toast telling you to paste it.
  - **Download picture** and **Copy text**.
- **Why the picture can't attach itself from a link:**
  - X `intent/post` and LinkedIn `shareActive` only take text. Telegram `share/url` takes a link
    and text.
  - A shared link only shows a picture if the page it points to has an `og:image`. That would need
    a hosted page per adda, which is future work.

## 5. Shareable join link

- **The link:** `https://coii.decipherclub.com/join` opens coii with the join form already up over
  the live venue.
- **Variants:**
  - `/join/<booth>`, for example `/join/defi`, also picks that booth in the form.
  - `?join` and `?join=<booth>` work too.
  - Case doesn't matter, and an unknown booth still opens the form.
- **Already joined in this browser:** the link opens your profile instead, with a toast saying
  "You're already on coii".
- **Opens once:** after the form opens, the address goes back to `/` (other parameters are kept),
  so a reload or bookmark doesn't reopen it.
- **Hosting:** `vercel.json` rewrites `/join` and `/join/:topic` to `index.html`. The page uses the
  same og tags, so the link shows the standard coii preview.
- **Invite screen ("Invite people to coii"):**
  - Opened from **Invite friends** in About and on your own profile.
  - The link with **Copy link**.
  - A **Start them at a booth** picker that switches the link to `/join/<booth>`.
  - The system share sheet, where the browser has one.
  - **Share on X / LinkedIn / Telegram / WhatsApp.**
  - Text: "Join me on coii, the live map of who's into what at Devcon 8, Mumbai. Put your bean on
    it and let's meet:" plus the link.
- **Adda share posts** link to `/join` too.

## 6. Backend (Supabase)

- **Migration:** `supabase/migrations/20261010120000_adda.sql`.
- **Tables:**
  - `private.addas (id, owner_id, name, style, color, places)`, at most three per owner.
  - `private.adda_members (adda_id, member_id, status invited|joined|declined)`.
  - A `waves.free` flag, so waves made by joining an adda don't count against the daily limit.
- **RPCs:**
  - `create_adda`, `update_adda`, `delete_adda`, `move_adda`.
  - `invite_to_adda`, `remove_from_adda`, `respond_to_adda_invite`, `leave_adda`.
  - `get_adda_state`.
- **Checks:**
  - Names are cleaned and checked like bean names.
  - Invites require that the caller waved first, the other person is visible, nobody has blocked
    anybody, and the adda has room.
- **Privacy:** a declined invite reads as `invited` to the owner.
- **Cleanup:** blocking removes adda rows both ways. Addas are purged after the event, along with
  waves and chais.
- **Realtime:** `adda_invite` goes to the invitee and `adda_joined` goes to the owner, on their
  personal topic.
- **Tests:** `supabase/tests/database/07_adda.sql` (40 pgTAP checks).

## 7. Narrative race (which ideas Devcon 8 is lining up for)

- **What:** a live race of the ten booths, opened from the pink 🔥 chip next to the Board pill
  (it names the fastest-rising booth), from a booth panel's "#2 in the narrative race" line, or
  from `coii.decipherclub.com/trends`.
- **Counting:** everyone who picked a topic counts once in that booth (three topics, three
  booths). "Today" is a rolling 24 hours.
- **Tabs:** Most people · Rising fastest (24h) · Since you joined (or since you got here).
- **Hottest:** the booth growing fastest today, not the biggest: joins in 24h against its crowd
  before them, with at least 3 joins so one person can't spike it.
- **Live:** every arrival bumps its booths with "+1 Name" on the bars; rows slide when one booth
  passes another; bars ease to their new length. Tapping a row opens that booth.
- **Your booth:** "Privacy is #4. 124 more people and it passes DeFi." with **Invite to Privacy**
  (the invite card with `/join/privacy` ready) and **Share the race** (top three and the hottest,
  plus the `/trends` link). Before joining: a nudge to join instead.
- **On the map:** every booth sign carries a badge with up to three flames (joins against the
  busiest booth's) and "+N" joins today; the hottest booth's sign glows; arrivals float "+1 Name"
  off their booths' signs.
- **Demo:** the demo crowd's sign-up days lean recent for some booths (Prediction, Security,
  DeFi) so the race isn't a dead heat; real sign-ups replace it.
- **Code:** `src/match/trends.ts` (counting), `src/app/trends.ts` (feeds the map and the store),
  `src/ui/TrendsOverlay.tsx`, `src/ui/trends.css`, the chip in `src/ui/Hud.tsx`,
  `BoothLabels.setHeat` / `pop` in `src/engine/labels.ts`.
- **Backend later:** a `topic_counts` view (count and joins in 24h per topic) plus a realtime
  "joined" event; the client already recounts on every arrival.

## Not done yet

- **Real data in the app:** the app still runs on demo data. Wiring adda and invites to the real
  database waits on real sign-ups (TRACKER L2).
- **Pictures in shared links:** this needs a hosted `og:image` page per adda, and the site-wide
  `og.png` that `index.html` points to doesn't exist yet.
- **Referral tracking:** the join link doesn't record who invited whom. That could be added later
  with `?ref=`.
- **Phone layout:** on a phone, new tents can start under the tab bar in the default view.

## Where the code lives

- **Adda:**
  - Data and demo: `src/data/adda.ts`, `src/adda/`.
  - Controller: `src/app/adda.ts`.
  - Map: `src/engine/addaPlots.ts`, `addaTent.ts`, `addaCrowd.ts`, `src/sim/layout.ts`.
  - UI: `src/ui/AddaPanel.tsx`, `AddaButton.tsx`, `DropAddaOverlay.tsx`.
- **Share card:** `src/ui/addaCard.ts`, `addaShare.ts`, `ShareAddaOverlay.tsx`.
- **Join link:** `src/app/joinLink.ts`, `src/ui/InviteOverlay.tsx`, `src/ui/shareLinks.ts`,
  `src/main.tsx`.
- **About:** `src/ui/AboutOverlay.tsx`.
