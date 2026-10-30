import { expect, type Page, test } from "@playwright/test";
import { clipAround } from "../../src/ui/scroll";

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

test("right-clicking the map offers a look and a wiki search", async ({ page, context }) => {
  await startGame(page, `Ctx${Date.now() % 100000}`);
  const view = (await page.locator(".map").boundingBox())!;
  const middle = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const menu = page.getByRole("menu");

  await page.mouse.click(middle.x, middle.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.mouse.click(middle.x, middle.y, { button: "right" });
  const search = menu.getByRole("menuitem", { name: /Search the NetHack Wiki for ‘.+’/ });
  await expect(search).toBeVisible();
  await page.screenshot({ path: "test-results/context-menu.png" });
  await context.route("https://nethackwiki.com/**", (route) => route.fulfill({ body: "wiki" }));
  const [wiki] = await Promise.all([page.waitForEvent("popup"), search.click()]);
  expect(wiki.url()).toMatch(/^https:\/\/nethackwiki\.com\/mediawiki\/index\.php\?search=\S+/);
  await wiki.close();
  await expect(menu).toBeHidden();

  const before = await page.locator(".message").count();
  await page.mouse.click(middle.x, middle.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Look here" }).click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.locator(".message").count()).toBeGreaterThan(before);
});

test("a right-click near the window's corner keeps the menu on screen", async ({ page }) => {
  await startGame(page, `Edge${Date.now() % 100000}`);
  // zoomed in, the map fills the pane to the window's bottom edge
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".map canvas")).toHaveAttribute("width", String(80 * 64));
  // a zoom's scroll closes a menu, so let it land first
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const view = (await page.locator(".map").boundingBox())!;
  // left of the map's buttons and above any scrollbar, but closer to the edges than the menu is big
  const buttons = (await page.locator(".map-zoom").boundingBox())!;
  await page.mouse.click(buttons.x - 40, view.y + view.height - 20, { button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Search the NetHack Wiki/ })).toBeVisible();
  const box = (await menu.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
});

test("ASCII mode draws the map as text and is kept across a reload", async ({ page }) => {
  const name = `Ascii${Date.now() % 100000}`;
  await startGame(page, name);
  const canvas = page.locator(".map canvas");
  const tiled = Number(await canvas.getAttribute("width"));
  const toggle = page.getByRole("button", { name: "ASCII" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // text cells are narrower than tiles
  await expect.poll(async () => Number(await canvas.getAttribute("width"))).toBeLessThan(tiled);
  await page.screenshot({ path: "test-results/ascii.png" });
  const ascii = await canvas.getAttribute("width");

  await page.reload();
  await page.getByLabel("Who are you?").fill(`${name}b`);
  await page.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
  await expect(page.getByRole("button", { name: "ASCII" })).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("width", ascii!);
  // the core was started with ascii_map too
  await page.keyboard.press("#");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("optionsfull");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".menu-item", { hasText: /^ascii_map/ })).toContainText("[true]");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "ASCII" }).click();
  await expect(canvas).toHaveAttribute("width", String(tiled));
});

test("keyboard shortcuts and a pinch zoom the map, and Cmd-0 goes back", async ({ page }) => {
  await startGame(page, `Pinch${Date.now() % 100000}`);
  const canvas = page.locator(".map canvas");
  const width = async () => Number(await canvas.getAttribute("width"));
  const start = await width();

  await page.keyboard.press("Control+=");
  await expect.poll(width).toBe(start * 1.5);
  await page.keyboard.press("Meta+=");
  await expect.poll(width).toBe(start * 2);
  await page.keyboard.press("Control+0");
  await expect.poll(width).toBe(start);
  await page.keyboard.press("Meta+-");
  await expect.poll(width).toBeLessThan(start);
  await page.keyboard.press("Meta+0");
  await expect.poll(width).toBe(start);

  // the page doesn't zoom as well: the events are cancelled
  const pinch = (type: string, init: object) =>
    page.locator(".map").evaluate(
      (el, [type, init]) => {
        const event = type === "wheel" ? new WheelEvent("wheel", { ...init, bubbles: true, cancelable: true }) : Object.assign(new Event(type, { bubbles: true, cancelable: true }), init);
        return el.dispatchEvent(event);
      },
      [type, init] as const,
    );
  for (let i = 0; i < 4; i++) expect(await pinch("wheel", { deltaY: -5, ctrlKey: true })).toBe(false);
  await expect.poll(width).toBe(start * 1.5);
  for (let i = 0; i < 4; i++) await pinch("wheel", { deltaY: 5, ctrlKey: true });
  await expect.poll(width).toBe(start);
  // Safari's pinch
  expect(await pinch("gesturestart", { scale: 1 })).toBe(false);
  expect(await pinch("gesturechange", { scale: 1.2 })).toBe(false);
  await expect.poll(width).toBe(start * 1.5);
});

test("zoom keys work with a dialog open", async ({ page }) => {
  await startGame(page, `DlgZoom${Date.now() % 100000}`);
  const canvas = page.locator(".map canvas");
  const start = Number(await canvas.getAttribute("width"));
  await page.keyboard.press("Control+x");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Control+=");
  await expect(canvas).toHaveAttribute("width", String(start * 1.5));
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

const settle = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * Zooms with `key` from `from`px squares to `to`px and checks the view ends where Cocoa's would:
 * the middle kept as far as the new map size allows, then scrolled as little as shows the hero.
 */
async function expectZoomKeepsView(page: Page, key: string, from: number, to: number) {
  const map = page.locator(".map");
  const canvas = map.locator("canvas");
  const view = await map.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }));
  const [x, y] = (await canvas.getAttribute("data-cursor"))!.split(",").map(Number);
  await page.keyboard.press(key);
  await expect(canvas).toHaveAttribute("width", String(80 * to));
  await settle(page);

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const maxLeft = Math.max(0, 80 * to - view.width);
  const maxTop = Math.max(0, 21 * to - view.height);
  let left = clamp(((view.left + view.width / 2) / from) * to - view.width / 2, maxLeft);
  let top = clamp(((view.top + view.height / 2) / from) * to - view.height / 2, maxTop);
  const expected = {
    get scrollLeft() { return left; },
    set scrollLeft(v) { left = clamp(v, maxLeft); },
    get scrollTop() { return top; },
    set scrollTop(v) { top = clamp(v, maxTop); },
    clientWidth: view.width,
    clientHeight: view.height,
  };
  clipAround(expected, x, y, to, to);
  const actual = await map.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(Math.abs(actual.left - left)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.top - top)).toBeLessThanOrEqual(1);
}

test("zooming in keeps the middle of the view, then the hero, in view", async ({ page }) => {
  await startGame(page, `Mid${Date.now() % 100000}`);
  await expectZoomKeepsView(page, "Control+=", 32, 48);
});

test("zooming out from the far corner keeps the middle from before the browser clamps it", async ({ page }) => {
  await startGame(page, `Corner${Date.now() % 100000}`);
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  await expect(page.locator(".map canvas")).toHaveAttribute("width", String(80 * 64));
  await settle(page);
  await page.locator(".map").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = el.scrollHeight;
  });
  await settle(page);
  await expectZoomKeepsView(page, "Control+-", 64, 48);
});

test("a stat that changes shows an arrow beside it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`Arrow${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: /Valkyrie/ }).click();
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);

  // her shield is all she can take off, and without it her AC goes up, which is worse
  await page.keyboard.press("Shift+T");
  const ac = page.locator(".stat", { hasText: "AC" });
  await expect(ac.locator(".stat-change.worse")).toHaveText("↑");
  await page.locator(".stats").screenshot({ path: "test-results/stat-change.png" });
});

test("the inventory shows blessed items green", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`Holy${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: /Priest/ }).click();
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
  // a priest starts with holy water and sees that it's blessed
  await expect(page.locator(".inv-text", { hasText: "holy water" })).toHaveCSS("color", "rgb(60, 176, 67)");
});
