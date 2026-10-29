import { expect, test } from "@playwright/test";

const PROD = "http://127.0.0.1:5198/";

test("the production build plays offline after one visit", async ({ page, context }) => {
  await page.goto(PROD);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // the first load isn't controlled yet; one reload puts the page under the worker
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Who are you?").fill(`Off${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("dialog", { name: "Choose your character" })).toBeVisible({ timeout: 15_000 });
});
