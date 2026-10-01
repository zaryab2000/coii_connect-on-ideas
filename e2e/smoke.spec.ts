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
      get(): { people: { id: string }[]; selectedId: string | null; you: { id: string } | null };
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
