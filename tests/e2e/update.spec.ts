import { expect, test, type Page } from "@playwright/test";

const SITE = "http://127.0.0.1:5197/";

// the reload these tests wait for can land in the middle of a look, which then just looks again
const cacheNames = (page: Page) => page.evaluate(() => caches.keys()).catch(() => null);
const waiting = (page: Page) => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.waiting)).catch(() => null);

test("a new version waits out a game in progress, then the landing page moves to it", async ({ page, context }) => {
  await page.goto(SITE);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const [oldCache] = (await cacheNames(page))!;

  await page.getByLabel("Who are you?").fill(`Upd${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await expect(picker).toBeVisible({ timeout: 15_000 });

  await page.request.get(`${SITE}__next-version`);
  // a refresh finds the new version, but the game stays on the one it started with
  await page.reload();
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => waiting(page), { timeout: 15_000 }).toBe(true);
  expect(await cacheNames(page)).toContain(oldCache);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const landing = await context.newPage();
  await landing.goto(SITE);
  await landing.waitForTimeout(4000);
  expect(await waiting(landing)).toBe(true);
  expect(await cacheNames(landing)).toContain(oldCache);

  await page.close();
  await expect.poll(async () => (await cacheNames(landing))?.includes(oldCache) ?? true, { timeout: 15_000 }).toBe(false);
  await expect.poll(() => waiting(landing)).toBe(false);
  await expect(landing.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
});

test("the landing page holds off while something is being typed", async ({ page }) => {
  await page.goto(SITE);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const name = page.getByLabel("Who are you?");
  await name.fill("Typing");

  await page.request.get(`${SITE}__next-version`);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect.poll(() => waiting(page), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(4000);
  await expect(name).toHaveValue("Typing");

  await name.fill("");
  await expect.poll(() => waiting(page), { timeout: 15_000 }).toBe(false);
});

test("a tab open since the first install moves to a new version too", async ({ page }) => {
  await page.goto(SITE);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => ((window as unknown as { mark: boolean }).mark = true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.request.get(`${SITE}__next-version`);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { mark?: boolean }).mark).catch(() => true), { timeout: 15_000 }).toBe(false);
});

test("a landing tab being typed in isn't reloaded when another moves to a new version", async ({ page, context }) => {
  await page.goto(SITE);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const [oldCache] = (await cacheNames(page))!;
  const other = await context.newPage();
  await other.goto(SITE);
  const name = other.getByLabel("Who are you?");
  await name.fill("Typing");

  await page.request.get(`${SITE}__next-version`);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect.poll(async () => (await cacheNames(page))?.includes(oldCache) ?? true, { timeout: 15_000 }).toBe(false);
  await other.waitForTimeout(4000);
  await expect(name).toHaveValue("Typing");
});

test("a second game tab, and one still at its start, hold off a new version", async ({ page, context }) => {
  await page.goto(SITE);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByLabel("Who are you?").fill(`Two${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("dialog", { name: "Choose your character" })).toBeVisible({ timeout: 15_000 });
  const second = await context.newPage();
  await second.goto(`${SITE}play/`);
  await expect(second.locator(".dialog").first()).toBeVisible({ timeout: 15_000 });
  await page.close();

  await second.request.get(`${SITE}__next-version`);
  await second.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect.poll(() => waiting(second), { timeout: 15_000 }).toBe(true);
  const landing = await context.newPage();
  await landing.goto(SITE);
  await landing.waitForTimeout(4000);
  expect(await waiting(landing)).toBe(true);

  await second.close();
  await expect.poll(() => waiting(landing), { timeout: 15_000 }).toBe(false);
});
