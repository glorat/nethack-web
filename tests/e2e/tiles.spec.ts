import { expect, type Locator, type Page, test } from "@playwright/test";

/** Answers the character-creation prompts until the map is showing. */
async function startGame(page: Page, name: string) {
  await page.goto("/offline/");
  const play = page.getByRole("button", { name: /^(Play|Continue) Offline/ });
  await play.waitFor();
  const change = page.getByRole("button", { name: "Change Name" });
  if (await change.isVisible()) await change.click();
  await page.getByLabel("Who are you?").fill(name);
  await play.click();
  await untilPlaying(page);
}

/** Chooses the role, and the first of what's allowed for the rest, over the picker's random default. */
async function pickCharacter(picker: Locator, role: RegExp) {
  await picker.getByRole("listbox", { name: "Race" }).getByRole("option", { name: "human" }).click();
  await picker.getByRole("listbox", { name: "Role" }).getByRole("option", { name: role }).click();
  await picker.getByRole("listbox", { name: "Race" }).locator("button:not([disabled])").first().click();
  for (const name of ["Gender", "Alignment"]) await picker.getByRole("radiogroup", { name }).locator("button:not([disabled])").first().click();
}

/** Answers whatever the game asks, choosing a character in the picker, until the core waits for a command. */
async function untilPlaying(page: Page) {
  const dialog = page.getByRole("dialog");
  const playing = page.locator(".app[data-commanding]");
  for (;;) {
    await dialog.or(playing).first().waitFor();
    if (!(await dialog.isVisible())) return;
    const shown = await dialog.innerText();
    const text = shown.toLowerCase();
    if (text.includes("choose your character")) {
      await pickCharacter(dialog, /Valkyrie/);
      await dialog.getByRole("button", { name: "Play" }).click();
    }
    else if (text.includes("shall i pick") || text.includes("is this ok")) await page.keyboard.press("y");
    else if (text.includes("tutorial")) await dialog.getByRole("button", { name: /just start play/i }).click();
    else if (await dialog.getByRole("button", { name: "OK", exact: true }).isVisible()) await dialog.getByRole("button", { name: "OK", exact: true }).click();
    else await page.keyboard.press("Escape");
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
}

const mapCellRatio = (page: Page) =>
  page.locator(".map canvas").evaluate((canvas) => canvas.height / 21 / (canvas.width / 80));

test("the View menu switches to rectangular Geoduck tiles and back", async ({ page }) => {
  await startGame(page, `Tiles${Date.now() % 100000}`);
  const icon = page.locator(".inv-icon").first();
  const bar = page.getByRole("menubar");
  const view = page.getByRole("menu", { name: "View" });
  const openView = () => bar.getByRole("menuitem", { name: "View" }).click();

  await openView();
  await expect(view.getByRole("menuitemcheckbox", { name: /Geoduck Tiles/ })).toHaveAttribute("aria-checked", "false");

  await view.getByRole("menuitemcheckbox", { name: /Geoduck Tiles/ }).click();
  await expect(icon).toHaveCSS("background-image", /geoduck15x25\.bmp/);
  // Geoduck's 15x25 cells fill the map without being squashed into squares.
  await expect.poll(() => mapCellRatio(page)).toBeGreaterThan(1.55);
  await expect.poll(() => mapCellRatio(page)).toBeLessThan(1.78);
  await page.screenshot({ path: "test-results/geoduck-tiles.png" });

  await openView();
  await view.getByRole("menuitemcheckbox", { name: /Painted Tiles/ }).click();
  await expect(icon).toHaveCSS("background-image", /tiles64\.png/);
  await expect.poll(() => mapCellRatio(page)).toBeCloseTo(1, 3);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Geoduck's tall tiles keep their shape", async ({ page }) => {
    await startGame(page, `Phone${Date.now() % 100000}`);
    await page.getByRole("menubar").getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menu", { name: "View" }).getByRole("menuitemcheckbox", { name: /Geoduck Tiles/ }).click();
    await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /geoduck15x25\.bmp/);
    await expect.poll(() => mapCellRatio(page)).toBeGreaterThan(1.55);
    await page.screenshot({ path: "test-results/geoduck-phone.png" });
  });
});
