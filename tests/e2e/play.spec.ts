import { expect, type Page, test } from "@playwright/test";

/** Answers the character-creation prompts until the map is showing. */
async function startGame(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
}

/** Answers whatever the game asks, the picker taking its defaults, until play has settled. */
async function untilPlaying(page: Page) {
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
      if (text.includes("choose your character")) await page.keyboard.press("Enter");
      else if (text.includes("shall i pick") || text.includes("is this ok")) await page.keyboard.press("y");
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

  // the restore deleted the save, so another reload finds only the game in progress
  await page.reload();
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("dialog")).toContainText(/old game in progress/i, { timeout: 15_000 });
});

test("a game in progress can be recovered after a reload", async ({ page }) => {
  const name = `Rec${Date.now() % 100000}`;
  await startGame(page, name);
  const title = await page.locator(".stats-title").innerText();
  await page.keyboard.press("l");
  await page.waitForTimeout(500);

  await page.reload();
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/old game in progress/i, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "Recover" }).click();
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

test("an inventory click inside a prompt is ignored", async ({ page }) => {
  await startGame(page, `Pos${Date.now() % 100000}`);
  // _ travels, and its position picker reads keys like a command would
  await page.keyboard.press("_");
  // the first position picker of a game opens with a tip
  await expect(page.getByRole("dialog")).toContainText(/tip/i);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".messages")).toContainText(/where do you want to travel/i);
  await page.locator(".inv-item").first().click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".messages")).not.toContainText(/unknown direction/i);

  await page.keyboard.press("Escape");
  await page.locator(".inv-item").first().click();
  await expect(page.getByRole("dialog")).toContainText(/Do what with/i);
});

test("arrow keys answer a direction prompt", async ({ page }) => {
  await startGame(page, `Dir${Date.now() % 100000}`);
  await page.keyboard.press("Control+d");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/in what direction/i);
  await page.keyboard.press("ArrowLeft");
  await expect(dialog).toBeHidden();
});

test("the character picker starts the chosen role", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`Pick${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: "Wizard" }).click();
  await picker.getByRole("option", { name: "elf" }).click();
  // elves are only chaotic
  await expect(picker.getByRole("radio", { name: "Lawful" })).toBeDisabled();
  await expect(picker.getByRole("radio", { name: "Chaotic" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/picker.png" });
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);

  await expect(page.locator(".messages")).toContainText(/chaotic (male|female) elven Wizard/, { timeout: 15_000 });
});

test("hovering over the map describes the square", async ({ page }) => {
  await startGame(page, `Look${Date.now() % 100000}`);
  // the map scrolls to keep the hero in view, so aim at the middle of what's showing
  const view = (await page.locator(".map").boundingBox())!;
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await expect(page.getByRole("tooltip")).toHaveText(/\w/);
  await page.mouse.move(view.x + view.width / 2 + 100, view.y + view.height / 2);
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("zooming the map is kept across a reload", async ({ page }) => {
  const name = `Zoom${Date.now() % 100000}`;
  await startGame(page, name);
  const canvas = page.locator(".map canvas");
  const width = Number(await canvas.getAttribute("width"));
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("width"))).toBeGreaterThan(width);
  const zoomed = await canvas.getAttribute("width");

  await page.reload();
  await page.getByLabel("Who are you?").fill(`${name}b`);
  await page.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
  await expect(canvas).toHaveAttribute("width", zoomed!);
});

test("keys typed into an open window stay there", async ({ page }) => {
  await startGame(page, `Keys${Date.now() % 100000}`);
  const turn = async () => page.locator(".stat", { hasText: "T" }).last().innerText();
  const before = await turn();
  const dialog = page.getByRole("dialog");

  // ^X lists attributes in a read-only menu
  await page.keyboard.press("Control+x");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("s");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // space closes a text window without reaching the game, where it would be an unknown command
  await page.keyboard.press("#");
  await page.keyboard.type("history");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press(" ");
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator(".messages")).not.toContainText(/unknown command/i);
  expect(await turn()).toBe(before);
});

test("a menu's column headings line up with the columns", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`Cols${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: /Priest/ }).click();
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
  await page.keyboard.press("Shift+Z");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Retention/);
  await dialog.screenshot({ path: "test-results/spell-menu.png" });
  const heads = dialog.locator(".menu-heading.columns .menu-field");
  const cells = dialog.locator(".menu-item").first().locator(".menu-field");
  expect(await heads.count()).toBeGreaterThan(2);
  for (let i = 0; i < (await heads.count()); i++) {
    const [head, cell] = [await heads.nth(i).boundingBox(), await cells.nth(i).boundingBox()];
    expect(Math.abs(head!.x - cell!.x)).toBeLessThan(1);
  }
});
