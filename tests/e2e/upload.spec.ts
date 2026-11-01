import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { rebuildRecording } from "../../src/port/upload";

const FIRESTORE = "http://127.0.0.1:8299";
const EMULATORS = /^http:\/\/127\.0\.0\.1:(8299|9299|5299)\//;

/** A unique game, with the upload on. */
async function setUp(page: Page): Promise<string> {
  const uuid = crypto.randomUUID();
  await page.addInitScript((uuid) => {
    localStorage.setItem("nethack.upload", "1");
    localStorage.setItem("nethack.fixedInputs", JSON.stringify({ seed: 1, now: Date.UTC(2026, 5, 22, 12) / 1000, utcOffset: 0, uuid }));
  }, uuid);
  return uuid;
}

async function untilPlaying(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: /^Play/ }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.waitFor();
  await picker.getByRole("listbox", { name: "Role" }).getByRole("option", { name: /Valkyrie/ }).click();
  await picker.getByRole("listbox", { name: "Race" }).locator("button:not([disabled])").first().click();
  for (const group of ["Gender", "Alignment"]) await picker.getByRole("radiogroup", { name: group }).locator("button:not([disabled])").first().click();
  await page.keyboard.press("Enter");
  await afterPrompts(page);
}

async function afterPrompts(page: Page) {
  const dialog = page.getByRole("dialog");
  const playing = page.locator(".app[data-commanding]");
  for (;;) {
    await dialog.or(playing).first().waitFor();
    if (!(await dialog.isVisible())) return;
    const shown = await dialog.innerText();
    const button = dialog.getByRole("button", { name: /just start play|^OK$/i }).first();
    if (await button.isVisible()) await button.click();
    else await page.keyboard.press("Escape");
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
}

async function pass(page: Page, turns: number) {
  for (let i = 0; i < turns; i++) await page.keyboard.type("ms");
  await page.locator(".app[data-commanding]").waitFor({ state: "attached" });
}

async function quit(page: Page): Promise<string> {
  await page.keyboard.press("#");
  await page.keyboard.type("quit");
  await page.keyboard.press("Enter");
  await page.keyboard.press("y");
  const dialog = page.getByRole("dialog");
  const over = page.getByRole("dialog", { name: "The game is over" });
  for (;;) {
    await dialog.first().waitFor();
    if (await over.isVisible()) break;
    const shown = await dialog.innerText();
    await page.keyboard.press("n");
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
  return (await page.evaluate(() => localStorage.getItem("nethack.lastGame")))!;
}

interface Stored {
  id: string;
  lines: string;
  sentAt: string;
  receivedAt: string;
}

/** Every batch of a game under any account, read as the server would, past the rules. */
async function stored(page: Page, game: string): Promise<Stored[]> {
  const response = await page.request.post(`${FIRESTORE}/v1/projects/demo-nethack/databases/(default)/documents:runQuery`, {
    headers: { Authorization: "Bearer owner" },
    data: { structuredQuery: { from: [{ collectionId: "batches", allDescendants: true }] } },
  });
  const rows = (await response.json()) as { document?: { name: string; fields: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> } }[];
  return rows
    .filter((r) => r.document?.name.includes(`/games/${game}/`))
    .map((r) => ({
      id: r.document!.name.split("/").at(-1)!,
      lines: r.document!.fields.lines.stringValue!,
      sentAt: r.document!.fields.sentAt.integerValue!,
      receivedAt: r.document!.fields.receivedAt.timestampValue!,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function expectUploaded(page: Page, game: string, text: string): Promise<Stored[]> {
  await expect.poll(async () => rebuildRecording(await stored(page, game)), { timeout: 30_000 }).toBe(text);
  return stored(page, game);
}

/** Sweeps everything on the emulators, as the server's schedule would, and reads the game back. */
function sweepAndRead(game: string): { recording: string; batches: number; segments: number; finished?: boolean } {
  return JSON.parse(execFileSync("node", ["scripts/sweep-and-read.mjs", game], { cwd: "../nethack-server/functions", encoding: "utf8" }));
}

test("a game swept during and after play can be rebuilt from its archive and replayed", async ({ page }) => {
  const game = await setUp(page);
  await untilPlaying(page, `Sw${Date.now() % 100000}`);
  await pass(page, 3);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const during = sweepAndRead(game);
  expect(during.finished).toBe(false);
  expect(during.segments).toBe(1);
  const swept = (await stored(page, game)).length;
  expect(swept).toBeGreaterThan(0);

  await pass(page, 3);
  const text = await quit(page);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(swept);
  await expect.poll(() => page.evaluate((game) => localStorage.getItem(`nethack.upload.game.${game}`), game), { timeout: 15_000 }).toBeNull();
  const after = sweepAndRead(game);
  expect(after.recording).toBe(text);
  expect(after.finished).toBe(true);
  expect(after.segments).toBe(2);

  await page.evaluate((rebuilt) => localStorage.setItem("nethack.lastGame", rebuilt), after.recording);
  await page.goto("/play/?replay");
  const bar = page.getByRole("toolbar", { name: "Replay" });
  await bar.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(bar).toContainText("End of the recording", { timeout: 20_000 });
  await expect(bar).not.toContainText("no longer available");
});

test("a whole game can be rebuilt from the server and replayed", async ({ page }) => {
  const game = await setUp(page);
  await untilPlaying(page, `Up${Date.now() % 100000}`);
  await pass(page, 3);
  await page.waitForTimeout(1200);
  await pass(page, 3);
  const text = await quit(page);

  const batches = await expectUploaded(page, game, text);
  expect(batches.length).toBeGreaterThan(1);
  for (const b of batches) {
    expect(Number(b.sentAt)).toBeGreaterThan(0);
    expect(Date.parse(b.receivedAt)).toBeGreaterThan(0);
  }

  // the one sign-in serves both the database and the function
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.serverUid)).toBeTruthy();
  const uid = await page.evaluate(() => document.documentElement.dataset.serverUid!);
  const direct = await page.request.get(
    `${FIRESTORE}/v1/projects/demo-nethack/databases/(default)/documents/users/${uid}/games/${game}/batches?pageSize=1`,
    { headers: { Authorization: "Bearer owner" } },
  );
  expect(((await direct.json()) as { documents?: unknown[] }).documents).toHaveLength(1);

  await page.evaluate((rebuilt) => localStorage.setItem("nethack.lastGame", rebuilt), rebuildRecording(batches));
  await page.goto("/play/?replay");
  const bar = page.getByRole("toolbar", { name: "Replay" });
  await bar.getByLabel("Speed").selectOption({ label: "Max" });
  await expect(bar).toContainText("End of the recording", { timeout: 20_000 });
  await expect(bar).not.toContainText("no longer available");
});

test("a game reloaded part way through is still whole on the server", async ({ page }) => {
  const game = await setUp(page);
  await untilPlaying(page, `Re${Date.now() % 100000}`);
  await pass(page, 5);
  await page.waitForTimeout(1200);
  await pass(page, 2);
  await page.reload();
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  await pass(page, 3);
  const text = await quit(page);
  expect(text).toMatch(/^\d+ back /m);
  await expectUploaded(page, game, text);
});

test("a write that arrives but whose answer is lost isn't stored twice or lost", async ({ page }) => {
  const game = await setUp(page);
  let dropped = 0;
  await page.route(/\/documents:commit/, async (route) => {
    if (dropped++ % 2) return route.continue();
    await route.fetch();
    await route.abort();
  });
  await untilPlaying(page, `Lo${Date.now() % 100000}`);
  await pass(page, 3);
  const text = await quit(page);
  await expect.poll(() => dropped, { timeout: 15_000 }).toBeGreaterThan(1);
  // sent again and taken as already there, which is the end of it
  await expect.poll(() => page.evaluate((game) => localStorage.getItem(`nethack.upload.game.${game}`), game), { timeout: 15_000 }).toBeNull();
  await expectUploaded(page, game, text);
});

test("a game plays with the server out of reach, and is sent when it comes back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const game = await setUp(page);
  await page.route(EMULATORS, (route) => route.abort());
  await untilPlaying(page, `Of${Date.now() % 100000}`);
  await pass(page, 5);
  const text = await quit(page);
  expect(text).toMatch(/ end over\n$/);
  expect(await stored(page, game)).toEqual([]);

  await page.unroute(EMULATORS);
  await expectUploaded(page, game, text);
  expect(errors).toEqual([]);
});
