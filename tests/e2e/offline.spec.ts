import { expect, test } from "@playwright/test";

const PROD = "http://127.0.0.1:5198/";

test("the production build plays offline after one visit", async ({ page, context }) => {
  const firebase: string[] = [];
  page.on("request", (r) => {
    if (/googleapis|firebase/.test(new URL(r.url()).hostname)) firebase.push(r.url());
  });
  await page.goto(PROD);
  await expect(page.getByRole("button", { name: /^Play Online/ })).toHaveCount(0);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  // the first load isn't controlled yet; one reload puts the page under the worker
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".landing-shot")).toHaveJSProperty("naturalWidth", 1280);
  await page.getByLabel("Who are you?").fill(`Off${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play Offline" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await expect(picker).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(picker).toBeVisible({ timeout: 15_000 });

  expect(firebase).toEqual([]);
  await page.goto(`${PROD}nowhere`);
  await expect(page.getByText("Ready to play offline")).toBeVisible();
});

test("a production build offers online games only when the address asks", async ({ page }) => {
  await page.goto(`${PROD}?online`);
  await expect(page.getByRole("button", { name: /^Play Online/ })).toBeVisible();
  await page.goto(PROD);
  await expect(page.getByRole("button", { name: /^Play Offline/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play Online/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Play online" })).toHaveCount(0);
});
