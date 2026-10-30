import { expect, type Page, test } from "@playwright/test";
import { sortKey } from "../../src/port/sort";
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

/** Starts a game as the role picked in the character picker. */
async function startAs(page: Page, name: string, role: RegExp) {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: role }).click();
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
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
  await startAs(page, `Cols${Date.now() % 100000}`, /Priest/);
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
  await expect(dialog.locator(".menu-item", { has: page.locator(".menu-field", { hasText: /^ascii_map$/ }) })).toContainText("[true]");
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
  await startAs(page, `Arrow${Date.now() % 100000}`, /Valkyrie/);

  // her shield is all she can take off, and without it her AC goes up, which is worse
  await page.keyboard.press("Shift+T");
  const ac = page.locator(".stat", { hasText: "AC" });
  await expect(ac.locator(".stat-change.worse")).toHaveText("↑");
  await page.locator(".stats").screenshot({ path: "test-results/stat-change.png" });
});

test("the inventory shows blessed items green", async ({ page }) => {
  await startAs(page, `Holy${Date.now() % 100000}`, /Priest/);
  // a priest starts with holy water and sees that it's blessed
  await expect(page.locator(".inv-text", { hasText: "holy water" })).toHaveCSS("color", "rgb(60, 176, 67)");
});

test("a count typed before an item's letter in a menu takes only that many", async ({ page }) => {
  await startAs(page, `Count${Date.now() % 100000}`, /Priest/);
  const water = page.locator(".inv-item", { hasText: "holy water" });
  await expect(water).toContainText("4 potions");
  const letter = (await water.locator(".inv-letter").innerText()).trim();

  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  await page.keyboard.type(`2${letter}`);
  await expect(dialog.locator(".menu-item.selected")).toContainText("2 of");
  await page.keyboard.press("Enter");
  await expect(water).toContainText("2 potions");
});

test("a count typed ahead of the menu it is for still takes only that many", async ({ page }) => {
  await startAs(page, `Ahead${Date.now() % 100000}`, /Priest/);
  const water = page.locator(".inv-item", { hasText: "holy water" });
  const letter = (await water.locator(".inv-letter").innerText()).trim();
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  const all = (await dialog.locator(".menu-item", { hasText: /all types/i }).locator(".inv-letter").innerText()).trim();
  // the second menu opens only after these are typed, and replays them
  await page.keyboard.type(`${all}\n2${letter}\n`);
  await expect(water).toContainText("2 potions");
});

test("a count too big for the core stops growing, and the game carries on", async ({ page }) => {
  await startAs(page, `Huge${Date.now() % 100000}`, /Priest/);
  const water = page.locator(".inv-item", { hasText: "holy water" });
  const letter = (await water.locator(".inv-letter").innerText()).trim();
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  await page.keyboard.type("3000000000");
  await expect(dialog.locator(".hint")).toHaveText("Count: 300000000");
  await page.keyboard.type(`${letter}\n`);
  // more than there are is all of them
  await expect(water).toBeHidden();
  await expect(page.locator(".messages")).toContainText(/You drop 4 potions/);
});

test("a command's menu of suitable items still takes any item's letter", async ({ page }) => {
  await startAs(page, `Unlisted${Date.now() % 100000}`, /Priest/);
  const mace = (await page.locator(".inv-item", { hasText: "mace" }).locator(".inv-letter").innerText()).trim();
  await page.keyboard.press("q");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/drink/i);
  await expect(dialog).toContainText("holy water");
  await expect(dialog).not.toContainText("mace");
  await page.keyboard.press(mace);
  await expect(dialog).toBeHidden();
  await expect(page.locator(".messages")).toContainText(/silly thing to drink/);
});

test("in a menu of several picks, . or , picks everything, - or \\ nothing, and Select All everything", async ({ page }) => {
  await startAs(page, `All${Date.now() % 100000}`, /Priest/);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  const items = dialog.locator(".menu-item");
  const picked = dialog.locator(".menu-item.selected");
  const all = await items.count();
  expect(all).toBeGreaterThan(3);

  await page.keyboard.type("5.");
  await expect(picked).toHaveCount(all);
  // the count was for one item
  await expect(dialog.locator(".hint")).toBeHidden();
  await page.keyboard.press("-");
  await expect(picked).toHaveCount(0);
  await page.keyboard.press(",");
  await expect(picked).toHaveCount(all);
  await page.keyboard.press("\\");
  await expect(picked).toHaveCount(0);
  await dialog.getByRole("button", { name: "Select All" }).click();
  await expect(picked).toHaveCount(all);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Sort A–Z sorts a menu's items under each heading by name, and unticking restores the order", async ({ page }) => {
  // her spear comes before her dagger
  await startAs(page, `Sort${Date.now() % 100000}`, /Valkyrie/);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("dagger");
  // a heading as "# name", an item as its text
  const rows = () =>
    dialog.locator(".menu-items > *").evaluateAll((els) =>
      els.map((el) => (el.classList.contains("menu-heading") ? `# ${el.textContent}` : el.querySelector(".menu-text")!.textContent!)),
    );
  const before = await rows();

  await dialog.getByLabel("Sort A–Z").check();
  const after = await rows();
  // the same rows, headings where they were, and the items between them in order of name
  expect([...after].sort()).toEqual([...before].sort());
  expect(after.findIndex((r) => r.includes("dagger"))).toBeLessThan(after.findIndex((r) => r.includes("spear")));
  after.forEach((row, i) => row.startsWith("# ") && expect(before[i]).toBe(row));
  for (let i = 1; i < after.length; i++) {
    if (after[i].startsWith("# ") || after[i - 1].startsWith("# ")) continue;
    expect(sortKey(after[i - 1]).localeCompare(sortKey(after[i]), undefined, { sensitivity: "base" })).toBeLessThanOrEqual(0);
  }

  await dialog.getByLabel("Sort A–Z").uncheck();
  expect(await rows()).toEqual(before);
  await page.keyboard.press("Escape");
});

test("a short question from the game shows a button for each answer", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`Ask${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("dialog", { name: "Choose your character" }).getByRole("button", { name: "Play" }).click();
  // the tutorial offer, after the intro, is a menu of a few short answers
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Go bravely/i, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toContainText(/tutorial/i);
  await expect(dialog.locator(".answers .answer")).toHaveCount(2);
  await dialog.screenshot({ path: "test-results/question.png" });
  await dialog.getByRole("button", { name: /just start play/i }).click();
  await untilPlaying(page);
  await expect(page.locator(".stats-title")).toBeVisible();
});

test("a read-only list is text that can be selected and copied", async ({ page }) => {
  await startGame(page, `Copy${Date.now() % 100000}`);
  // ^X lists attributes in a read-only menu
  await page.keyboard.press("Control+x");
  const dialog = page.getByRole("dialog");
  const list = dialog.locator(".menu-items");
  await expect(list).toContainText(/You are/);

  const key = (key: string) =>
    page.evaluate((key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, cancelable: true })), key);
  // Ctrl-A selects the list; Ctrl-C copies it, and nothing else reaches the browser
  expect(await key("a")).toBe(false);
  expect(await page.evaluate(() => getSelection()!.toString())).toMatch(/You are/i);
  expect(await key("c")).toBe(true);
  expect(await key("r")).toBe(false);

  const copied = await list.evaluate((el) => {
    const data = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  });
  // the core's text as it is, not as styled, one line to a row
  expect(copied).toMatch(/^ *You are/m);
  expect(copied).toMatch(/^[^\n]*[a-z][^\n]*:$/m);

  await page.keyboard.press("PageDown");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("arrow keys highlight a menu's rows, and Return or space picks the highlighted one", async ({ page }) => {
  await startAs(page, `Lit${Date.now() % 100000}`, /Priest/);
  const dialog = page.getByRole("dialog");

  // a menu of several picks: space toggles the highlighted row
  await page.keyboard.press("Shift+D");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const second = dialog.locator(".menu-item").nth(1);
  await expect(second).toHaveClass(/highlighted/);
  await page.keyboard.press(" ");
  await expect(second).toHaveClass(/selected/);
  await expect(dialog.locator(".menu-item.selected")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // a menu of one pick: the mouse highlights a row until it leaves the list
  await page.keyboard.press("q");
  await expect(dialog).toContainText(/drink/i);
  const row = dialog.locator(".menu-item").first();
  await row.hover();
  await expect(row).toHaveClass(/highlighted/);
  await dialog.locator(".dialog-title").hover();
  await expect(dialog.locator(".menu-item.highlighted")).toHaveCount(0);
  // and Return picks the row the arrow keys are on
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator(".menu-item").first()).toHaveClass(/highlighted/);
  await expect(dialog.locator(".menu-item").first()).toContainText("holy water");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".inv-item", { hasText: "holy water" })).toContainText("3 potions");
});

test("a direction prompt shows buttons for each way, beside the hero", async ({ page }) => {
  await startGame(page, `Way${Date.now() % 100000}`);
  await page.keyboard.press("Control+d");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/in what direction/i);
  await expect(dialog.locator(".direction-grid .direction")).toHaveCount(9);
  await expect(dialog.getByRole("button", { name: /Self/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Up/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Down/ })).toBeVisible();

  // beside the hero, past the squares next to them
  const [x, y] = (await page.locator(".map canvas").getAttribute("data-cursor"))!.split(",").map(Number);
  const map = (await page.locator(".map canvas").boundingBox())!;
  const cell = map.width / 80;
  const hero = { left: map.x + x * cell, top: map.y + y * cell };
  const box = (await dialog.boundingBox())!;
  const right = Math.abs(box.x - (hero.left + 2 * cell + 8));
  const left = Math.abs(box.x + box.width - (hero.left - cell - 8));
  expect(Math.min(right, left)).toBeLessThan(2);
  await page.screenshot({ path: "test-results/direction.png" });

  await dialog.getByRole("button", { name: "→" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".messages")).toContainText(/In what direction\? l/);
});
