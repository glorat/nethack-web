import { expect, type Page, test } from "@playwright/test";

/** Answers the character-creation prompts until the map is showing. */
async function startGame(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();

  let quiet = 0;
  for (let i = 0; i < 40; i++) {
    const dialog = page.getByRole("dialog");
    // the intro text can arrive just after the map, so wait for a settled screen
    if ((await page.locator(".stats-title").isVisible()) && !(await dialog.isVisible())) {
      if (++quiet >= 3) return;
    } else {
      quiet = 0;
    }
    if (await dialog.isVisible()) {
      const text = (await dialog.innerText()).toLowerCase();
      if (text.includes("shall i pick") || text.includes("is this ok")) await page.keyboard.press("y");
      else if (text.includes("tutorial")) await dialog.getByRole("button", { name: /just start play/i }).click();
      else if (await dialog.getByRole("button", { name: "OK" }).isVisible()) await dialog.getByRole("button", { name: "OK" }).click();
      else await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(300);
  }
}

test("start a game, move, and see status and inventory", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await startGame(page, `E2E${Date.now() % 100000}`);

  await expect(page.locator(".stats-title")).toBeVisible();
  await expect(page.locator(".meter.hp .meter-text")).toHaveText(/\d+\(\d+\)/);
  await expect(page.locator(".inv-item").first()).toBeVisible();
  await expect(page.locator(".equip-slot:not([disabled])").first()).toBeVisible();

  for (const key of ["l", "l", "j", "h", "k"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: "test-results/play.png" });
  expect(errors).toEqual([]);
});

test("a saved game survives a reload", async ({ page }) => {
  const name = `Save${Date.now() % 100000}`;
  await startGame(page, name);
  const title = await page.locator(".stats-title").innerText();

  await page.keyboard.press("S");
  await expect(page.getByRole("dialog")).toContainText(/Really save\?/);
  await page.keyboard.press("y");
  await expect(page.getByRole("button", { name: "New game" })).toBeVisible();

  await page.reload();
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
  await expect(page.locator(".stats-title")).toHaveText(title);
});

test("inventory click opens the item's action menu", async ({ page }) => {
  await startGame(page, `Inv${Date.now() % 100000}`);
  await page.locator(".inv-item").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Do what with/i);
  await page.screenshot({ path: "test-results/item-actions.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
