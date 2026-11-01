import { expect, test } from "@playwright/test";

const PROD = "http://127.0.0.1:5198/";

test("the game starts when the server's client can't load", async ({ browser }) => {
  // a request the service worker makes wouldn't reach the route
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/\/assets\/firebase-[^/]*\.js$/, (route) => route.abort());
  await page.goto(PROD);
  await page.getByLabel("Who are you?").fill(`Blocked${Date.now() % 100000}`);
  const blocked = page.waitForEvent("requestfailed", (r) => /\/assets\/firebase-/.test(r.url()));
  await page.getByRole("button", { name: "Play" }).click();
  await blocked;
  await expect(page.getByRole("dialog", { name: "Choose your character" })).toBeVisible({ timeout: 15_000 });
  await context.close();
});

test("the production build plays offline after one visit", async ({ page, context }) => {
  await page.goto(PROD);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  // the first load isn't controlled yet; one reload puts the page under the worker
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".landing-shot")).toHaveJSProperty("naturalWidth", 1280);
  await page.getByLabel("Who are you?").fill(`Off${Date.now() % 100000}`);
  const serverClient = page.waitForResponse(/\/assets\/firebase-[^/]*\.js$/);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  expect((await serverClient).ok()).toBe(true);

  await page.reload();
  await expect(picker).toBeVisible({ timeout: 15_000 });

  await page.goto(`${PROD}nowhere`);
  await expect(page.getByText("Ready to play offline")).toBeVisible();
});
