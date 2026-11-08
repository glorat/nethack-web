import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { sortKey } from "../../src/port/sort";
import { clipAround } from "../../src/ui/scroll";
import { TOOLTIP_DELAY } from "../../src/ui/tooltip";
import { Session } from "../headless/harness";

/** Answers the character-creation prompts until the map is showing. */
async function startGame(page: Page, name: string) {
  await enterGame(page, name);
  await untilPlaying(page);
}

/** Goes through the landing page as this character, whatever name it remembers. */
async function enterGame(page: Page, name: string) {
  await page.goto("/offline/");
  const play = page.getByRole("button", { name: /^(Play|Continue) Offline/ });
  await play.waitFor();
  const change = page.getByRole("button", { name: "Change Name" });
  if (await change.isVisible()) await change.click();
  await page.getByLabel("Who are you?").fill(name);
  await play.click();
}

/** Chooses the role, and the first of what's allowed for the rest, over the picker's random default. */
async function pickCharacter(picker: Locator, role: RegExp) {
  // a human can be any role, and roles the race can\'t play are disabled
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
      await page.keyboard.press("Enter");
    }
    else if (text.includes("shall i pick") || text.includes("is this ok")) await page.keyboard.press("y");
    else if (text.includes("tutorial")) await dialog.getByRole("button", { name: /just start play/i }).click();
    else if (await dialog.getByRole("button", { name: "OK", exact: true }).isVisible()) await dialog.getByRole("button", { name: "OK", exact: true }).click();
    else await page.keyboard.press("Escape");
    // the next dialog can reuse this one's element, so wait on what it shows
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
}

/** The stat in the status panel with this label. */
const stat = (page: Page, label: string) =>
  page.locator(".stat").filter({ has: page.locator(".stat-label").getByText(label, { exact: true }) });

/** Every key so far has been dealt with: keys typed ahead go to the core before it asks for another command. */
const untilCommand = (page: Page) => page.locator(".app[data-commanding]").waitFor({ state: "attached" });

/** Answers what the core asks on the way out of a game that's being quit, until the game over dialog is up. */
async function untilGameOver(page: Page) {
  const dialog = page.getByRole("dialog");
  for (;;) {
    await dialog.first().waitFor();
    if (await page.getByRole("dialog", { name: "The game is over" }).isVisible()) return;
    const shown = await dialog.innerText();
    // the y for this can be typed ahead of it, and Escape would take back the quit
    if (!/really quit/i.test(shown)) await page.keyboard.press("Escape");
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
}

/** The game's recording as it's kept: what a reload would find. */
const recording = (page: Page, name: string) =>
  page.evaluate(
    (key) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("/save");
        open.onerror = reject;
        open.onsuccess = () => {
          const get = open.result.transaction("FILE_DATA").objectStore("FILE_DATA").get(key);
          get.onsuccess = () => resolve(get.result ? new TextDecoder().decode(get.result.contents) : "");
        };
      }),
    `/save/replay/0${name}/000001`,
  );

/** Starts a game as the role picked in the character picker. */
async function startAs(page: Page, name: string, role: RegExp) {
  await enterGame(page, name);
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await pickCharacter(picker, role);
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);
}

test("the same inputs make the same game, whatever its name", async ({ browser }) => {
  const turns = async (name: string) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await startGame(page, name);
    // m: a plain search won't pass time beside a monster
    for (let i = 0; i < 30; i++) await page.keyboard.type("ms");
    await untilCommand(page);
    await expect.poll(async () => (await recording(page, name)).match(/^\d+ k 115\b/gm)?.length).toBe(30);
    const text = await recording(page, name);
    await context.close();
    // past the clock each line was written at
    return text.split("\n").flatMap((l) => l.match(/^\d+ (T .*)$/)?.[1] ?? []);
  };
  const first = await turns("Same");
  expect(first.length).toBeGreaterThan(10);
  expect(await turns("Other")).toEqual(first);
});

test("start a game, move, and see status and inventory", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await startGame(page, `E2E${Date.now() % 100000}`);

  await expect(page.locator(".stats-title")).toBeVisible();
  await expect(page.locator(".meter.hp .meter-text")).toHaveText(/\d+\(\d+\)/);
  await expect(page.locator(".inv-item").first()).toBeVisible();
  await expect(page.locator(".equip-slot:not([disabled])").first()).toBeVisible();
  await expect(page.locator(".equip-slot:not([disabled])").first()).toHaveAttribute("title", /^\([a-zA-Z]\) /);
  await expect(page.locator('.equip-slot[title*="being worn"]')).toHaveCount(0);

  for (const key of ["l", "l", "j", "h", "k"]) {
    await page.keyboard.press(key);
  }
  await page.getByRole("dialog").or(page.locator(".app[data-commanding]")).first().waitFor({ state: "attached" });
  await page.screenshot({ path: "test-results/play.png" });
  expect(errors).toEqual([]);
});

test("Save & Quit goes to the landing page, and Play and a reload both bring the game back", async ({ page }) => {
  const name = `Save${Date.now() % 100000}`;
  await startGame(page, name);
  const title = await page.locator(".stats-title").innerText();

  // Save & Quit doesn't ask again, as in Cocoa
  await page.keyboard.press("S");
  const play = page.getByRole("button", { name: `Continue Offline as ${name}` });
  await expect(play).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/offline/");
  // with a game to continue, the page doesn't make its case again
  await expect(page.locator(".start-sub")).toHaveText("Your games stay in this browser, seen by no one else, and aren't backed up.");

  await play.click();
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
  await expect(page.locator(".stats-title")).toHaveText(title);

  // the restore deleted the save, so a reload replays the game in progress
  await page.reload();
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
  await expect(page.locator(".stats-title")).toHaveText(title);
});

test("the landing page opens without loading the game, and Back returns to it from a game", async ({ page }) => {
  const core: string[] = [];
  page.on("request", (r) => /nethack\.(js|wasm)/.test(r.url()) && core.push(r.url()));
  await page.goto("/offline/");
  await expect(page.getByRole("heading", { name: "Welcome to NetHack!", exact: true })).toBeVisible();
  await expect(page.getByText(/unofficial web port/)).toBeVisible();
  await expect(page.getByRole("img", { name: /A room on the first level/ })).toBeVisible();
  expect(core).toEqual([]);

  for (const asset of ["/favicon.png", "/apple-touch-icon.png", "/social.jpg"]) expect((await page.request.get(asset)).ok()).toBe(true);
  // the root's, which link previews read without running its redirect
  expect(await (await page.request.get("/")).text()).toContain('<meta property="og:image" content="https://nethack.app/social.jpg" />');

  const licence = await page.request.get("/license.txt");
  expect(await licence.text()).toContain("NETHACK GENERAL PUBLIC LICENSE");

  await enterGame(page, `Back${Date.now() % 100000}`);
  await untilPlaying(page);
  expect(new URL(page.url()).pathname).toBe("/offline/play/");
  await page.goBack();
  await expect(page.getByRole("button", { name: /^Continue Offline as Back/ })).toBeVisible();
});

test("the offline home asks nothing of anywhere but this site, before or after a reload, and offers no sign-in", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => new URL(r.url()).host !== "127.0.0.1:5199" && outside.push(r.url()));
  await page.goto("/offline/");
  await page.evaluate(() => localStorage.setItem("nethack-web.name", "Quiet"));
  await page.reload();
  await expect(page.getByRole("button", { name: /^Play Offline as Quiet/ })).toBeVisible();
  await expect(page.locator(".mode-badge")).toHaveText("Offline");
  await expect(page.locator(".landing-bar .account")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Online/ })).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(outside).toEqual([]);
});

test("the site's root opens online the first time, then whichever mode was visited last", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/online\/$/);
  await page.goto("/offline/");
  await page.goto("/");
  await expect(page).toHaveURL(/\/offline\/$/);
  await expect(page.locator(".mode-badge")).toHaveText("Offline");
});

test("Go Offline and Go Online move between the two homes, and Back returns", async ({ page }) => {
  await page.goto("/online/");
  await expect(page.locator(".mode-badge")).toHaveText("Online");
  await expect(page.locator(".start-sub")).toContainText("The real NetHack 5.0");
  await expect(page.locator(".start-sub")).toContainText("public high scores");
  await page.locator(".landing-bar").getByRole("link", { name: "Go Offline" }).click();
  await expect(page).toHaveURL(/\/offline\/$/);
  await expect(page.locator(".start-sub")).toContainText("seen by no one else");
  await page.locator(".landing-bar").getByRole("link", { name: "Go Online" }).click();
  await expect(page).toHaveURL(/\/online\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/offline\/$/);
  // the offline home's own invitation goes there too
  await page.locator(".landing-panel").getByRole("link", { name: "Go Online" }).click();
  await expect(page).toHaveURL(/\/online\/$/);
});

test("an online home that can't reach the server says the games are safe, and offers offline play", async ({ page }) => {
  // no emulators here, so the server can't be reached
  await page.goto("/online/");
  const banner = page.getByRole("alert").filter({ hasText: "Can't reach the server right now" });
  await expect(banner).toContainText("Your games are safe");
  await banner.getByRole("link", { name: "Play Offline Instead" }).click();
  await expect(page).toHaveURL(/\/offline\/$/);
});

test("the game page without a name goes to the landing page", async ({ page }) => {
  await page.goto("/offline/play/");
  await expect(page.getByLabel("Who are you?")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/offline/");
});

test("a browser that won't keep the name still starts the game, from the address", async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "nethack-web.name") throw new Error("blocked");
      setItem.call(this, key, value);
    };
  });
  await enterGame(page, `Addr${Date.now() % 100000}`);
  await untilPlaying(page);
  expect(new URL(page.url()).searchParams.get("name")).toMatch(/^Addr/);
});

test("a game in progress comes back after a reload without asking", async ({ page }) => {
  const name = `Rec${Date.now() % 100000}`;
  await startGame(page, name);
  const title = await page.locator(".stats-title").innerText();
  await page.keyboard.press("l");
  await expect.poll(() => recording(page, name)).toMatch(/^\d+ k 108\b/m);

  await page.reload();
  // replayed, it never left the game it was in, so the core has nothing to welcome it back to
  await expect(page.locator(".messages")).toContainText(/welcome to NetHack/i, { timeout: 15_000 });
  await expect(page.locator(".messages")).not.toContainText(/old game in progress|welcome back/i);
  await expect(page.locator(".stats-title")).toHaveText(title);

  // the player has it from there, and that lasts through another reload
  await page.keyboard.press("l");
  await expect.poll(() => recording(page, name)).toMatch(/^\d+ back \S+Z\n(.*\n)*\d+ k 108\b/m);
  await page.reload();
  await expect(page.locator(".stats-title")).toHaveText(title, { timeout: 15_000 });
  await expect(page.locator(".messages")).not.toContainText(/old game in progress|welcome back/i);
  await expect.poll(async () => (await recording(page, name)).match(/^\d+ back /gm)).toHaveLength(2);
});

test("a game whose replay goes differently is the player's to destroy or continue", async ({ page }) => {
  const name = `Div${Date.now() % 100000}`;
  await startGame(page, name);
  await page.keyboard.press("l");
  await page.keyboard.press("s");
  await expect.poll(() => recording(page, name)).toMatch(/^\d+ k 115\b/m);

  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("/save");
        open.onerror = reject;
        open.onsuccess = () => {
          const store = open.result.transaction("FILE_DATA", "readwrite").objectStore("FILE_DATA");
          const get = store.get(key);
          get.onsuccess = () => {
            const text = new TextDecoder().decode(get.result.contents);
            get.result.contents = new TextEncoder().encode(text.replace(/^(\d+) seed \d+$/m, "$1 k 83"));
            store.put(get.result, key).onsuccess = () => resolve();
          };
        };
      }),
    `/save/replay/0${name}/000001`,
  );

  await page.reload();
  // a move key typed while it loads mustn't answer what it hasn't seen
  await page.keyboard.press("y");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/couldn't be brought back/i, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
});

test("a game playing in another tab is asked about, not taken over", async ({ page, context }) => {
  const name = `Tab${Date.now() % 100000}`;
  await startGame(page, name);
  await page.keyboard.press("s");

  const other = await context.newPage();
  await enterGame(other, name);
  await expect(other.getByRole("dialog")).toContainText(/old game in progress/i, { timeout: 15_000 });
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
  await page.keyboard.press("Escape");
  await untilCommand(page);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".messages")).not.toContainText(/unknown direction/i);

  await page.locator(".inv-item").first().click();
  await expect(page.getByRole("dialog")).toContainText(/Do what with/i);
});

test("arrow keys answer a direction prompt", async ({ page }) => {
  await startGame(page, `Dir${Date.now() % 100000}`);
  await page.keyboard.press("Control+d");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/in what direction/i);
  await page.keyboard.press("ArrowLeft");
  // what kicking west brings, a question about a pet there say, is another matter
  await expect(page.locator(".direction-dialog")).toHaveCount(0);
  await expect(page.locator(".messages")).toContainText(/In what direction\? h/);
});

test("the character picker starts the chosen role", async ({ page }) => {
  await enterGame(page, `Pick${Date.now() % 100000}`);
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.getByRole("option", { name: "human" }).click();
  await picker.getByRole("option", { name: "Wizard" }).click();
  await picker.getByRole("option", { name: "elf" }).click();
  await expect(picker.getByRole("option", { name: "Valkyrie" })).toBeDisabled();
  // elves are only chaotic
  await expect(picker.getByRole("radio", { name: "Lawful" })).toBeDisabled();
  await expect(picker.getByRole("radio", { name: "Chaotic" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/picker.png" });
  await picker.getByRole("button", { name: "Play" }).click();
  await untilPlaying(page);

  await expect(page.locator(".messages")).toContainText(/chaotic (male|female) elven Wizard/, { timeout: 15_000 });
});

test("the map keeps the browser's double-tap zoom, text selection and scroll bounce out of the way of taps", async ({ page }) => {
  await startGame(page, `Tap${Date.now() % 100000}`);
  const style = await page.locator(".map").evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.touchAction, s.userSelect, s.overscrollBehavior];
  });
  expect(style).toEqual(["manipulation", "none", "none"]);
});

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });

  test("buttons and menu rows are big enough to tap", async ({ page }) => {
    await startGame(page, `Finger${Date.now() % 100000}`);
    const height = async (l: Locator) => (await l.boundingBox())!.height;
    expect(await height(page.getByRole("menubar").getByRole("menuitem", { name: "Act" }))).toBeGreaterThanOrEqual(44);
    expect(await height(page.locator(".inv-item").first())).toBeGreaterThanOrEqual(44);
    // the equipment grid is drawn to fit the top bar
    expect(await height(page.locator(".equip-slot").first())).toBe(32);
    await page.keyboard.press("i");
    expect(await height(page.getByRole("dialog").locator(".menu-item").first())).toBeGreaterThanOrEqual(44);
  });
});

test("the map copies painted tiles at its square size, rather than shrinking each from the full sheet", async ({ page }) => {
  await page.addInitScript(() => {
    const draws = { fromSheet: 0, all: 0 };
    (window as unknown as { mapDraws: typeof draws }).mapDraws = draws;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (this.canvas.closest(".map")) {
        draws.all++;
        if (args[0] instanceof HTMLImageElement && args[0].src.includes("tiles64")) draws.fromSheet++;
      }
      return (drawImage as (...a: unknown[]) => void).apply(this, args);
    } as typeof drawImage;
  });
  await startGame(page, `Sheet${Date.now() % 100000}`);
  await page.evaluate(() => Object.assign((window as unknown as { mapDraws: object }).mapDraws, { fromSheet: 0, all: 0 }));
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { mapDraws: { all: number } }).mapDraws.all)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { mapDraws: { fromSheet: number } }).mapDraws.fromSheet)).toBe(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a long message log scrolls rather than pushing the map off the screen", async ({ page }) => {
    await startGame(page, `Phone${Date.now() % 100000}`);
    const mapHeight = async () => (await page.locator(".map-pane").boundingBox())!.height;
    const look = async (times: number) => {
      for (let i = 0; i < times; i++) await page.keyboard.press(":");
      await untilCommand(page);
    };
    await look(20);
    const before = await mapHeight();
    expect(before).toBeGreaterThan(844 / 2);
    await look(20);
    expect(await page.locator(".message").count()).toBeGreaterThan(40);
    expect(await mapHeight()).toBe(before);
    const messages = page.locator(".messages");
    expect(await messages.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(1);
  });
});

test("with a mouse, buttons and menu rows keep their size", async ({ page }) => {
  await startGame(page, `Mouse${Date.now() % 100000}`);
  expect((await page.getByRole("menubar").getByRole("menuitem", { name: "Act" }).boundingBox())!.height).toBeLessThan(44);
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

test("a stat explains itself to screen readers, and to everyone else only when clicked", async ({ page }) => {
  await startGame(page, `Tip${Date.now() % 100000}`);
  const ac = stat(page, "AC");
  await expect(ac.locator(".screen-reader-only")).toHaveText(/Lower is better/);
  await ac.hover();
  await page.waitForTimeout(TOOLTIP_DELAY * 2);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "What this means" })).toHaveCount(0);
});

test("clicking a stat explains it, with a link to the wiki, until a click elsewhere or a key", async ({ page }) => {
  await startGame(page, `Pop${Date.now() % 100000}`);
  const popover = page.getByRole("dialog", { name: "What this means" });
  await stat(page, "AC").click();
  await expect(popover).toContainText("Lower is better");
  await expect(popover.getByRole("link")).toHaveAttribute("href", /search=Armor%20class/);
  // the click that closes it doesn't reach the map
  const cursor = await page.locator("canvas").getAttribute("data-cursor");
  const map = (await page.locator(".map").boundingBox())!;
  await page.mouse.click(map.x + map.width / 2 + 40, map.y + map.height / 2);
  await expect(popover).toBeHidden();
  await expect(page.locator("canvas")).toHaveAttribute("data-cursor", cursor!);
  await stat(page, "AC").click();
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  // a game key closes it and still plays
  await stat(page, "AC").click();
  const turn = await stat(page, "T").innerText();
  await page.keyboard.press("s");
  await expect(popover).toBeHidden();
  await expect(stat(page, "T")).not.toHaveText(turn);
});

test("the toolbar offers what you can do where you stand, and runs it", async ({ page }) => {
  await startGame(page, `Tool${Date.now() % 100000}`);
  const toolbar = page.getByRole("group", { name: "What you can do here" });
  // the game starts on the up stairs
  await expect(toolbar.getByRole("button")).toHaveText(["Go up<", "Searchs", "Rest."]);
  // the key is for the eye, not part of the button's name
  await expect(toolbar.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  const turn = await stat(page, "T").innerText();
  await toolbar.getByRole("button", { name: /^Search/ }).click();
  await expect(stat(page, "T")).not.toHaveText(turn);
  await untilCommand(page);
  await expect(toolbar.getByRole("button")).toHaveCount(3);
});

test("the toolbar can be hidden from the View menu, and stays hidden", async ({ page }) => {
  await startGame(page, `NoTool${Date.now() % 100000}`);
  const toolbar = page.getByRole("group", { name: "What you can do here" });
  await expect(toolbar).toBeVisible();
  await page.getByRole("menubar").getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Hide Toolbar" }).click();
  await expect(toolbar).toBeHidden();
  await page.reload();
  await untilPlaying(page);
  await expect(toolbar).toBeHidden();
  await page.getByRole("menubar").getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Show Toolbar" }).click();
  await expect(toolbar).toBeVisible();
});

test("a status badge pulses as it appears", async ({ page }) => {
  test.setTimeout(60_000);
  await startGame(page, `Hunger${Date.now() % 100000}`);
  // note each badge's animations as it's added, as they're over in a second or two
  await page.evaluate(() => {
    (window as any).appeared = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement)
            for (const b of n.matches(".badge") ? [n] : n.querySelectorAll(".badge"))
              (window as any).appeared.push([b.textContent, b.getAnimations().map((a) => (a as CSSAnimation).animationName)]);
    }).observe(document.querySelector(".stats")!, { childList: true, subtree: true });
  });
  // searching until hungry, answering whatever interrupts
  const hungry = page.locator(".badge", { hasText: "Hungry" });
  for (let i = 0; i < 100 && !(await hungry.count()); i++) {
    await page.keyboard.type("20s");
    await untilCommand(page);
    while (await page.getByRole("dialog").count()) {
      await page.keyboard.press("Escape");
      await untilCommand(page);
    }
  }
  await expect(hungry).toBeVisible();
  const appeared: [string, string[]][] = await page.evaluate(() => (window as any).appeared);
  expect(appeared).toContainEqual([expect.stringContaining("Hungry"), ["badge-appear"]]);
  // and not again while it stays
  const pulses = async () => (await page.evaluate(() => (window as any).appeared as [string][])).filter(([t]) => t.includes("Hungry")).length;
  const count = await pulses();
  await page.keyboard.type("5s");
  await untilCommand(page);
  await expect(hungry).toBeVisible();
  expect(await pulses()).toBe(count);
  // nor when the game comes back after a reload, as it was already up
  await page.reload();
  await untilPlaying(page);
  await expect(hungry).toBeVisible();
  expect(await hungry.evaluate((b) => b.getAnimations().length)).toBe(0);
});

test("tapping a stat explains it", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await startGame(page, `Tap${Date.now() % 100000}`);
  await stat(page, "Dx").tap();
  await expect(page.getByRole("dialog", { name: "What this means" })).toContainText("Dexterity");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await context.close();
});

test("zooming the map is kept across a reload", async ({ page }) => {
  const name = `Zoom${Date.now() % 100000}`;
  await startGame(page, name);
  const canvas = page.locator(".map canvas");
  const width = Number(await canvas.getAttribute("width"));
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("width"))).toBeGreaterThan(width);
  const zoomed = await canvas.getAttribute("width");

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect(canvas).toHaveAttribute("width", zoomed!);
});

test("keys typed into an open window stay there", async ({ page }) => {
  await startGame(page, `Keys${Date.now() % 100000}`);
  const turn = async () => stat(page, "T").innerText();
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
  await untilCommand(page);
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
  // its key listener is attached after the paint that shows it
  await settle(page);
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

  await enterGame(page, `${name}b`);
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
  const ac = stat(page, "AC");
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
  const hint = dialog.getByText("Type a number, then a letter, for only that many.");
  await expect(dialog).toContainText(/all types/i);
  await expect(hint).toBeHidden();
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  await expect(hint).toBeVisible();
  await page.keyboard.type("2");
  await expect(hint).toBeHidden();
  await page.keyboard.type(letter);
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

test("a menu of several picks shows a checkbox on each row, ticked when picked", async ({ page }) => {
  await startAs(page, `Box${Date.now() % 100000}`, /Priest/);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  const row = dialog.getByRole("menuitemcheckbox", { name: /all types/i });
  await expect(row.locator(".menu-check")).toBeVisible();
  await expect(row).toHaveAttribute("aria-checked", "false");
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "false");
});

test("an item picked by its letter in a menu of several picks is scrolled into view", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 420 });
  await startAs(page, `Reveal${Date.now() % 100000}`, /Priest/);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  const last = dialog.locator(".menu-item").last();
  await expect(last).not.toBeInViewport();
  await page.keyboard.press((await last.locator(".inv-letter").innerText()).trim());
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(last).toBeInViewport({ ratio: 0.9 });
});

test("a menu's heading stays at the top while its items scroll under it", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 420 });
  await startGame(page, `Pin${Date.now() % 100000}`);
  await page.keyboard.press("Shift+O");
  const list = page.getByRole("dialog").locator(".menu-items");
  await expect(list.locator(".menu-item").first()).toBeVisible();
  const top = await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.left + 30, box.top + 4)?.closest(".menu-heading, .menu-item")?.className;
  });
  expect(top).toMatch(/menu-heading/);
});

test("a menu without tiles has no tile column, and one with tiles keeps it", async ({ page }) => {
  await startAs(page, `Tiles${Date.now() % 100000}`, /Priest/);
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Shift+O");
  await expect(dialog.locator(".menu-item").first()).toBeVisible();
  await expect(dialog.locator(".inv-icon")).toHaveCount(0);
  await expect(dialog.locator(".inv-letter").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+D");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  expect(await dialog.locator(".inv-icon").count()).toBe(await dialog.locator(".menu-item").count());
});

test("a menu's columns set apart by runs of spaces line up like tab-separated ones", async ({ page }) => {
  await startGame(page, `Cols${Date.now() % 100000}`);
  await page.keyboard.press("Shift+O");
  const dialog = page.getByRole("dialog");
  const row = (name: string) => dialog.locator(".menu-item", { hasText: name });
  const left = async (name: string, n: number) => (await row(name).locator(".menu-field").nth(n).boundingBox())!.x;
  await expect(row("dropped_nopick").locator(".menu-field")).toHaveText(["dropped_nopick", "[X]", "(for autopickup)"]);
  expect(await left("dropped_nopick", 1)).toBeCloseTo(await left("fruit", 1), 0);
  expect(await left("dropped_nopick", 2)).toBeCloseTo(await left("pickup_types", 2), 0);
});

test("a menu's text indented four spaces starts where the items' text does", async ({ page }) => {
  await startGame(page, `Indent${Date.now() % 100000}`);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  const note = dialog.locator(".menu-line", { hasText: "ignored unless" });
  const noteStart = await note.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
  const itemStart = (await dialog.locator(".menu-item", { hasText: "Auto-select" }).locator(".menu-text").boundingBox())!.x;
  expect(noteStart).toBeCloseTo(itemStart, 0);
});

test("a menu widens to fit a long row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await startGame(page, `Wide${Date.now() % 100000}`);
  await page.keyboard.type("#name");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByText("a particular object in inventory").click();
  await dialog.getByText("+1 spear").click();
  await dialog.locator("input").fill("Glorious Shining Blade of the Seventh Northern Kingdom of Asgard");
  await page.keyboard.press("Enter");
  await untilCommand(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: /Bigger Text/ }).click();
  }
  await untilCommand(page);
  await page.keyboard.press("i");
  const items = dialog.locator(".menu-items");
  await expect(items).toContainText("Asga (weapon in right hand)");
  expect(await items.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(720);
});

test("arrowing up a long menu keeps the highlighted row clear of the pinned heading", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 420 });
  await startAs(page, `Up${Date.now() % 100000}`, /Priest/);
  await page.keyboard.press("Shift+D");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".menu-item", { hasText: /all types/i }).click();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toContainText("holy water");
  const rows = await dialog.locator(".menu-item").count();
  for (let i = 0; i < rows; i++) await page.keyboard.press("ArrowDown");
  for (let i = 1; i < rows; i++) {
    await page.keyboard.press("ArrowUp");
    const lit = dialog.locator(".menu-item.highlighted");
    const hit = await lit.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.left + 40, box.top + 3));
    });
    expect(hit, `row ${rows - 1 - i}`).toBe(true);
  }
});

test("the status panel gives the hero's alignment, race and role, and the dungeon's name with the level", async ({ page }) => {
  await startAs(page, `Head${Date.now() % 100000}`, /Priest/);
  const lines = page.locator(".stats .stats-sub");
  await expect(lines.nth(0)).toHaveText(/^(Lawful|Neutral|Chaotic) (human|elven) priest(ess)?$/);
  await expect(lines.nth(1)).toHaveText("The Dungeons of Doom: level 1");
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
  await expect(dialog.getByText(/^Count:/)).toBeHidden();
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

test("a short question from the game shows a button for each answer, and not asking about the tutorial again is kept", async ({ page }) => {
  await enterGame(page, `Ask${Date.now() % 100000}`);
  await page.getByRole("dialog", { name: "Choose your character" }).getByRole("button", { name: "Play" }).click();
  // the tutorial offer, after the intro, is a menu of a few short answers
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Go bravely/i, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toContainText(/tutorial/i);
  await expect(dialog.locator(".answers .answer")).toHaveCount(3);
  await expect(dialog).toContainText("You can change this in Game Settings.");
  await dialog.screenshot({ path: "test-results/question.png" });
  await dialog.getByRole("button", { name: /don't ask again/i }).click();
  await untilPlaying(page);
  await expect(page.locator(".stats-title")).toBeVisible();

  // kept in the options file, where Game Settings shows it
  expect(await page.evaluate(() => localStorage.getItem("nethack.options"))).toMatch(/^OPTIONS=!tutorial$/m);
  await page.getByRole("menubar").getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menu", { name: "Game" }).getByRole("menuitem", { name: /Game Settings/ }).click();
  const settings = page.getByRole("dialog", { name: "Game Settings" });
  await expect(settings.getByLabel("Tutorial")).toHaveValue("2");
  await settings.getByRole("button", { name: "Cancel" }).click();
});

test("a read-only list's Close is its default button", async ({ page }) => {
  await startGame(page, `Close${Date.now() % 100000}`);
  await page.keyboard.press("Control+x");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Close" })).toHaveClass(/primary/);
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

test("a key pressed at a text window, other than one to close it, closes it and plays on", async ({ page }) => {
  await startGame(page, `On${Date.now() % 100000}`);
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("#");
  await dialog.getByRole("textbox").fill("history");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".text-body")).toBeVisible();
  // : looks at what is here
  await page.keyboard.press(":");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".messages")).toContainText(/here/i);
});

test("a key typed before a text window opened doesn't close it unseen", async ({ page }) => {
  await startGame(page, `Ahead${Date.now() % 100000}`);
  const turn = () => stat(page, "T").innerText();
  const before = await turn();
  // all typed at once, so s is typed ahead of the history window it lands in
  await page.evaluate(() => {
    for (const key of ["#", ..."history", "Enter", "s"]) window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".text-body")).toBeVisible();
  await settle(page);
  await expect(dialog.locator(".text-body")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await turn()).toBe(before);
});

test("the inventory sidebar can be hidden and shown, and stays as it was left", async ({ page }) => {
  const name = `Side${Date.now() % 100000}`;
  await startGame(page, name);
  const sidebar = page.locator(".inventory");
  const map = page.locator(".map");
  const width = (await map.boundingBox())!.width;

  await sidebar.getByRole("button", { name: "Hide" }).click();
  await expect(sidebar).toBeHidden();
  expect((await map.boundingBox())!.width).toBeGreaterThan(width);

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect(sidebar).toBeHidden();

  await page.keyboard.press("Control+Meta+s");
  await expect(sidebar).toBeVisible();
  await page.keyboard.press("Control+Meta+s");
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Show Inventory" }).click();
  await expect(sidebar).toBeVisible();

  // with a dialog open too, which doesn't take the s
  await page.keyboard.press("Control+x");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Control+Meta+s");
  await expect(sidebar).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("dragging the inventory's edge resizes it, within limits, and the width is kept", async ({ page }) => {
  const name = `Wide${Date.now() % 100000}`;
  await startGame(page, name);
  const sidebar = page.locator(".inventory");
  const handle = page.locator(".inv-resize");
  const start = (await sidebar.boundingBox())!.width;
  const drag = async (by: number) => {
    const from = (await handle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + by, from.y + from.height / 2, { steps: 4 });
    await page.mouse.up();
  };
  await drag(-100);
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(Math.round(start + 100));
  // no narrower than 180
  await drag(1000);
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(180);
  // nor so wide the map, stats and messages lose their room
  await drag(-2000);
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(page.viewportSize()!.width - 637);
  // and kept within the limit when the window narrows
  await page.setViewportSize({ width: 1200, height: page.viewportSize()!.height });
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(1200 - 637);
  await page.setViewportSize({ width: 1400, height: page.viewportSize()!.height });
  await drag(500);
  const kept = Math.round((await sidebar.boundingBox())!.width);

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  expect(Math.round((await sidebar.boundingBox())!.width)).toBe(kept);
});

test("Cmd-Option = and - change the text size, which is kept, and the sidebar grows with it", async ({ page }) => {
  const name = `Text${Date.now() % 100000}`;
  await startGame(page, name);
  const size = () => page.locator(".messages").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const sidebar = async () => (await page.locator(".inventory").boundingBox())!.width;
  expect(await size()).toBe(13);
  const narrow = await sidebar();
  const map = async () => (await page.locator(".map canvas").boundingBox())!.width;
  const mapWidth = await map();

  await page.keyboard.press("Meta+Alt+Equal");
  await expect.poll(size).toBe(14);
  await page.keyboard.press("Control+Alt+Equal");
  await expect.poll(size).toBe(16);
  expect(await sidebar()).toBeCloseTo((narrow * 16) / 13, 0);
  // the map doesn't scale with the text, nor do questions, as in Cocoa
  expect(await map()).toBe(mapWidth);
  await page.keyboard.press("Alt+p");
  const question = page.getByRole("dialog");
  await expect(question).toContainText(/want to pray/);
  expect(await question.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(13);
  await page.keyboard.press("n");
  await expect(question).toBeHidden();

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  expect(await size()).toBe(16);
  await page.keyboard.press("Meta+Alt+Minus");
  await expect.poll(size).toBe(14);
  await page.keyboard.press("Meta+Alt+Digit0");
  await expect.poll(size).toBe(13);
  // the default forgets the choice, so the options decide again
  expect(await page.evaluate(() => localStorage.getItem("nethack.textSize"))).toBeNull();
});

test("Cmd-period cancels as Escape does, for keyboards without Esc", async ({ page }) => {
  await startGame(page, `Period${Date.now() % 100000}`);
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("#");
  await page.keyboard.type("e");
  await expect(dialog.getByRole("textbox")).not.toHaveValue("");
  await page.keyboard.press("Meta+Period");
  await expect(dialog.getByRole("textbox")).toHaveValue("");
  await page.keyboard.press("Meta+Period");
  await expect(dialog).toBeHidden();
  await untilCommand(page);
  await page.keyboard.press("&");
  await expect(dialog).toContainText("What command?");
  await page.keyboard.press("Meta+Period");
  await expect(dialog).toBeHidden();
});

test("the Act menu repeats the last command and opens the extended command list", async ({ page }) => {
  await startGame(page, `Again${Date.now() % 100000}`);
  const turn = async () => Number((await stat(page, "T").innerText()).replace(/\D/g, ""));
  const act = async (name: RegExp) => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "Act" }).click();
    await page.getByRole("menu", { name: "Act" }).getByRole("menuitem", { name }).click();
  };
  await page.keyboard.press("s");
  await untilCommand(page);
  const before = await turn();
  await act(/Repeat/);
  await expect.poll(turn).toBe(before + 1);
  await untilCommand(page);
  await act(/Extended Command/);
  await expect(page.getByRole("dialog")).toContainText("Return runs the highlighted command");
});

test("the menu bar runs commands by name while the game waits for one", async ({ page }) => {
  await startGame(page, `Bar${Date.now() % 100000}`);
  const bar = page.getByRole("menubar");
  // only a debug-mode game has it
  await expect(bar.getByRole("menuitem", { name: "Wizard Mode" })).toHaveCount(0);
  await bar.getByRole("menuitem", { name: "Act" }).click();
  await expect(page.getByRole("menu", { name: "Act" }).getByRole("menuitem", { name: /Kick/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await bar.getByRole("menuitem", { name: "Info" }).click();
  const info = page.getByRole("menu", { name: "Info" });
  await expect(info.getByRole("menuitem", { name: /What Does a Key Do/ })).toContainText("&");
  await info.getByRole("menuitem", { name: /Attributes/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/You are/);
  await page.screenshot({ path: "test-results/menubar.png" });

  // with a dialog up, the game isn't waiting for a command
  await bar.getByRole("menuitem", { name: "Act" }).click();
  await expect(page.getByRole("menu", { name: "Act" }).getByRole("menuitem", { name: /Kick/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Act" })).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // View acts on the page
  const canvas = page.locator(".map canvas");
  const width = Number(await canvas.getAttribute("width"));
  await bar.getByRole("menuitem", { name: "View" }).click();
  await expect(page.getByRole("menu", { name: "View" }).getByRole("menuitemcheckbox", { name: /Use ASCII Mode/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menu", { name: "View" }).getByRole("menuitem", { name: /Zoom In/ }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("width"))).toBeGreaterThan(width);
  await bar.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menu", { name: "View" }).getByRole("menuitem", { name: /Hide Inventory/ }).click();
  await expect(page.locator(".inventory")).toBeHidden();
  await bar.getByRole("menuitem", { name: "View" }).click();
  await expect(page.getByRole("menu", { name: "View" }).getByRole("menuitem", { name: /Show Inventory/ })).toBeVisible();
});

test("a menu's lines of text read as text, its headings as headings", async ({ page }) => {
  await startGame(page, `Lines${Date.now() % 100000}`);
  await page.keyboard.press("Control+x");
  const dialog = page.getByRole("dialog");
  // "Background:" ends in a colon, so it heads the lines under it, which are text
  const line = dialog.locator(".menu-line", { hasText: /^ *You are/ }).first();
  await expect(line).toBeVisible();
  await expect(dialog.locator(".menu-heading", { hasText: /Background:/ })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the options file is edited in the browser and read when a game starts", async ({ page }) => {
  await page.goto("/offline/");
  await page.getByRole("button", { name: "Game Settings…" }).click();
  const editor = page.getByRole("dialog", { name: "Game Settings" });
  const text = editor.getByLabel("Options file", { exact: true });
  await expect(text).toHaveValue(/#OPTIONS=autodig/);
  await text.fill(`${await text.inputValue()}OPTIONS=!time\n`);
  await editor.getByRole("button", { name: "OK" }).click();
  await expect(editor).toBeHidden();

  await page.getByLabel("Who are you?").fill(`Rc${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play Offline" }).click();
  await untilPlaying(page);
  // the player's option wins over the game's, which still sets the rest, with no complaint
  await expect(page.locator(".stat-label", { hasText: /^T$/ })).toHaveCount(0);
  await expect(page.locator(".stat-label", { hasText: /^Exp$/ })).toHaveCount(1);
  await expect(page.locator(".messages")).not.toContainText(/multiple times|error/i);

  // typing in the editor is text, not play
  await page.getByRole("menubar").getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menu", { name: "Game" }).getByRole("menuitem", { name: /Game Settings/ }).click();
  await expect(text).toHaveValue(/OPTIONS=!time/);
  await text.press("End");
  await page.keyboard.type("i");
  await expect(text).toHaveValue(/i$/);
  await expect(page.locator(".menu-dialog")).toHaveCount(0);
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toBeHidden();
});

test("Game Settings' choices and the options file show each other's changes, and a file the core finds wrong isn't kept", async ({ page }) => {
  await page.goto("/offline/");
  await page.getByRole("button", { name: "Game Settings…" }).click();
  const settings = page.getByRole("dialog", { name: "Game Settings" });
  const tutorial = settings.getByLabel("Tutorial");
  const move = settings.getByLabel("Move with");
  const text = settings.getByLabel("Options file", { exact: true });
  await expect(tutorial).toHaveValue("0");
  await expect(tutorial).toBeFocused();

  await tutorial.selectOption({ label: "Never" });
  await expect(text).toHaveValue(/\nOPTIONS=!tutorial\n$/);
  await text.fill((await text.inputValue()).replace("#OPTIONS=number_pad:1", "OPTIONS=number_pad:1"));
  await expect(move).toHaveValue("1");
  await move.selectOption({ label: "Letters (h j k l y u b n)" });
  await expect(text).not.toHaveValue(/^OPTIONS=number_pad/m);

  await text.fill(`${await text.inputValue()}OPTIONS=bogus\n`);
  await settings.getByRole("button", { name: "OK" }).click();
  const problems = settings.getByRole("alert");
  await expect(problems).toContainText("Unknown option 'bogus'");
  await expect(problems.getByRole("button", { name: /^Line \d+$/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(text).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(problems).toBeHidden();
  await settings.getByRole("button", { name: "OK" }).click();
  await expect(settings).toBeHidden();
  const saved = await page.evaluate(() => localStorage.getItem("nethack.options"));
  expect(saved).toMatch(/\nOPTIONS=!tutorial\n\n?$/);

  // while the core checks it, the file can't be changed or the dialog closed, so what's kept is what was checked
  await page.getByRole("button", { name: "Game Settings…" }).click();
  await tutorial.selectOption({ label: "Always play it first" });
  await settings.getByRole("button", { name: "OK" }).click();
  await expect(settings.getByRole("button", { name: "Checking…" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(tutorial).toBeDisabled();
  await expect(text).not.toBeEditable();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("nethack.options"))).toMatch(/\nOPTIONS=tutorial\n/);
});

test("the View menu switches between the painted and classic tiles, and the choice is kept", async ({ page }) => {
  const name = `Tiles${Date.now() % 100000}`;
  await startGame(page, name);
  const icon = page.locator(".inv-icon").first();
  await expect(icon).toHaveCSS("background-image", /tiles64\.png/);
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "View" }).click();
  const view = page.getByRole("menu", { name: "View" });
  await expect(view.getByRole("menuitemcheckbox", { name: /Painted Tiles/ })).toHaveAttribute("aria-checked", "true");
  await view.getByRole("menuitemcheckbox", { name: /Classic Tiles/ }).click();
  await expect(icon).toHaveCSS("background-image", /tiles16\.bmp/);
  await page.screenshot({ path: "test-results/classic-tiles.png" });

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /tiles16\.bmp/);
});

test("an imported tile set is kept in the browser, used, and can be removed", async ({ page }) => {
  const name = `Imp${Date.now() % 100000}`;
  await startGame(page, name);
  const classic = readFileSync("public/tiles/tiles16.bmp");
  const icon = page.locator(".inv-icon").first();
  const bar = page.getByRole("menubar");
  const view = page.getByRole("menu", { name: "View" });
  const importSets = async (files: { name: string; mimeType: string; buffer: Buffer }[]) => {
    await bar.getByRole("menuitem", { name: "View" }).click();
    const chooser = page.waitForEvent("filechooser");
    await view.getByRole("menuitem", { name: "Import Tile Set…" }).click();
    await (await chooser).setFiles(files);
  };

  await importSets([
    { name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    { name: "mine.bmp", mimeType: "image/bmp", buffer: classic },
  ]);
  await expect(page.locator(".messages")).toContainText(/"notes\.png" can't be used as a tile set\. It isn't an image/);
  await expect(icon).toHaveCSS("background-image", /blob:/);
  await bar.getByRole("menuitem", { name: "View" }).click();
  await expect(view.getByRole("menuitemcheckbox", { name: "mine.bmp" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  // kept for the next game
  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /blob:/);

  page.on("dialog", (d) => d.accept());
  await bar.getByRole("menuitem", { name: "View" }).click();
  await view.getByRole("menuitem", { name: 'Remove "mine.bmp"...' }).click();
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /tiles64\.png/);
  await bar.getByRole("menuitem", { name: "View" }).click();
  await expect(view.getByRole("menuitemcheckbox", { name: "mine.bmp" })).toHaveCount(0);
});

test("an imported tile set the browser can't read this time stays the saved choice", async ({ page }) => {
  const name = `Kept${Date.now() % 100000}`;
  await startGame(page, name);
  await page.getByRole("menubar").getByRole("menuitem", { name: "View" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menu", { name: "View" }).getByRole("menuitem", { name: "Import Tile Set…" }).click();
  await (await chooser).setFiles({ name: "mine.bmp", mimeType: "image/bmp", buffer: readFileSync("public/tiles/tiles16.bmp") });
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /blob:/);

  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      if (name === "nethack-tile-sets") throw new DOMException("refused", "UnknownError");
      return open.call(this, name, version);
    };
  });
  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect(page.locator(".messages")).toContainText(/"mine\.bmp" couldn't be read from this browser just now/);
  expect(await page.evaluate(() => localStorage.getItem("nethack.tileSet"))).toBe("imported:mine.bmp");
});

test("a tile set the browser won't keep is used until the page closes, and says so", async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      if (name === "nethack-tile-sets") throw new DOMException("refused", "SecurityError");
      return open.call(this, name, version);
    };
  });
  await startGame(page, `Visit${Date.now() % 100000}`);
  const bar = page.getByRole("menubar");
  const view = page.getByRole("menu", { name: "View" });
  await bar.getByRole("menuitem", { name: "View" }).click();
  const chooser = page.waitForEvent("filechooser");
  await view.getByRole("menuitem", { name: "Import Tile Set…" }).click();
  await (await chooser).setFiles({ name: "mine.bmp", mimeType: "image/bmp", buffer: readFileSync("public/tiles/tiles16.bmp") });
  await expect(page.locator(".messages")).toContainText(/the tile set "mine\.bmp" will be gone when you close this page/);
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /blob:/);
  await bar.getByRole("menuitem", { name: "View" }).click();
  await expect(view.getByRole("menuitemcheckbox", { name: "mine.bmp (until you close this page)" })).toHaveAttribute("aria-checked", "true");
  // not kept as the choice, which the next page couldn't load
  expect(await page.evaluate(() => localStorage.getItem("nethack.tileSet"))).toBeNull();
});

test("tile_file in the options file chooses the tile set, and an unknown one falls back to the default", async ({ page }) => {
  const play = async (name: string, options: string) => {
    await page.goto("/offline/");
    await page.evaluate((options) => localStorage.setItem("nethack.options", options), options);
    await enterGame(page, name);
    await untilPlaying(page);
  };
  const id = Date.now() % 100000;
  await play(`Tf${id}`, "OPTIONS=tile_file:tiles16.bmp\n");
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /tiles16\.bmp/);
  // the option's choice isn't kept as the menu's
  expect(await page.evaluate(() => localStorage.getItem("nethack.tileSet"))).toBeNull();

  await play(`Tg${id}`, "OPTIONS=tile_file:~/mine/nope.png\n");
  await expect(page.locator(".inv-icon").first()).toHaveCSS("background-image", /tiles64\.png/);
  await expect(page.locator(".messages")).toContainText(/The tile set "nope\.png" can't be used/);
});

test("when the game ends, a dialog offers a new game under the same name, or the landing page", async ({ page }) => {
  const name = `End${Date.now() % 100000}`;
  await startGame(page, name);
  await expect(page.locator(".stats-title")).toBeVisible();
  const over = page.getByRole("dialog", { name: "The game is over" });
  const quitGame = async () => {
    await page.keyboard.press("#");
    await page.keyboard.type("quit");
    await page.keyboard.press("Enter");
    await page.keyboard.press("y");
    await untilGameOver(page);
    await expect(over).toContainText("Start a new game, or quit to the home page.");
  };
  await quitGame();

  // the options editor's keys are its own, not the dialog's
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menu", { name: "Game" }).getByRole("menuitem", { name: /Game Settings/ }).click();
  const editor = page.getByRole("dialog", { name: "Game Settings" });
  await editor.getByLabel("Options file", { exact: true }).press("Enter");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancel" }).click();

  // Return starts another game at once, without going through the landing page
  await page.keyboard.press("Enter");
  await untilPlaying(page);
  expect(new URL(page.url()).pathname).toBe("/offline/play/");

  // Escape goes to the landing page
  await quitGame();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Play Offline as ${name}` })).toBeVisible();

  await page.getByRole("link", { name: "Watch your last game" }).click();
  await expect(page.locator(".stats-title")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/offline/watch/");
});

test("the landing page's marked letters work as keys, but not while typing a name, and Enter with nothing focused plays", async ({ page }) => {
  await page.goto("/offline/");
  await page.evaluate(() => localStorage.setItem("nethack-web.name", "Keys"));
  await page.reload();
  await expect(page.getByRole("button", { name: "Play Offline as Keys" })).toBeVisible();
  await page.keyboard.press("s");
  const settings = page.getByRole("dialog", { name: "Game Settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Cancel" }).click();
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog", { name: /About/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Change Name" }).click();
  await page.getByLabel("Who are you?").fill("");
  await page.keyboard.type("gasp");
  await expect(page.getByLabel("Who are you?")).toHaveValue("gasp");
  await expect(page).toHaveURL(/\/offline\/$/);

  await page.getByLabel("Who are you?").blur();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Choose your character" })).toBeVisible({ timeout: 15_000 });
  await page.goBack();
  await expect(page.getByRole("button", { name: /Offline as gasp$/ })).toBeVisible();
  await page.keyboard.press("g");
  await expect(page).toHaveURL(/\/online\/$/);
});

test("the help for new players is open for a new visitor, and folded away once they've played", async ({ page }) => {
  await page.goto("/offline/");
  const help = page.locator("details", { has: page.getByRole("heading", { name: "New to NetHack?" }) });
  await expect(help).toHaveAttribute("open", "");
  await startGame(page, `Hp${Date.now() % 100000}`);
  await page.keyboard.press("S");
  await expect(help).not.toHaveAttribute("open");
  await help.getByText("New to NetHack?").click();
  await expect(help.getByText("The NetHack Wiki covers everything.")).toBeVisible();
});

test("a saved game is what the landing page offers first, and a new visitor sees no games of their own", async ({ page }) => {
  await page.goto("/offline/");
  await expect(page.getByRole("heading", { name: /best games/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Watch your last game" })).toHaveCount(0);
  const name = `First${Date.now() % 100000}`;
  await startGame(page, name);
  await page.keyboard.press("S");
  const first = page.locator("form button").first();
  await expect(first).toHaveText(`Continue Offline as ${name}`);
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
});

test("the high score file and game log a finished game leaves show on the landing page, the latest game as a tombstone", async ({ page }) => {
  const name = `Best${Date.now() % 100000}`;
  await startGame(page, name);
  const quit = async () => {
    await page.keyboard.press("#");
    await page.keyboard.type("quit");
    await page.keyboard.press("Enter");
    await page.keyboard.press("y");
    await untilGameOver(page);
  };
  await quit();
  // a fresh hero scores nothing, which the core wouldn't list, so the file gets an earlier game's line
  await page.evaluate(
    (files) =>
      Promise.all(
        Object.entries(files).map(
          ([file, line]) =>
            new Promise((resolve, reject) => {
              const open = indexedDB.open("/save");
              open.onsuccess = () => {
                const contents = new TextEncoder().encode(line);
                const put = open.result.transaction("FILE_DATA", "readwrite").objectStore("FILE_DATA").put({ timestamp: new Date(), mode: 33188, contents }, `/save/${file}`);
                put.onsuccess = resolve;
                put.onerror = reject;
              };
            }),
        ),
      ),
    {
      record: "5.0.0 1234 0 3 3 0 16 1 20261102 20261101 0 Val Hum Fem Law Agnes,killed by a newt\n",
    },
  );
  await page.keyboard.press("Enter");
  await untilPlaying(page);
  await quit();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Your last game" })).toBeVisible();
  // though the core logs it, as it doesn't list it
  await expect(page.getByRole("img", { name: new RegExp(`^${name}, 0 points, quit, \\d{4}$`) })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your best games on this device" })).toBeVisible();
  await expect(page.locator(".device-scores li")).toContainText("Agnes (Val-Hum): killed by a newt");
});

test("the Help menu opens the game's help and the NetHack Wiki", async ({ page, context }) => {
  await startGame(page, `Help${Date.now() % 100000}`);
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "Help" }).click();
  await page.getByRole("menu", { name: "Help" }).getByRole("menuitem", { name: /^Help/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/About NetHack/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await context.route("https://nethackwiki.com/**", (route) => route.fulfill({ body: "wiki" }));
  await bar.getByRole("menuitem", { name: "Help" }).click();
  const [wiki] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("menu", { name: "Help" }).getByRole("menuitem", { name: "NetHack Wiki" }).click(),
  ]);
  expect(wiki.url()).toBe("https://nethackwiki.com/");
  await wiki.close();
});

test("Option or Alt with a letter gives a meta command, such as loot", async ({ page }) => {
  await startGame(page, `Meta${Date.now() % 100000}`);
  // as macOS sends Option-L: the character it makes, ¬, on the L key
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "¬", code: "KeyL", altKey: true, cancelable: true })),
  );
  await expect(page.getByRole("dialog")).toContainText(/Loot in what direction/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // on a Mac, as Option-L is on a German layout, where it makes an @
  test.skip(!(await page.evaluate(() => /Mac/.test(navigator.platform))), "Option composes characters only on macOS");
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "@", code: "KeyL", altKey: true, cancelable: true })),
  );
  await expect(page.getByRole("dialog")).toContainText(/Loot in what direction/);
});

test("an extended command only one name starts with completes as it's typed, and Escape clears before it cancels", async ({ page }) => {
  await startGame(page, `Ext${Date.now() % 100000}`);
  await page.keyboard.press("#");
  const dialog = page.getByRole("dialog");
  const field = dialog.getByRole("textbox");
  // typed at once, as a fast typist would
  await page.keyboard.type("enha");
  await expect(field).toHaveValue("enhance");
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([4, 7]);
  // deleting the completion doesn't complete again
  await page.keyboard.press("Backspace");
  await expect(field).toHaveValue("enha");
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("an extended command highlights nothing until something is typed, so Return alone runs nothing", async ({ page }) => {
  await startGame(page, `Bare${Date.now() % 100000}`);
  await page.keyboard.press("#");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await expect(dialog.locator(".ext-item").first()).toBeVisible();
  await expect(dialog.locator(".ext-item.active")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  // had a command run, its own prompt would be up instead
  await page.keyboard.press("#");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("e");
  await expect(dialog.locator(".ext-item.active")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog.locator(".ext-item.active")).toHaveCount(0);
  await page.keyboard.press(" ");
  await expect(dialog.locator(".ext-item.active")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator(".ext-item").first()).toHaveClass(/active/);
});

test("arrowing through the extended commands keeps the highlighted one in view", async ({ page }) => {
  await startGame(page, `Scroll${Date.now() % 100000}`);
  await page.keyboard.press("#");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  const list = dialog.locator(".ext-list");
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const rows = await dialog.locator(".ext-item").count();
  for (let i = 0; i < rows; i++) await page.keyboard.press("ArrowDown");
  await expect(dialog.locator(".ext-item").last()).toHaveClass(/active/);
  await expect(dialog.locator(".ext-item.active")).toBeInViewport({ ratio: 0.9 });
});

test("the extended command dialog says what Return and Esc do", async ({ page }) => {
  await startGame(page, `Hint${Date.now() % 100000}`);
  await page.keyboard.press("#");
  await expect(page.getByRole("dialog")).toContainText("Return runs the highlighted command, Esc cancels.");
});

test("the extended command dialog, and a question any key answers, can be cancelled without a keyboard", async ({ page }) => {
  await startGame(page, `Cancel${Date.now() % 100000}`);
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("#");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await untilCommand(page);
  await page.keyboard.press("&");
  await expect(dialog).toContainText("What command?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await untilCommand(page);
});

test("a message about the hero stands out, and a line separates one turn's messages from the next", async ({ page }) => {
  await startGame(page, `Msg${Date.now() % 100000}`);
  const messages = page.locator(".messages");
  await expect(messages.locator(".message.hero", { hasText: /\bYou\b/ }).first()).toBeVisible();
  await page.keyboard.press(":");
  await page.keyboard.press(":");
  await expect(messages.locator(".message.separator").last()).toHaveText("------------");
});

test("the game beeps at a click on unexplored ground far away, and at an inventory pick it can't take", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { beeps: number; AudioContext: typeof AudioContext };
    w.beeps = 0;
    w.AudioContext = class extends AudioContext {
      createOscillator() {
        w.beeps++;
        return super.createOscillator();
      }
    };
  });
  const beeps = () => page.evaluate(() => (window as unknown as { beeps: number }).beeps);
  await startGame(page, `Beep${Date.now() % 100000}`);
  const canvas = page.locator(".map canvas");
  const box = (await canvas.boundingBox())!;
  // the map's top row is never part of a level
  await canvas.click({ position: { x: (box.width / 80) * 1.5, y: (box.height / 21) * 0.5 } });
  await expect.poll(beeps).toBe(1);

  // choosing where to travel isn't the command prompt, so the inventory can't open
  await page.keyboard.press("_");
  await expect(page.getByRole("dialog")).toContainText(/tip/i);
  await page.keyboard.press("Enter");
  await expect(page.locator(".messages")).toContainText(/where do you want to travel/i);
  await page.locator(".inv-item").first().click();
  await expect.poll(beeps).toBe(2);
  await page.keyboard.press("Escape");
});

test("the Help menu's About box credits NetHack, this version, the painted tiles and the Cocoa interface", async ({ page }) => {
  await startGame(page, `About${Date.now() % 100000}`);
  const bar = page.getByRole("menubar");
  await bar.getByRole("menuitem", { name: "Help" }).click();
  await page.getByRole("menu", { name: "Help" }).getByRole("menuitem", { name: "About NetHack" }).click();
  const about = page.getByRole("dialog", { name: "About NetHack" });
  await expect(about).toContainText(/Based on NetHack \d+\.\d+\.\d+ by the NetHack DevTeam/);
  await expect(about).toContainText("Web port by Kevin Tam");
  await expect(about).toContainText("Painted tiles by Kevin Tam");
  await expect(about).toContainText("Cocoa interface by Bryce Cogswell and Dirk Zimmermann");
  // the game doesn't hear keys while it's open
  await page.keyboard.press("i");
  // a key reaching the game would have taken this away until its menu was answered
  await expect(page.locator(".app[data-commanding]")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Choose Font sets the ASCII map's font and size, switches to ASCII, and is kept", async ({ page }) => {
  const name = `Font${Date.now() % 100000}`;
  await startGame(page, name);
  const canvas = page.locator(".map canvas");
  const height = async () => Number(await canvas.getAttribute("height"));
  const tiled = await height();
  const choose = async () => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menu", { name: "View" }).getByRole("menuitem", { name: "Choose Font…" }).click();
    return page.getByRole("dialog", { name: "ASCII map font" });
  };

  let dialog = await choose();
  const font = dialog.getByLabel("Font");
  const family = await font.locator("option").nth(1).textContent();
  expect(family).toBeTruthy();
  await font.selectOption(family!);
  await dialog.getByLabel("Size").selectOption("24");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("button", { name: "ASCII" })).toHaveAttribute("aria-pressed", "true");
  // the font's lines set the rows, not the tiles
  await expect.poll(height).not.toBe(tiled);
  const chosen = await height();
  await page.screenshot({ path: "test-results/ascii-font.png" });

  await enterGame(page, `${name}b`);
  await untilPlaying(page);
  await expect.poll(height).toBe(chosen);

  dialog = await choose();
  await expect(dialog.getByLabel("Font")).toHaveValue(family!);
  // Return on Cancel cancels
  await dialog.getByLabel("Font").selectOption("");
  await dialog.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(await height()).toBe(chosen);

  dialog = await choose();
  await dialog.getByLabel("Font").selectOption("");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(height).toBe(tiled);
  expect(await page.evaluate(() => localStorage.getItem("nethack.asciiFont"))).toBeNull();
});

test("a finished game can be replayed from its end screen or its address, reloaded, and downloaded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const name = `Rep${Date.now() % 100000}`;
  await startGame(page, name);
  // m: a plain search won't pass time beside a monster, which a random start can be
  for (let i = 0; i < 6; i++) await page.keyboard.type("ms");
  await page.keyboard.press("#");
  await page.keyboard.type("quit");
  await page.keyboard.press("Enter");
  await page.keyboard.press("y");
  await untilGameOver(page);
  const over = page.getByRole("dialog", { name: "The game is over" });
  // downloading is the replay's, not a choice beside starting again
  await expect(over.getByRole("button", { name: /download/i })).toHaveCount(0);

  await over.getByRole("button", { name: "Replay" }).click();
  const playing = page.url();
  expect(new URL(playing).pathname).toBe("/offline/watch/");
  const bar = page.getByRole("toolbar", { name: "Replay" });
  await expect(bar).toBeVisible();

  const download = page.waitForEvent("download");
  await bar.getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^nethack-${name}-\\d{4}-\\d\\d-\\d\\d\\.txt$`));
  const { readFile } = await import("node:fs/promises");
  expect(await readFile((await file.path())!, "utf8")).toMatch(/^\d+ nhrec 1\n\d+ session new /);
  await expect(page.locator(".overlay-note")).toBeHidden();
  await bar.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(bar).toContainText("End of the recording", { timeout: 20000 });
  await expect(bar).not.toContainText("no longer available");
  await expect(page.locator(".messages")).toContainText(/Really quit without saving\?/);
  // a replay is watched, not played: the game over screen of the game it replays doesn't come up
  await expect(over).toBeHidden();

  // back to a turn part way, paused there, then one turn on
  await bar.getByLabel("Turn").fill("3");
  await expect(bar).toContainText("Turn 3 of");
  await bar.getByRole("button", { name: "Step" }).click();
  await expect(bar).toContainText("Turn 4 of");

  await bar.getByRole("button", { name: "Exit Replay" }).click();
  await expect(page).not.toHaveURL(/replay/);
  // the end screen alone offers it
  await expect(page.getByRole("button", { name: /replay/i })).toHaveCount(0);

  await page.goto(playing);
  await expect(page.getByRole("toolbar", { name: "Replay" })).toBeVisible();
  await page.reload();
  const again = page.getByRole("toolbar", { name: "Replay" });
  await again.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(again).toContainText("End of the recording", { timeout: 20000 });

  // an upgrade or corruption: the game goes differently from its recording
  await page.evaluate(() => {
    const text = localStorage.getItem("nethack.lastGame")!;
    localStorage.setItem("nethack.lastGame", text.replace(/^(\d+) seed \d+$/m, "$1 k 83"));
  });
  await page.reload();
  const broken = page.getByRole("toolbar", { name: "Replay" });
  await broken.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(broken).toContainText("This replay is no longer available.", { timeout: 20000 });
  await expect(broken).not.toContainText("line ");
  expect(errors).toEqual([]);
});

test("a finished game the browser won't keep still replays from its end screen, until the page is reloaded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "nethack.lastGame") throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await startGame(page, `Big${Date.now() % 100000}`);
  for (let i = 0; i < 3; i++) await page.keyboard.type("ms");
  await page.keyboard.press("#");
  await page.keyboard.type("quit");
  await page.keyboard.press("Enter");
  await page.keyboard.press("y");
  await untilGameOver(page);

  await page.getByRole("dialog", { name: "The game is over" }).getByRole("button", { name: "Replay" }).click();
  const bar = page.getByRole("toolbar", { name: "Replay" });
  await bar.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(bar).toContainText("End of the recording", { timeout: 20000 });
  await expect(page.locator(".messages")).toContainText(/Really quit without saving\?/);

  // nothing kept to come back to
  await page.reload();
  await expect(page).toHaveURL(/\/offline\/$/);
  await expect(page.getByRole("link", { name: "Watch your last game" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a game the browser stops saving says so, and stops saying so once it saves again", async ({ page }) => {
  await startGame(page, `Full${Date.now() % 100000}`);
  // Chromium's quota override doesn't fail IndexedDB writes, so the game's worker is made to
  const [worker] = page.workers();
  await worker.evaluate(() => {
    const store = IDBObjectStore.prototype as unknown as { put: unknown; realPut: unknown };
    store.realPut = store.put;
    store.put = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  const notice = page.getByRole("status").filter({ hasText: "isn't being saved" });
  await page.keyboard.type("ms");
  await expect(notice).toBeVisible();

  await worker.evaluate(() => {
    const store = IDBObjectStore.prototype as unknown as { put: unknown; realPut: unknown };
    store.put = store.realPut;
  });
  await page.keyboard.type("ms");
  await expect(notice).toHaveCount(0);
});

test.describe("shadowing a game", () => {
  const bar = (page: Page) => page.getByRole("status", { name: "Shadow" });
  const turnsIn = async (page: Page) => Number(/turn (\d+)/.exec((await bar(page).innerText()) ?? "")?.[1] ?? -1);

  test("is off for players, and a developer's address turns it on and off", async ({ page }) => {
    await startGame(page, `Off${Date.now() % 100000}`);
    await expect(bar(page)).toHaveCount(0);
    await page.goto(`/offline/play/?shadow&name=On${Date.now() % 100000}`);
    await expect(bar(page)).toBeVisible();
    await page.goto(`/offline/play/?shadow=0&name=On${Date.now() % 100000}`);
    await expect(bar(page)).toHaveCount(0);
  });

  test("follows a game through a reload to its end, and gives a package that holds it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("nethack.shadow", "1"));
    const name = `Sha${Date.now() % 100000}`;
    await startGame(page, name);
    // m: a plain search won't pass time beside a monster, which a random start can be
    for (let i = 0; i < 25; i++) await page.keyboard.type("ms");
    await expect(bar(page)).toContainText("following");
    await expect.poll(() => turnsIn(page), { timeout: 15000 }).toBeGreaterThan(5);

    await page.reload();
    await expect(page.locator(".stats-title")).toBeVisible({ timeout: 15000 });
    await expect(bar(page)).toContainText("following", { timeout: 15000 });
    await page.keyboard.press("s");
    await expect(bar(page)).not.toContainText("differently");

    const during = page.waitForEvent("download");
    await bar(page).getByRole("button", { name: "Download Debug Package" }).click();
    const { readFile } = await import("node:fs/promises");
    const held = JSON.parse(await readFile((await (await during).path())!, "utf8"));
    expect(held.recording).toMatch(/^\d+ back /m);
    expect(held.core).toMatch(/^[0-9a-f]+$/);
    expect(held.files).toBeNull();

    await page.keyboard.press("#");
    await page.keyboard.type("quit");
    await page.keyboard.press("Enter");
    await page.keyboard.press("y");
    await untilGameOver(page);
    await expect(bar(page)).toContainText("matched to the end", { timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test("says where a game goes differently", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("nethack.shadow", "1"));
    const name = `Dif${Date.now() % 100000}`;
    await startGame(page, name);
    for (let i = 0; i < 5; i++) await page.keyboard.press("s");
    await page.keyboard.press("S");
    const play = page.getByRole("button", { name: `Continue Offline as ${name}` });
    await expect(play).toBeVisible();
    await page.evaluate(
      (key) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("/save");
          open.onerror = reject;
          open.onsuccess = () => {
            const store = open.result.transaction("FILE_DATA", "readwrite").objectStore("FILE_DATA");
            const get = store.get(key);
            get.onsuccess = () => {
              const text = new TextDecoder().decode(get.result.contents);
              get.result.contents = new TextEncoder().encode(text.replace(/^(\d+) seed \d+$/m, "$1 k 83"));
              store.put(get.result, key).onsuccess = () => resolve();
            };
          };
        }),
      `/save/replay/0${name}/000001`,
    );
    await page.reload();
    await play.click();
    await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15000 });
    await expect(bar(page)).toContainText("went differently", { timeout: 15000 });
    await expect(bar(page)).toContainText("expected seed");
    await page.keyboard.press("s");

    const download = page.waitForEvent("download");
    await bar(page).getByRole("button", { name: "Download Debug Package" }).click();
    const { readFile } = await import("node:fs/promises");
    const held = JSON.parse(await readFile((await (await download).path())!, "utf8"));
    expect(Object.keys(held.files).length).toBeGreaterThan(0);
    expect(Object.keys(held.files).every((f) => f === `0${name}` || f.startsWith(`0${name}.`))).toBe(true);
  });
});

/** Real bones from a debug-mode death on the first level, made on the core in Node as the headless bones tests make them. */
async function firstLevelBones(): Promise<Map<string, Uint8Array>> {
  const g = await (await Session.start({ name: "Ghost", wizard: true, keepWizardBones: true, pageSeed: 5, seedsVary: true })).skipText();
  await g.send("\x17");
  await g.getlin("wand of death");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  await g.send("z");
  await g.yn(g.state.inventory.find((i) => /wand/.test(i.text))!.accelerator);
  await g.yn(".");
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/^die\?|bones/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else if (p?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
  return new Map([...g.saves()].filter(([k]) => k.startsWith("bones/")));
}

/** Puts files under /save where the next game page will read them. */
const putSaves = (page: Page, files: Map<string, Uint8Array>) =>
  page.evaluate(
    (entries) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("/save");
        open.onerror = reject;
        open.onsuccess = () => {
          const tx = open.result.transaction("FILE_DATA", "readwrite");
          const store = tx.objectStore("FILE_DATA");
          store.put({ timestamp: new Date(), mode: 0o40777 }, "/save/bones");
          for (const [path, data] of entries) store.put({ timestamp: new Date(), mode: 0o100666, contents: new Uint8Array(data) }, `/save/${path}`);
          tx.oncomplete = () => resolve();
          tx.onerror = reject;
        };
      }),
    [...files].map(([path, data]) => [path, [...data]] as [string, number[]]),
  );

test("a game that met bones comes back after the page closes, by its replay reading them", async ({ page }) => {
  test.setTimeout(120_000);
  const bones = await firstLevelBones();
  expect([...bones.keys()]).toContain("bones/bonD0.1");
  // a game first, so this browser has its /save to put the bones in
  await startGame(page, `Bo${Date.now() % 100000}`);

  // a game looks for bones on one level in three, by the dice, so seeds are tried until one does
  let name = "";
  for (let seed = 100; seed < 130 && !name; seed++) {
    await page.goto("/offline/");
    await page.evaluate((seed) => {
      const inputs = JSON.parse(localStorage.getItem("nethack.fixedInputs")!);
      localStorage.setItem("nethack.fixedInputs", JSON.stringify({ ...inputs, seed }));
    }, seed);
    await putSaves(page, bones);
    const tried = `Bo${seed}x${Date.now() % 1000}`;
    await startGame(page, tried);
    await untilCommand(page);
    if (/^\d+ bones bonD0\.1 [0-9a-f]{64}$/m.test(await recording(page, tried))) name = tried;
  }
  expect(name, "no seed looked for the bones").not.toBe("");

  // saved and restored, so the session that met the bones replays on a core of its own, not the one carrying on
  const title = await page.locator(".stats-title").innerText();
  await page.keyboard.press("S");
  await page.getByRole("button", { name: `Continue Offline as ${name}` }).click();
  await expect(page.locator(".messages")).toContainText(/welcome back/i, { timeout: 15_000 });
  await untilPlaying(page);
  // no moves: whatever left the bones may be close by
  await expect.poll(() => recording(page, name)).toMatch(/^\d+ session restore /m);

  await page.reload();
  await page.locator(".app[data-commanding]").waitFor({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".stats-title")).toHaveText(title);
  expect(await recording(page, name)).toMatch(/^\d+ back /m);
});

test("the game worker gives a bot driving the page #terrain's known map", async ({ page }) => {
  await page.addInitScript(() => {
    const Base = Worker;
    window.Worker = class extends Base {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { gameWorker?: Worker }).gameWorker ??= this;
      }
    };
  });
  await startAs(page, "Agnes", /Valkyrie/);
  const glyphs = await page.evaluate(
    () =>
      new Promise<number[] | null>((resolve) => {
        const worker = (window as unknown as { gameWorker: Worker }).gameWorker;
        worker.addEventListener("message", (ev: MessageEvent<{ type: string; id: number; glyphs: number[] | null }>) => {
          if (ev.data.type === "terrain" && ev.data.id === 7) resolve(ev.data.glyphs);
        });
        worker.postMessage({ type: "terrain", id: 7 });
      }),
  );
  expect(glyphs).toHaveLength(21 * 80);
  // the map the hero has seen, and never-seen squares, which differ
  expect(new Set(glyphs).size).toBeGreaterThan(1);
  // column 0 isn't on the map
  expect(glyphs!.filter((_, i) => i % 80 > 0).every((g) => g >= 0)).toBe(true);
  // the page carries on playing
  await expect(page.locator(".app[data-commanding]")).toBeAttached();
});
