import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { rebuildRecording } from "../rebuild-recording";

const FIRESTORE = "http://127.0.0.1:8299";
const EMULATORS = /^http:\/\/127\.0\.0\.1:(8299|9299|5299)\//;

const online = (page: Page) => page.addInitScript(() => localStorage.removeItem("nethack.fixedInputs"));

const gameId = (page: Page) => page.evaluate(() => document.documentElement.dataset.serverGame!);

async function untilPlaying(page: Page, name: string, mode: "online" | "offline" = "online") {
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  if (mode === "online") {
    await page.getByRole("button", { name: "Play Online" }).click();
    await page.getByRole("button", { name: /^Start New Game/ }).click();
  } else {
    await page.getByRole("button", { name: "Play Offline" }).click();
  }
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
  const [download] = await Promise.all([page.waitForEvent("download"), over.getByRole("button", { name: /download/i }).click()]);
  return readFileSync(await download.path(), "utf8");
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

interface Logged {
  method: string;
  turn?: number;
  seed?: number;
  now?: number;
  validTurns?: number;
  utcOffset?: number;
}

/** A game's request log, oldest first, read as the server would. */
async function requests(page: Page, game: string): Promise<Logged[]> {
  const response = await page.request.post(`${FIRESTORE}/v1/projects/demo-nethack/databases/(default)/documents:runQuery`, {
    headers: { Authorization: "Bearer owner" },
    data: { structuredQuery: { from: [{ collectionId: "requests", allDescendants: true }], orderBy: [{ field: { fieldPath: "receivedAt" } }] } },
  });
  type Fields = Record<string, { stringValue?: string; integerValue?: string; mapValue?: { fields: Record<string, { integerValue?: string }> } }>;
  const rows = (await response.json()) as { document?: { name: string; fields: Fields } }[];
  return rows
    .filter((r) => r.document?.name.includes(`/games/${game}/`))
    .map((r) => {
      const { method, input, output } = r.document!.fields;
      const number = (value?: { integerValue?: string }) => (value?.integerValue === undefined ? undefined : Number(value.integerValue));
      return {
        method: method.stringValue!,
        turn: number(input.mapValue?.fields.turn),
        seed: number(output.mapValue?.fields.seed),
        now: number(output.mapValue?.fields.now),
        validTurns: number(output.mapValue?.fields.validTurns),
        utcOffset: number(input.mapValue?.fields.utcOffset),
      };
    });
}

async function expectUploaded(page: Page, game: string, text: string): Promise<Stored[]> {
  await expect.poll(async () => rebuildRecording(await stored(page, game)), { timeout: 30_000 }).toBe(text);
  return stored(page, game);
}

/** Sweeps everything on the emulators, as the server's schedule would, and reads the game back. */
function sweepAndRead(game: string): { recording: string; batches: number; segments: number; finished?: boolean; validation?: Record<string, unknown> } {
  return JSON.parse(execFileSync("node", ["scripts/sweep-and-read.mjs", game], { cwd: "../nethack-server/functions", encoding: "utf8" }));
}

test("a game swept during and after play can be rebuilt from its archive and replayed", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Sw${Date.now() % 100000}`);
  const game = await gameId(page);
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
  await online(page);
  await untilPlaying(page, `Up${Date.now() % 100000}`);
  const game = await gameId(page);
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
  await online(page);
  await untilPlaying(page, `Re${Date.now() % 100000}`);
  const game = await gameId(page);
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
  await online(page);
  let dropped = 0;
  await page.route(/\/documents:commit/, async (route) => {
    if (dropped++ % 2) return route.continue();
    await route.fetch();
    await route.abort();
  });
  await untilPlaying(page, `Lo${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 3);
  const text = await quit(page);
  await expect.poll(() => dropped, { timeout: 15_000 }).toBeGreaterThan(1);
  // sent again and taken as already there, which is the end of it
  await expect.poll(() => page.evaluate((game) => localStorage.getItem(`nethack.upload.game.${game}`), game), { timeout: 15_000 }).toBeNull();
  await expectUploaded(page, game, text);
});

test("a game's seeds, time and id are the server's, and every ask is in its log", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Se${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 2);
  const text = await quit(page);
  await expectUploaded(page, game, text);

  expect(text).toContain(` uuid ${game}\n`);
  const log = await requests(page, game);
  expect(log[0].method).toBe("startGame");
  const asked = log.filter((r) => r.method === "seed");
  expect(asked[0]).toMatchObject({ turn: 0, validTurns: 100 });
  const seeds = [...text.matchAll(/^\d+ seed (\d+)$/gm)].map((m) => Number(m[1]));
  // a new game asks once at its start: the core's seeds count up from that one answer
  expect(seeds.length).toBeGreaterThan(1);
  expect(seeds).toEqual(seeds.map((_, i) => (asked[0].seed! + i) >>> 0));
  const times = new Set(asked.map((r) => r.now));
  for (const [, now] of text.matchAll(/^\d+ now (\d+)$/gm)) expect(times).toContain(Number(now));
});

test("a game saved and restored carries on as the same game", async ({ page }) => {
  await online(page);
  const name = `Sv${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await pass(page, 3);
  await page.keyboard.press("#");
  await page.keyboard.type("save");
  await page.keyboard.press("Enter");
  await page.keyboard.press("y");
  await page.waitForURL((url) => !url.pathname.includes("/play"), { timeout: 15_000 });

  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("/save");
  await page.goto(`/play/?online&name=${name}`);
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  expect(await gameId(page)).toBe(game);
  expect((await requests(page, game)).filter((r) => r.method === "seed").some((r) => r.turn! > 0)).toBe(true);
  await pass(page, 2);
  const text = await quit(page);
  expect(text).toMatch(/ session restore /);
  await expectUploaded(page, game, text);
  expect((await requests(page, game)).filter((r) => r.method === "startGame")).toHaveLength(1);
});

test("a new game gets its own ID, and the old one stays in flight to come back to", async ({ page }) => {
  await online(page);
  const name = `De${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const old = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, old)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  const before = rebuildRecording(await stored(page, old));

  await page.goto(`/play/?online&name=${name}&new`);
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor({ timeout: 15_000 });
  await expect.poll(() => gameId(page)).not.toBe(old);
  await page.goto(`/play/?online&name=${name}&game=${old}`);
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  expect(await gameId(page)).toBe(old);
  await pass(page, 2);
  const text = await quit(page);
  expect(text.startsWith(before)).toBe(true);
  await expectUploaded(page, old, text);
});

test("a game playing in two tabs tells the one that loses, and its lines stay out", async ({ page, context }) => {
  await online(page);
  const name = `Tw${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await pass(page, 1);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  const other = await context.newPage();
  await online(other);
  await other.goto(`/play/?online&name=${name}&game=${game}`);
  await other.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(other);
  await pass(other, 2);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(1);
  await pass(page, 2);
  await expect(page.getByRole("status").filter({ hasText: "played elsewhere" })).toBeVisible({ timeout: 10_000 });
});

/** Answers `resumeGame` with its recording changed. */
function changeRecording(page: Page, change: (recording: string) => string) {
  return page.route(/\/europe-west1\/user$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { result?: { recording?: string } };
    if (body.result?.recording) body.result.recording = change(body.result.recording);
    await route.fulfill({ response, json: body });
  });
}

const breakSum = (text: string, which: number) => {
  let seen = 0;
  return text.replace(/^(\d+ T \d+ )\w+$/gm, (line, head: string) => (seen++ === which ? `${head}ffff` : line));
};

test("a game that can't be replayed says so, and leaves the way to a new one", async ({ page }) => {
  await online(page);
  const name = `Lo${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const old = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, old)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  await changeRecording(page, (text) => breakSum(text, 0));
  await page.reload();
  const lost = page.getByRole("link", { name: "Start a new game" });
  await lost.waitFor({ timeout: 15_000 });
  await page.unroute(/\/europe-west1\/user$/);
  await lost.click();
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor({ timeout: 15_000 });
  await expect.poll(() => gameId(page)).not.toBe(old);
});

test("a game that goes differently goes back to where it last agreed, and carries on", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Cu${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 5);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  await changeRecording(page, (text) => breakSum(text, 3));
  await page.reload();
  await expect(page.locator(".messages")).toContainText(/gone back a little/i, { timeout: 15_000 });
  await page.unroute(/\/europe-west1\/user$/);
  await pass(page, 2);
  const text = await quit(page);
  await expect.poll(async () => rebuildRecording(await stored(page, game)), { timeout: 30_000 }).toBe(text);
  expect((await stored(page, game)).at(-1)!.id.startsWith("0002-")).toBe(true);
});

test("keys typed while a game comes back are dropped, not played unseen", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Bl${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  await page.route(/\/europe-west1\/user$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await page.locator(".app").waitFor({ timeout: 15_000 });
  // past the moment the page starts listening, and at a person's pace
  await page.waitForTimeout(400);
  await page.keyboard.type("sss", { delay: 120 });
  await page.locator(".app[data-commanding]").waitFor({ timeout: 15_000 });
  await page.unroute(/\/europe-west1\/user$/);
  const text = await quit(page);
  expect(text.slice(text.search(/^\d+ back /m))).toMatch(/^\d+ back \S+\n(?:(?!\d+ k ).*\n)*\d+ k 35\n/);
});

test("the clock after a game comes back is the server's", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Cl${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  const issued = 1_700_000_000;
  await page.route(/\/europe-west1\/user$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { result?: { recording?: string; now?: number } };
    if (body.result?.recording) body.result.now = issued;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  const text = await quit(page);
  const after = text.slice(text.search(/^\d+ back /m));
  expect(/^\d+ now (\d+)$/m.exec(after)?.[1]).toBe(String(issued));
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an online game leaves the offline last-game replay alone", async ({ page }) => {
  await online(page);
  await page.addInitScript(() => localStorage.setItem("nethack.lastGame", "offline game"));
  await untilPlaying(page, `Rp${Date.now() % 100000}`);
  await pass(page, 1);
  await quit(page);
  expect(await page.evaluate(() => localStorage.getItem("nethack.lastGame"))).toBe("offline game");
  await expect(page.getByRole("dialog", { name: "The game is over" }).getByRole("button", { name: /replay/i })).toHaveCount(0);
});

const ALL_MATCH = { seeds: true, times: true, id: true, timeZone: true, config: true };

test("a real game, reloaded, saved and restored, validates on the server's core as matching everything", async ({ page }) => {
  await online(page);
  const name = `Va${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await pass(page, 3);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  await pass(page, 3);
  await page.keyboard.press("#");
  await page.keyboard.type("save");
  await page.keyboard.press("Enter");
  await page.keyboard.press("y");
  await page.waitForURL((url) => !url.pathname.includes("/play"), { timeout: 15_000 });
  await page.goto(`/play/?online&name=${name}&game=${game}`);
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  await pass(page, 3);
  const text = await quit(page);
  await expectUploaded(page, game, text);

  const { validation } = sweepAndRead(game);
  expect(validation).toMatchObject({ replayed: true, matches: ALL_MATCH, cutBacks: 0 });
  expect(validation!.resumes).toBeGreaterThanOrEqual(2);
});

test("a real game that was cut back still validates, with the cut-back noted", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Vc${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 5);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  await changeRecording(page, (text) => breakSum(text, 3));
  await page.reload();
  await expect(page.locator(".messages")).toContainText(/gone back a little/i, { timeout: 15_000 });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await pass(page, 2);
  const text = await quit(page);
  await expectUploaded(page, game, text);

  const { validation } = sweepAndRead(game);
  expect(validation).toMatchObject({ replayed: true, matches: ALL_MATCH, cutBacks: 1 });
});

test("with the server out of reach, a new game waits and says so, then starts", async ({ page }) => {
  await online(page);
  await page.route(EMULATORS, (route) => route.abort());
  await page.goto(`/play/?online&new&name=Wa${Date.now() % 100000}`);
  const waiting = page.getByRole("status").filter({ hasText: "Waiting for the server" });
  await waiting.waitFor({ timeout: 15_000 });
  await page.unroute(EMULATORS);
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor({ timeout: 20_000 });
  await expect(waiting).toHaveCount(0);
});

test("the landing page lists games in flight, goes back to one, and starts a new one in the zone chosen", async ({ page }) => {
  await online(page);
  const name = `Li${Date.now() % 100000}`;
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(name);
  await page.getByRole("button", { name: "Play Online" }).click();
  await page.getByLabel("Time zone").selectOption({ label: "UTC+09:00" });
  await page.getByRole("button", { name: `Start New Game as ${name}` }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.waitFor({ timeout: 15_000 });
  await picker.getByRole("listbox", { name: "Role" }).getByRole("option", { name: /Valkyrie/ }).click();
  await picker.getByRole("listbox", { name: "Race" }).locator("button:not([disabled])").first().click();
  for (const group of ["Gender", "Alignment"]) await picker.getByRole("radiogroup", { name: group }).locator("button:not([disabled])").first().click();
  await page.keyboard.press("Enter");
  await afterPrompts(page);
  const game = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  await page.goto("/");
  await page.getByRole("button", { name: `Play Online as ${name}` }).click();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  expect(await gameId(page)).toBe(game);
  const text = await quit(page);
  expect(text).toMatch(/ session new \S+ tz=\+09:00/);

  // New Game reloads this page
  await page.reload();
  await expect.poll(async () => [undefined, game].includes(await gameId(page))).toBe(false);
  expect((await requests(page, await gameId(page)))[0].utcOffset).toBe(32400);

  await page.goto("/");
  await page.getByRole("button", { name: `Play Online as ${name}` }).click();
  await page.getByRole("button", { name: /^Start New Game/ }).waitFor();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
});

test("the landing page can be left while the server hangs, and focus follows the choice", async ({ page }) => {
  await page.route(/\/europe-west1\/user$/, () => {});
  await page.goto("/");
  const name = page.getByLabel("Who are you?");
  await name.fill(`Ha${Date.now() % 100000}`);
  await name.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Connecting" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.className)).toBe("online-choice");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: /^Play Online/ })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Play Offline/ })).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a long name fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByLabel("Who are you?").fill("W".repeat(31));
  await page.getByRole("button", { name: "Play Online" }).click();
  await page.getByRole("button", { name: /^Start New Game/ }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && !!document.querySelector(".landing") && document.querySelector(".landing")!.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the landing page says when it can't reach the server, and offline still plays", async ({ page }) => {
  await online(page);
  await page.route(EMULATORS, (route) => route.abort());
  await page.goto("/");
  await page.getByLabel("Who are you?").fill(`No${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play Online" }).click();
  await expect(page.getByRole("alert")).toContainText(/can't reach the server/i, { timeout: 15_000 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Play Offline" }).click();
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor({ timeout: 15_000 });
});

test("a game plays on while its lines can't be sent, saying so, and they follow when they can", async ({ page }) => {
  await online(page);
  await page.route(/\/documents:commit/, (route) => route.abort());
  await untilPlaying(page, `Of${Date.now() % 100000}`);
  const game = await gameId(page);
  await pass(page, 5);
  const notice = page.getByRole("status").filter({ hasText: "Not connected" });
  await expect(notice).toBeVisible({ timeout: 10_000 });
  const text = await quit(page);
  expect(text).toMatch(/ end over\n$/);
  expect(await stored(page, game)).toEqual([]);
  await page.unroute(/\/documents:commit/);
  await expectUploaded(page, game, text);
  await expect(notice).toHaveCount(0);
});

test("an offline game never reaches the server, and stays apart from an online one of the same name", async ({ page }) => {
  const name = `Ap${Date.now() % 100000}`;
  const reached: string[] = [];
  page.on("request", (r) => {
    if (EMULATORS.test(r.url())) reached.push(r.url());
  });
  await untilPlaying(page, name, "offline");
  await pass(page, 2);
  await page.waitForTimeout(1200);
  expect(reached).toEqual([]);

  await online(page);
  await page.goto(`/play/?online&name=${name}`);
  // a new character, not the offline game coming back
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor({ timeout: 20_000 });
  expect(await gameId(page)).toBeTruthy();
});
