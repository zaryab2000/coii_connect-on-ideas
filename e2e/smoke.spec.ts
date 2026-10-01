import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface DebugHook {
  engine: {
    stats(): { beans: number; fps: number };
    pause(): void;
    focusBooth(topic: string): void;
    resume(): void;
    screenPositionOf(id: string): { x: number; y: number } | null;
  };
  controller: {
    store: {
      get(): {
        people: { id: string }[];
        selectedId: string | null;
        you: { id: string } | null;
        tribe: boolean;
        meet: { hand: { personId: string }[]; waved: string[] } | null;
      };
    };
    actions: { join(input: unknown): { id: string } };
  };
}

declare global {
  interface Window {
    __adda?: DebugHook;
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function waitForCrowd(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__adda?.engine.stats().beans ?? 0) >= 1500, undefined, {
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
  await page.evaluate(() => window.__adda?.engine.focusBooth("ai"));
  await page.waitForTimeout(1200);
  const target = await page.evaluate(() => {
    const hook = window.__adda;
    if (!hook) return null;
    hook.engine.pause();
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (const person of hook.controller.store.get().people) {
      const p = hook.engine.screenPositionOf(person.id);
      if (
        p &&
        p.x > width * 0.3 &&
        p.x < width * 0.7 &&
        p.y > height * 0.35 &&
        p.y < height * 0.65
      ) {
        return { id: person.id, x: p.x, y: p.y };
      }
    }
    return null;
  });
  expect(target).not.toBeNull();
  if (!target) return;
  await page.mouse.click(target.x, target.y);
  const selected = await page.evaluate(
    () => window.__adda?.controller.store.get().selectedId ?? null,
  );
  expect(selected).not.toBeNull();
});

test("joining puts you in the venue and you are still there after a reload", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  const id = await page.evaluate(
    () =>
      window.__adda?.controller.actions.join({
        name: "Test Person",
        telegram: "test_person",
        x: null,
        topics: ["privacy", "core"],
        intent: [],
        oneLiner: "testing the adda",
        avatar: { skin: 2, hair: 0, hairColor: 0, accessory: 0 },
      }).id,
  );
  expect(id).toBeTruthy();
  await page.reload();
  await page.waitForFunction(() => (window.__adda?.engine.stats().beans ?? 0) >= 1501, undefined, {
    timeout: 20_000,
  });
  const you = await page.evaluate(() => window.__adda?.controller.store.get().you?.id ?? null);
  expect(you).toBe(id);
  await expect(page.locator(".map-tag--you")).toHaveCount(1);
});

test("filling in the join form walks your bean into the venue", async ({ page }) => {
  await page.goto("/?still");
  await waitForCrowd(page);
  await page.getByRole("button", { name: "Join", exact: true }).first().click();
  const form = page.locator("form").first();
  await form.getByLabel("Your name").fill("Asha Rao");
  await form.getByLabel("Telegram username").fill("asha_builds");
  await form.getByRole("button", { name: /Privacy/ }).click();
  await form.getByRole("button", { name: /Core/ }).click();
  await form.getByRole("checkbox").check({ force: true });
  await form.getByRole("button", { name: "Walk into the adda" }).click();
  await expect(page.locator(".map-tag--you")).toContainText("Asha", { timeout: 15_000 });
  const you = await page.evaluate(() => window.__adda?.controller.store.get().you?.id ?? null);
  expect(you).not.toBeNull();
});

async function joinQuickly(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__adda?.controller.actions.join({
      name: "Meet Tester",
      telegram: "meet_tester",
      x: null,
      topics: ["privacy", "ai"],
      intent: ["building"],
      oneLiner: "testing the Adda 3",
      avatar: { skin: 1, hair: 2, hairColor: 0, accessory: 0 },
    }),
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
    const saved = JSON.parse(localStorage.getItem("adda:meet:v1") ?? "{}") as {
      inbound?: string[];
    };
    const hand = window.__adda?.controller.store.get().meet?.hand ?? [];
    return hand.findIndex((card) => !(saved.inbound ?? []).includes(card.personId));
  });
}

test("Meet: reveal today's Adda 3, wave at one and light up My tribe", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?still");
  await waitForCrowd(page);
  await joinQuickly(page);

  await page.getByRole("button", { name: "Meet, 3 new" }).click();
  await expect(page.getByRole("heading", { name: "Your Adda 3" })).toBeVisible();
  await revealCard(page, 1);
  await revealCard(page, 2);
  await revealCard(page, 3);
  await expect(page.getByRole("button", { name: "Meet", exact: true })).toBeVisible();

  const index = await plainCardIndex(page);
  expect(index).toBeGreaterThanOrEqual(0);
  const slot = page.locator(".meet-slot").nth(index);
  await slot.getByRole("button", { name: "Wave", exact: true }).click();
  await expect(slot.locator(".stamp")).toContainText("Waved");
  await expect(slot.getByRole("button", { name: "Take it back" })).toBeVisible();
  await expect(page.getByText("19 waves left today")).toBeVisible();

  await page.keyboard.press("Escape");
  const tribe = page.getByRole("button", { name: /My tribe/ });
  await tribe.click();
  await expect(tribe).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__adda?.controller.store.get().tribe)).toBe(true);
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
  await expect(page.getByRole("heading", { name: "Join the adda" })).toBeVisible();
  await expect(page.getByRole("group", { name: /What are you here for/ })).toBeVisible();
});
