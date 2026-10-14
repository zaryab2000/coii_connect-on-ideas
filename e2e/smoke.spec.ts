import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function waitForCrowd(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__coii?.engine.stats().beans ?? 0) >= 1500, undefined, {
    timeout: 20_000,
  });
}

test("the venue opens with booths, a live crowd and no errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await expect(page.locator("canvas.map-canvas")).toBeVisible();
  await waitForCrowd(page);
  await expect(page.locator(".booth-label")).toHaveCount(10);
  expect(errors).toEqual([]);
});

test("tapping a person on the map selects them", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.waitForTimeout(3000); // let the phone intro camera settle
  await page.evaluate(() => window.__coii?.engine.focusBooth("ai"));
  await page.waitForTimeout(1200);
  const target = await page.evaluate(() => {
    const hook = window.__coii;
    if (!hook) return null;
    hook.engine.pause();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const inMiddle = (x: number, y: number): boolean =>
      x > w * 0.3 && x < w * 0.7 && y > h * 0.35 && y < h * 0.65;
    for (const person of hook.controller.store.get().people) {
      const p = hook.engine.screenPositionOf(person.id);
      // Skip beans hidden under a booth label or a bubble: a tap there hits the label.
      const top = p && inMiddle(p.x, p.y) ? document.elementFromPoint(p.x, p.y) : null;
      if (p && top?.tagName === "CANVAS") return { id: person.id, ...p };
    }
    return null;
  });
  expect(target).not.toBeNull();
  if (!target) return;
  await page.mouse.click(target.x, target.y);
  const selected = await page.evaluate(
    () => window.__coii?.controller.store.get().selectedId ?? null,
  );
  expect(selected).not.toBeNull();
});

test("up close, a few one-liners pop up at a time and tapping one opens that person", async ({
  page,
}) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__coii?.engine.focusBooth("stablecoins"));
  const bubbles = page.locator(".quote:not(.is-leaving)");
  // The most bubbles showing at any moment over eight seconds, sampled in the page.
  const most = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let max = 0;
        let samples = 0;
        const timer = window.setInterval(() => {
          max = Math.max(max, document.querySelectorAll(".quote:not(.is-leaving)").length);
          samples += 1;
          if (samples < 16) return;
          window.clearInterval(timer);
          resolve(max);
        }, 500);
      }),
  );
  expect(most).toBeGreaterThanOrEqual(1);
  expect(most).toBeLessThanOrEqual(3);
  await expect(bubbles.first()).toBeVisible();
  await bubbles.first().dispatchEvent("click");
  await expect
    .poll(() => page.evaluate(() => window.__coii?.controller.store.get().selectedId ?? null))
    .not.toBeNull();
});

test("joining puts you in the venue and you are still there after a reload", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  const id = await page.evaluate(async () => {
    const outcome = await window.__coii?.controller.actions.join(
      {
        name: "Test Person",
        telegram: "test_person",
        x: null,
        topics: ["privacy", "core"],
        intent: [],
        oneLiners: ["testing coii"],
        avatar: { skin: 2, hair: 0, hairColor: 0, accessory: 0 },
      },
      null,
    );
    return outcome?.ok ? outcome.person.id : null;
  });
  expect(id).toBeTruthy();
  await page.reload();
  await page.waitForFunction(() => (window.__coii?.engine.stats().beans ?? 0) >= 1501, undefined, {
    timeout: 20_000,
  });
  const you = await page.evaluate(() => window.__coii?.controller.store.get().you?.id ?? null);
  expect(you).toBe(id);
  await expect(page.locator(".map-tag--you")).toHaveCount(1);
});

test("the join overlay builds your bean and walks it into the venue", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.getByRole("button", { name: "Join", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Join coii" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your name").fill("Asha Rao");
  await dialog.getByLabel("Telegram username").fill("asha_builds");
  await dialog.getByRole("button", { name: /Privacy/ }).click();
  await dialog.getByRole("button", { name: /Core/ }).click();
  await expect(dialog.locator(".studio__name")).toHaveText("Asha Rao");
  await dialog.getByRole("radio", { name: "Turban" }).check({ force: true });
  await dialog.getByRole("checkbox").check({ force: true });
  await dialog.getByRole("button", { name: "Walk into coii" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".map-tag--you")).toContainText("Asha", { timeout: 15_000 });
  const you = await page.evaluate(() => window.__coii?.controller.store.get().you ?? null);
  expect(you?.avatar.hair).toBe(11);
});

/** Screen positions of the first few dozen beans. */
async function samplePositions(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hook = window.__coii;
    if (!hook) return "";
    return hook.controller.store
      .get()
      .people.slice(0, 40)
      .map((p) => {
        const at = hook.engine.screenPositionOf(p.id);
        return at ? `${Math.round(at.x)},${Math.round(at.y)}` : "-";
      })
      .join(" ");
  });
}

test("About opens over the venue, which keeps moving behind it", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.waitForTimeout(3000); // let the phone intro camera settle
  await page.getByRole("button", { name: "About" }).click();
  const about = page.getByRole("dialog", { name: "coii" });
  await expect(about).toBeVisible();
  await expect(about.getByText("connect on ideas & interests")).toBeVisible();
  const before = await samplePositions(page);
  await page.waitForTimeout(1500);
  expect(await samplePositions(page)).not.toBe(before);
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  expect(errors).toEqual([]);
});

test("tapping your own bean opens your profile overlay, not a side profile", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.waitForTimeout(4000); // walk in from the gate while the camera follows
  const at = await page.evaluate(() => {
    const hook = window.__coii;
    const you = hook?.controller.store.get().you;
    if (!hook || !you) return null;
    hook.engine.pause();
    return hook.engine.screenPositionOf(you.id);
  });
  expect(at).not.toBeNull();
  if (!at) return;
  await page.mouse.click(at.x, at.y - 12);
  await expect(page.getByRole("dialog", { name: "You're in" })).toBeVisible();
  expect(await page.evaluate(() => window.__coii?.controller.store.get().selectedId)).toBeNull();
});

async function joinQuickly(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__coii?.controller.actions.join(
      {
        name: "Meet Tester",
        telegram: "meet_tester",
        x: null,
        topics: ["privacy", "ai"],
        intent: ["building"],
        oneLiners: ["testing the daily picks"],
        avatar: { skin: 1, hair: 2, hairColor: 0, accessory: 0 },
      },
      null,
    ),
  );
}

/** Flips card `n`; it turns face up once the back has turned away. */
async function revealCard(page: Page, n: number): Promise<void> {
  await page.getByRole("button", { name: `Reveal card ${n} of 3` }).click();
  await expect(page.locator(".meet-card")).toHaveCount(n);
}

/** A card whose person has not secretly waved at you already, so a wave stays a plain wave. */
async function plainCardIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("coii:meet:v1") ?? "{}") as {
      inbound?: string[];
    };
    const hand = window.__coii?.controller.store.get().meet?.hand ?? [];
    return hand.findIndex((card) => !(saved.inbound ?? []).includes(card.personId));
  });
}

test("Meet: reveal today's 3, wave at one and light up My tribe", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);

  await page.getByRole("button", { name: "Meet, 3 new" }).click();
  await expect(page.getByRole("heading", { name: "Today's 3" })).toBeVisible();
  await revealCard(page, 1);
  await revealCard(page, 2);
  await revealCard(page, 3);
  await expect(page.getByRole("button", { name: "Meet", exact: true })).toBeVisible();

  const index = await plainCardIndex(page);
  expect(index).toBeGreaterThanOrEqual(0);
  const slot = page.locator(".meet-slot").nth(index);
  await slot.getByRole("button", { name: "Wave", exact: true }).click();
  await expect(slot.locator(".stamp")).toContainText("Waved");
  await expect(slot.getByText(/\+1 wave point for/)).toBeVisible();
  await expect(slot.getByRole("button", { name: "See how to reach them" })).toBeVisible();
  await expect(page.getByText("49 waves left today")).toBeVisible();

  // Skipping the other two finishes today's picks; "Light up My tribe" then lights the map.
  const skips = page.locator(".meet-slot").getByRole("button", { name: "Skip" });
  await skips.first().click();
  await expect(skips).toHaveCount(1);
  await skips.first().click();
  await expect(skips).toHaveCount(0);
  await page.getByRole("button", { name: "Light up My tribe" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__coii?.controller.store.get().tribe))
    .toBe(true);
  expect(errors).toEqual([]);
});

test("waving at someone unlocks their contact and gives them a wave point", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  const id = await page.evaluate(
    () =>
      window.__coii?.controller.store.get().people.find((p) => p.isDemo && p.x !== null)?.id ?? "",
  );
  await page.evaluate((target) => window.__coii?.controller.actions.locate(target), id);
  const profile = page.locator("article.profile");
  await expect(profile.getByText("Wave to see their handles")).toBeVisible();
  await expect(profile.getByRole("button", { name: "Message on Telegram" })).toHaveCount(0);
  const before = Number(await profile.locator(".points-badge strong").textContent());
  await profile.getByRole("button", { name: "Wave to connect" }).click();
  await expect(profile.getByRole("button", { name: "Message on Telegram" })).toBeVisible();
  await expect(profile.locator(".profile__handles")).toContainText("@demo_");
  await expect(profile.locator(".points-badge strong")).toHaveText(String(before + 1));
});

test("the board pill opens a live wave-points leaderboard", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.getByRole("button", { name: /Wave points board/ }).click();
  const board = page.getByRole("dialog", { name: "Wave points" });
  await expect(board).toBeVisible();
  await expect(board.getByRole("list", { name: "Top three" }).getByRole("listitem")).toHaveCount(3);
  await expect(board.getByText(/^You · #\d+ · \d+ wave points?$/)).toBeVisible();
  const defi = board
    .getByRole("group", { name: "Show the board for a booth" })
    .getByRole("button", { name: "DeFi" });
  await defi.click();
  await expect(defi).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(board).toBeHidden();
  expect(errors).toEqual([]);
});

test("Meet: with reduced motion a card fades in instead of flipping", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.getByRole("button", { name: /^Meet/ }).first().click();
  await page.getByRole("button", { name: "Reveal card 1 of 3" }).click();
  const card = page.locator(".meet-card").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("fade-in");
  await expect(page.locator(".confetti")).toHaveCount(0);
});

test("Meet: before joining, the locked hand invites you in", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.getByRole("button", { name: "Meet", exact: true }).click();
  await page.getByRole("button", { name: "Join to get your daily picks" }).click();
  const dialog = page.getByRole("dialog", { name: "Join coii" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: /What are you here for/ })).toBeVisible();
});

test("adda: wave, build your tent and add them; they wait see-through in it", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  const before = await page.evaluate(() => window.__coii?.engine.stats().beans ?? 0);
  const id = await page.evaluate(
    () => window.__coii?.controller.store.get().people.find((p) => p.isDemo)?.id ?? "",
  );
  await page.evaluate((target) => window.__coii?.controller.actions.locate(target), id);
  const profile = page.locator("article.profile");
  await expect(profile.getByRole("button", { name: "Add to my adda" })).toHaveCount(0);
  await profile.getByRole("button", { name: "Wave to connect" }).click();
  await profile.getByRole("button", { name: "Add to my adda" }).click();
  await profile.getByRole("radio", { name: "Chhatri" }).check();
  await profile.getByRole("radio", { name: "Peacock" }).check();
  await profile.getByRole("button", { name: /Build it and add/ }).click();
  await expect(profile.getByText(/Invited to Meet's adda · waiting for/)).toBeVisible();
  const adda = await page.evaluate(() => window.__coii?.controller.store.get().adda);
  expect(adda?.addas[0]?.members).toEqual([
    expect.objectContaining({ personId: id, status: "invited" }),
  ]);
  // You and the invitee stand in the tent as stand-ins; their real beans stay at their booths.
  expect(await page.evaluate(() => window.__coii?.engine.stats().beans ?? 0)).toBe(before + 2);

  await page.evaluate(() => window.__coii?.controller.actions.openPanel("adda"));
  await expect(page.getByRole("heading", { name: "Your addas" })).toBeVisible();
  await expect(page.locator(".adda-member .adda-pill")).toHaveText("Waiting");
  expect(errors).toEqual([]);
});

test("adda: an invite waiting for you can be joined, which makes it a chai", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  const owner = await page.evaluate(() => {
    const state = window.__coii?.controller.store.get();
    const person = state?.people.find((p) => p.isDemo);
    const you = state?.you;
    if (!person || !you) return null;
    const save = {
      version: 2,
      personId: you.id,
      addas: [],
      invites: [{ ownerId: person.id, addaId: "their-adda", name: "Their adda", at: Date.now() }],
      joined: [],
      viewing: null,
    };
    localStorage.setItem("coii:adda:v1", JSON.stringify(save));
    return person.id;
  });
  expect(owner).not.toBeNull();
  await page.reload();
  await waitForCrowd(page);
  await page.evaluate(() => window.__coii?.controller.actions.openPanel("adda"));
  await page.getByRole("button", { name: "Join Their adda" }).click();
  await expect(page.getByRole("heading", { name: "Addas you're in" })).toBeVisible();
  const state = await page.evaluate(() => window.__coii?.controller.store.get());
  expect(state?.adda?.joined.map((j) => j.ownerId)).toEqual([owner]);
  expect(state?.meet?.waved).toContain(owner);
});

test("adda: share a picture of everyone who said yes", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.evaluate(() => {
    const state = window.__coii?.controller.store.get();
    const you = state?.you;
    if (!state || !you) return;
    const ids = state.people
      .filter((p) => p.isDemo)
      .slice(0, 3)
      .map((p) => p.id);
    const save = {
      version: 2,
      personId: you.id,
      addas: [
        {
          id: "crew",
          name: "Rust crew",
          look: { style: "tambu", color: "peacock" },
          members: ids.map((id, i) => ({
            personId: id,
            status: i === 2 ? "invited" : "joined",
            invitedAt: Date.now(),
          })),
          declined: [],
          places: {},
        },
      ],
      invites: [],
      joined: [],
      viewing: null,
    };
    localStorage.setItem("coii:adda:v1", JSON.stringify(save));
  });
  await page.reload();
  await waitForCrowd(page);
  await page.evaluate(() => window.__coii?.controller.actions.openPanel("adda"));
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share Rust crew" });
  const card = dialog.locator("img.share-card");
  // You plus the two who said yes; the one still waiting is left out.
  await expect(card).toHaveAttribute("alt", /^Rust crew: Meet, \S+ and \S+$/);
  const size = await card.evaluate((img: HTMLImageElement) => [
    img.naturalWidth,
    img.naturalHeight,
  ]);
  expect(size).toEqual([1350, 1350]);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download picture" }).click();
  expect((await download).suggestedFilename()).toBe("rust-crew-coii.png");
  await Promise.all(
    ["X", "LinkedIn", "Telegram"].map((site) =>
      expect(dialog.getByRole("button", { name: `Share on ${site}` })).toBeVisible(),
    ),
  );
  expect(errors).toEqual([]);
});

test("adda: drag someone onto your tent, wave + add, and they fall in", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  const addaId = await page.evaluate(async () => {
    const actions = window.__coii?.controller.actions;
    const id = (await actions?.createAdda({ style: "chhatri", color: "leaf" }, "ZK crew")) ?? "";
    actions?.focusAdda(id);
    return id;
  });
  await page.waitForTimeout(1200);
  const box = await page.locator("canvas.map-canvas").boundingBox();
  if (!box) throw new Error("expected the map canvas");
  // Zoom out around the tent until the nearest booths' crowds are on screen too.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  // Freeze the crowd so the bean under the pointer stays put while we drag it.
  await page.evaluate(() => window.__coii?.engine.pause());
  // A demo bean comfortably on screen, below the HUD.
  // A demo bean that a press at its position really picks up: on the canvas (no label or
  // bubble on top) and nobody else under the pointer.
  const beans = await page.evaluate(() => {
    const hook = window.__coii;
    const demo = (hook?.controller.store.get().people ?? []).filter((p) => p.isDemo);
    return demo.map((p) => ({ id: p.id, at: hook?.engine.screenPositionOf(p.id) ?? null }));
  });
  const from = await page.evaluate(
    ({ list, left, top }) => {
      const engine = window.__coii?.engine;
      const ok = (id: string, x: number, y: number): boolean =>
        document.elementFromPoint(left + x, top + y)?.tagName === "CANVAS" &&
        engine?.personAtScreen(x, y) === id;
      return list.find((b) => b.at !== null && ok(b.id, b.at.x, b.at.y))?.at ?? null;
    },
    { list: beans, left: box.x, top: box.y },
  );
  const to = await page.evaluate((id) => window.__coii?.engine.screenPositionOfAdda(id), addaId);
  if (!from || !to) throw new Error("expected a bean and the tent on screen");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  // Hold first: on touch screens a bean is picked up with a long-press.
  await page.waitForTimeout(450);
  await page.mouse.move(box.x + from.x + 12, box.y + from.y + 12, { steps: 3 });
  await page.mouse.move(box.x + to.x + 20, box.y + to.y, { steps: 20 });
  await page.mouse.up();
  await page.evaluate(() => window.__coii?.engine.resume());

  const popup = page.getByRole("dialog", { name: /^Wave \+ add .+ first$/ });
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Wave + add" }).click();
  await expect(popup).toBeHidden();
  const members = await page.evaluate(
    () => window.__coii?.controller.store.get().adda?.addas[0]?.members ?? [],
  );
  expect(members).toEqual([expect.objectContaining({ status: "invited" })]);
  const waved = await page.evaluate(() => window.__coii?.controller.store.get().meet?.waved ?? []);
  expect(waved).toContain(members[0]?.personId);
  expect(errors).toEqual([]);
});

test("a shared /join link opens the join form with its booth picked", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/join/defi?still");
  const dialog = page.getByRole("dialog", { name: "Join coii" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /DeFi/, pressed: true })).toBeVisible();
  await expect(page).toHaveURL(/\/\?still$/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Join coii" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("?join opens the form too, and About hands out the join link", async ({ page }) => {
  await page.goto("/?still&join");
  await expect(page.getByRole("dialog", { name: "Join coii" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About" }).click();
  await page.getByRole("button", { name: "Invite friends" }).click();
  const invite = page.getByRole("dialog", { name: "Invite people to coii" });
  await expect(invite).toBeVisible();
  await expect(invite.getByLabel("Join link")).toHaveValue("https://coii.decipherclub.com/join");
  await invite.getByLabel("Start them at a booth").selectOption("privacy");
  await expect(invite.getByLabel("Join link")).toHaveValue(
    "https://coii.decipherclub.com/join/privacy",
  );
});

test("the trending chip opens a live narrative race of all ten booths", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  // The booth signs carry the race too: flames and joins today.
  await expect(page.locator(".booth-heat:not([hidden])").first()).toBeVisible();
  const hudActions = page.locator(".hud__chips-row");
  // Board, race, and the "Demo crowd" label (made-up people are always labelled).
  await expect(hudActions.getByRole("button")).toHaveCount(3);
  await expect(hudActions.getByRole("button", { name: /Demo crowd/ })).toBeVisible();
  const raceButton = hudActions.getByRole("button", { name: /^Narrative race/ });
  await expect(raceButton).toHaveText("Narrative race");
  await raceButton.click();
  const race = page.getByRole("dialog", { name: "Narrative race" });
  await expect(race).toBeVisible();
  const rows = race.getByRole("list", { name: "Booths in the race" }).getByRole("listitem");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("AI Agents");
  await race.getByRole("button", { name: "Rising fastest · 24h" }).click();
  await expect(race.getByRole("button", { name: "Rising fastest · 24h" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Exactly one booth is the hottest (the fastest-rising one).
  await expect(race.getByRole("button", { name: /rising fastest/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a /trends link opens the race, and a row opens its booth", async ({ page }) => {
  await page.goto("/trends?still");
  const race = page.getByRole("dialog", { name: "Narrative race" });
  await expect(race).toBeVisible();
  await expect(page).toHaveURL(/\/\?still$/);
  await waitForCrowd(page);
  await race.getByRole("button", { name: /^#\d+ DeFi:/ }).click();
  await expect(race).toBeHidden();
  await expect(page.getByRole("heading", { name: "DeFi" })).toBeVisible();
  await expect(page.getByRole("button", { name: /in the narrative race/ })).toBeVisible();
});

test("once joined, the race shows your booth's place and invites people to it", async ({
  page,
}) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.getByRole("button", { name: /^Narrative race/ }).click();
  const race = page.getByRole("dialog", { name: "Narrative race" });
  await expect(race.getByText(/Privacy is #\d+\. \d+ more people and it passes/)).toBeVisible();
  await race.getByRole("button", { name: "Invite to Privacy" }).click();
  const invite = page.getByRole("dialog", { name: "Invite people to coii" });
  await expect(invite.getByLabel("Join link")).toHaveValue(
    "https://coii.decipherclub.com/join/privacy",
  );
});

test("/privacy opens the privacy notice; the join form and About link to it", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/privacy?still");
  const notice = page.getByRole("dialog", { name: "Privacy" });
  await expect(notice).toBeVisible();
  await expect(notice.getByText("zartaj.afsar@gmail.com").first()).toBeVisible();
  await expect(notice.getByText(/unofficial community project/)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await page.keyboard.press("Escape");
  await expect(notice).toBeHidden();

  await page.goto("/join?still");
  const form = page.getByRole("dialog", { name: "Join coii" });
  await expect(
    form.getByText(
      "Your bean, name, topics and one-liners are public. Your handles show only to people who wave at you.",
    ),
  ).toBeVisible();
  await expect(form.getByText("Built with Love, by Decipher Club ❤️")).toBeVisible();
  await expect(form.getByText(/unofficial community project/)).toHaveCount(0);
  await form.getByRole("button", { name: "How coii uses your data" }).click();
  await expect(page.getByRole("dialog", { name: "Privacy" })).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Decipher Club plugs (docs-internal/prd/decipher-club-plugs.md) ----------------------------

const PITCH = "Built by Decipher Club: a research-driven publication by builders for builders.";

test("About's footer says who built coii, with Subscribe and Telegram links", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.getByRole("button", { name: "About" }).click();
  const about = page.getByRole("dialog", { name: "coii" });
  await expect(about.getByText(PITCH)).toBeVisible();
  const subscribe = about.getByRole("link", { name: "Subscribe" });
  await expect(subscribe).toHaveAttribute(
    "href",
    "https://www.decipherclub.com/?utm_source=coii&utm_medium=about",
  );
  await expect(subscribe).toHaveAttribute("target", "_blank");
  await expect(subscribe).toHaveAttribute("rel", "noopener noreferrer");
  await expect(about.getByRole("link", { name: "Join our Telegram" })).toHaveAttribute(
    "href",
    "https://t.me/+mtMGHzBxC7BjOGY1",
  );
  expect(errors).toEqual([]);
});

/** Every HUD control's box, keyed by its text, to compare with and without the credit. */
async function hudControlBoxes(page: Page): Promise<Record<string, DOMRect>> {
  return page.evaluate(() => {
    const boxes: Record<string, DOMRect> = {};
    const controls = document.querySelectorAll<HTMLElement>(".hud button, .hud .live-pill");
    for (const [i, el] of [...controls].entries()) {
      if (el.offsetParent) boxes[`${i}:${el.textContent ?? ""}`] = el.getBoundingClientRect();
    }
    return JSON.parse(JSON.stringify(boxes)) as Record<string, DOMRect>;
  });
}

test("the HUD credits Decipher Club without moving or covering any control", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/?still");
  await waitForCrowd(page);
  const credit = page.locator(".hud").getByRole("link", { name: /by Decipher/ });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute(
    "href",
    "https://www.decipherclub.com/?utm_source=coii&utm_medium=hud",
  );
  const box = await credit.boundingBox();
  const withCredit = await hudControlBoxes(page);
  expect(Object.keys(withCredit).length).toBeGreaterThan(2);
  const covered = Object.entries(withCredit).filter(
    ([, control]) =>
      box !== null &&
      box.x < control.x + control.width &&
      control.x < box.x + box.width &&
      box.y < control.y + control.height &&
      control.y < box.y + box.height,
  );
  expect(covered.map(([name]) => name)).toEqual([]);
  // On a 375 px phone nothing may move for it (wide screens have room to spare).
  if (testInfo.project.name !== "phone") return;
  await page.addStyleTag({ content: ".wordmark__by { display: none !important; }" });
  expect(await hudControlBoxes(page)).toEqual(withCredit);
});

test("demo mode never shows the Decipher Club welcome card", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.waitForTimeout(5000);
  await expect(page.locator(".decipher-welcome")).toHaveCount(0);
});

test("💡 Got ideas?: visitors are asked to join; the dev links point at the repo", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.getByRole("button", { name: /Got ideas\?/ }).click();
  const panel = page.getByRole("dialog", { name: "Got an idea for coii?" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Join coii to send a request")).toBeVisible();
  await expect(panel.getByLabel("Your idea")).toHaveCount(0);
  const issue = panel.getByRole("link", { name: "Create an issue or PR" });
  await expect(issue).toHaveAttribute(
    "href",
    "https://github.com/zaryab2000/coii_connect-on-ideas/issues/new?template=feature_request.md",
  );
  await expect(issue).toHaveAttribute("target", "_blank");
  await expect(issue).toHaveAttribute("rel", "noopener noreferrer");
  await expect(panel.getByRole("link", { name: "Open a pull request" })).toHaveAttribute(
    "href",
    "https://github.com/zaryab2000/coii_connect-on-ideas/pulls",
  );
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  // About links to the same panel.
  await page.getByRole("button", { name: "About" }).click();
  await page.getByRole("button", { name: "Request a feature" }).click();
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});

test("💡 Got ideas?: in demo mode a joined person can write one, but nothing leaves the browser", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "localhost" && !url.hostname.endsWith("fonts.gstatic.com")) {
      outbound.push(request.url());
    }
  });
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);
  await page.getByRole("button", { name: /Got ideas\?/ }).click();
  const panel = page.getByRole("dialog", { name: "Got an idea for coii?" });
  const send = panel.getByRole("button", { name: "Send to coii-agent" });
  await expect(panel.getByRole("radio", { name: "Feature" })).toBeChecked();
  await panel.getByLabel("Your idea").fill("too short");
  await expect(panel.getByText("9 / 300")).toBeVisible();
  await expect(send).toBeDisabled();
  await panel.getByLabel("Your idea").fill("A booth for ZK hardware wallets");
  await expect(panel.getByText("31 / 300")).toBeVisible();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(panel.getByRole("alert")).toHaveText("Requests work on the live site.");
  expect(outbound).toEqual([]);
});

test("💡 Got ideas?: the HUD keeps every button on a 375px screen", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/?still");
  await waitForCrowd(page);
  const names = [/Got ideas\?/, /About/, "Fit the whole venue"];
  const boxes = await Promise.all(
    names.map((name) => page.getByRole("button", { name }).first().boundingBox()),
  );
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  }
  await context.close();
});
