import { expect, test } from "@playwright/test";

import { closeBrowsers, join, sql, sqlNumber } from "./helpers";

/** "Got an idea for coii?" against the local stack (docs-internal/prd/feature-requests.md §8). */
test.describe.configure({ mode: "serial" });
test.afterEach(closeBrowsers);

const SENT =
  "Feature request sent to coii-agent. Once it's done, coii-agent will tag you and let you know.";

test("a joined person sends ideas, stored with their bean; the 4th today hits the limit", async ({
  browser,
}) => {
  const mira = await join(browser, "Mira Shah");
  const { page } = mira;
  await page.getByRole("button", { name: /Got ideas\?/ }).click();
  const panel = page.getByRole("dialog", { name: "Got an idea for coii?" });
  await expect(panel).toBeVisible();

  const ideas = [
    "A booth for ZK hardware wallets",
    "Let me add a cape to my bean",
    "Show which talks people are going to",
  ];
  for (const [i, idea] of ideas.entries()) {
    if (i === 1) await panel.getByRole("radio", { name: "Avatar & design" }).check({ force: true });
    await panel.getByLabel("Your idea").fill(idea);
    await panel.getByRole("button", { name: "Send to coii-agent" }).click();
    await expect(panel.getByText(SENT, { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Send another" }).click();
  }

  const rows = sql(
    `select kind || '|' || body from private.feature_requests
      where person_id = '${mira.id}' order by created_at`,
  ).split("\n");
  expect(rows).toEqual([`feature|${ideas[0]}`, `design|${ideas[1]}`, `feature|${ideas[2]}`]);

  await panel.getByLabel("Your idea").fill("One idea too many for today");
  await panel.getByRole("button", { name: "Send to coii-agent" }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "You've sent 3 ideas today. Send more tomorrow!",
  );
  expect(
    sqlNumber(`select count(*) from private.feature_requests where person_id = '${mira.id}'`),
  ).toBe(3);
  expect(mira.errors.filter((e) => !e.includes("400"))).toEqual([]);
});
