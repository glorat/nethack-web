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
  const over = await endGame(page);
  // the recording comes from the game's end, with what's still to send carrying on behind its replay
  await over.getByRole("button", { name: "Replay" }).click();
  const bar = page.getByRole("toolbar", { name: "Replay" });
  const [download] = await Promise.all([page.waitForEvent("download"), bar.getByRole("button", { name: "Download" }).click()]);
  return readFileSync(await download.path(), "utf8");
}

/** Quits the game, as far as the end screen. */
async function endGame(page: Page) {
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
  return over;
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
function sweepAndRead(game: string): { recording: string; batches: number; segments: number; finished?: boolean; validation?: Record<string, unknown>; xlog?: string; result?: Record<string, unknown> } {
  const out = execFileSync("node", ["lib/scripts/sweep-and-read.js", game], { cwd: "../nethack-server/functions", encoding: "utf8" });
  // the server's own logging goes to stdout too, ahead of the answer
  return JSON.parse(out.trim().split("\n").at(-1)!);
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
  const game = await gameId(page);
  await quit(page);
  await expect(page.locator(".stats-title")).toContainText("Rp");
  expect(await page.evaluate(() => localStorage.getItem("nethack.lastGame"))).toBe("offline game");
  // a reload watches it from the server, not the offline last game
  expect(new URL(page.url()).searchParams.get("game")).toBe(game);
  expect(new URL(page.url()).searchParams.has("replay")).toBe(true);
  await expect.poll(async () => (await stored(page, game)).map((b) => b.lines).join("\n"), { timeout: 10_000 }).toMatch(/\d+ end over/);
  await page.reload();
  await expect(page.getByText(/Turn \d+ of \d+/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".stats-title")).toContainText("Rp");
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

  const { validation, xlog, result } = sweepAndRead(game);
  expect(validation).toMatchObject({ replayed: true, matches: ALL_MATCH, cutBacks: 0 });
  expect(xlog).toContain(`name=${name}\t`);
  expect(result).toMatchObject({ name, death: "quit", role: "Val", player: expect.any(String), endedAt: expect.stringMatching(/Z$/) });
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
  const first = page.locator("form button").first();
  await expect(first).toHaveText(`Continue Online as ${name}`);
  await expect(first).toHaveClass(/primary/);
  await page.getByRole("button", { name: `Play Online as ${name}` }).click();
  await page.locator(".online-games").getByRole("link", { name: new RegExp(name) }).click();
  await page.locator(".stats-title").waitFor({ timeout: 15_000 });
  await afterPrompts(page);
  expect(await gameId(page)).toBe(game);
  const over = await endGame(page);
  await expect.poll(async () => (await stored(page, game)).map((b) => b.lines).join("\n"), { timeout: 10_000 }).toMatch(/ session new \S+ tz=\+09:00/);

  // New Game reloads this page
  await over.getByRole("button", { name: "New Game" }).click();
  await expect.poll(async () => [undefined, game].includes(await gameId(page))).toBe(false);
  expect((await requests(page, await gameId(page)))[0].utcOffset).toBe(32400);

  await page.goto("/");
  await page.getByRole("button", { name: `Play Online as ${name}` }).click();
  await page.getByRole("button", { name: /^Start New Game/ }).waitFor();
  await expect(page.locator(".online-games").getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
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

test("an online game in another tab doesn't hold up an offline game coming back", async ({ page, context }) => {
  const name = `Lk${Date.now() % 100000}`;
  await untilPlaying(page, name, "offline");
  await pass(page, 2);
  await page.waitForTimeout(1200);
  await page.close();

  const onlineTab = await context.newPage();
  await online(onlineTab);
  await onlineTab.addInitScript(() => localStorage.removeItem("nethack-web.name"));
  await untilPlaying(onlineTab, `${name}x`);

  const offline = await context.newPage();
  await offline.goto(`/play/?name=${name}`);
  await offline.locator(".app[data-commanding]").waitFor({ timeout: 20_000 });
  await expect(offline.getByRole("dialog")).toHaveCount(0);
});

test("a finished online game is listed on the landing page, scored once validated, and can be watched", async ({ page }) => {
  await online(page);
  const name = `Fi${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await pass(page, 2);
  await quit(page);
  await expect.poll(async () => (await stored(page, game)).map((b) => b.lines).join("\n"), { timeout: 10_000 }).toMatch(/\d+ end over/);

  await page.goto("/");
  const row = page.locator(".online-scores li", { hasText: name });
  await expect(row).toContainText("scored once the server has replayed the game", { timeout: 20_000 });

  expect(sweepAndRead(game).result).toBeTruthy();
  await page.reload();
  await expect(row).toContainText(/\(Val-\w+\): quit, turn \d+/, { timeout: 20_000 });

  await row.getByRole("link", { name: "Watch" }).click();
  await expect(page.getByText(/Turn \d+ of \d+/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".stats-title")).toContainText(name);
});

test("a game the server won't give to watch says so", async ({ page }) => {
  await online(page);
  await page.goto(`/play/?replay&online&game=${crypto.randomUUID()}`);
  await expect(page.getByText("This game can't be watched.")).toBeVisible({ timeout: 20_000 });
});

/** Signs in through the Auth emulator's stand-in for Google's popup, as a new account. */
async function signInWithGoogle(page: Page, email: string) {
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Sign In with Google" }).click()]);
  // the widget wires its buttons up only once it has loaded
  await popup.waitForLoadState();
  await popup.getByRole("button", { name: /add new account/i }).click();
  await popup.getByLabel(/email/i).fill(email);
  // signing in reloads the page
  await Promise.all([page.waitForEvent("load"), popup.getByRole("button", { name: /sign in with google/i }).click()]);
}

test("signing in keeps the anonymous player's games, and the name they chose", async ({ page }) => {
  await online(page);
  const name = `Si${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await pass(page, 2);
  await expect.poll(async () => (await stored(page, game)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);

  await page.goto("/");
  await signInWithGoogle(page, `${crypto.randomUUID()}@example.com`);
  await expect(page.locator(".landing-bar")).toContainText("Signed in");
  const handle = `Hd${crypto.randomUUID().slice(0, 8).replaceAll("-", "")}`;
  await page.getByLabel("Handle").fill(handle);
  await page.getByRole("button", { name: "Request Handle" }).click();
  await expect(page.locator(".landing-bar")).toContainText(`Signed in as ${handle}`);
  await expect(page.getByLabel("Handle")).toHaveCount(0);

  // the same uid, so the game played before signing in is still there to go back to
  await expect(page.locator("form button").first()).toHaveText(`Continue Online as ${name}`);
  // a name was kept from before, so it stays the player's choice
  await page.getByRole("button", { name: "Change Name" }).click();
  await expect(page.getByLabel("Who are you?")).toHaveValue(name);
});

test("a handle someone else has is refused, and another can be chosen", async ({ browser }) => {
  const handle = `Tk${crypto.randomUUID().slice(0, 8).replaceAll("-", "")}`;
  for (const outcome of ["granted", "taken"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("nethack-web.lastMode", "online"));
    await page.goto("/");
    await signInWithGoogle(page, `${crypto.randomUUID()}@example.com`);
    await page.getByLabel("Handle").fill(handle);
    await page.getByRole("button", { name: "Request Handle" }).click();
    if (outcome === "granted") {
      await expect(page.locator(".landing-bar")).toContainText(`Signed in as ${handle}`);
      // with no name of their own yet, the handle is where the player's starts
      await expect(page.getByLabel("Who are you?")).toHaveValue(handle);
    } else {
      await expect(page.getByRole("alert")).toHaveText(`${handle} is taken. Choose another.`);
      await page.getByLabel("Handle").fill(`${handle}b`);
      await page.getByRole("button", { name: "Request Handle" }).click();
      await expect(page.locator(".landing-bar")).toContainText(`Signed in as ${handle}b`);
    }
    await context.close();
  }
});

test("the leaderboard ranks a game under its player's handle, never the character's name", async ({ page }) => {
  await online(page);
  const name = `Lb${Date.now() % 100000}`;
  await untilPlaying(page, name);
  const game = await gameId(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.serverUid)).toBeTruthy();
  const uid = await page.evaluate(() => document.documentElement.dataset.serverUid!);

  await page.goto("/");
  await signInWithGoogle(page, `${crypto.randomUUID()}@example.com`);
  const handle = `Lb${crypto.randomUUID().slice(0, 8).replaceAll("-", "")}`;
  await page.getByLabel("Handle").fill(handle);
  await page.getByRole("button", { name: "Request Handle" }).click();
  await expect(page.locator(".landing-bar")).toContainText(`Signed in as ${handle}`);

  // far above any real score, so it leads whatever else the emulator holds; the validator would write it from a replay
  const points = 2e12 + Math.floor(Math.random() * 1e9);
  const result = (fields: object) =>
    page.request.patch(`${FIRESTORE}/v1/projects/demo-nethack/databases/(default)/documents/users/${uid}/games/${game}?updateMask.fieldPaths=projection.result`, {
      headers: { Authorization: "Bearer owner" },
      data: { fields },
    });
  const text = (value: string) => ({ stringValue: value });
  await result({ projection: { mapValue: { fields: { result: { mapValue: { fields: { points: { integerValue: String(points) }, role: text("Val"), race: text("Hum"), death: text("ascended"), name: text(name), endedAt: text(new Date().toISOString()) } } } } } } });
  try {
    await page.reload();
    const first = page.locator(".leaderboard li").first();
    await expect(first).toContainText(points.toLocaleString(), { timeout: 20_000 });
    await expect(first).toContainText(`${handle} (Val-Hum): ascended`);
    await expect(first).toContainText("(yours)");
    await expect(first).not.toContainText(name);
  } finally {
    await result({});
  }
});

test("the landing page shows the player's achievements, earned first, once they've earned one", async ({ page }) => {
  await online(page);
  await untilPlaying(page, `Ac${Date.now() % 100000}`);
  const earnedAt = Date.UTC(2026, 10, 1);
  const mines = { id: "entered-mines", name: "Into the Mines", description: "Entered the Gnomish Mines" };
  const ascended = { id: "ascended", name: "Ascended", description: "Ascended to demigodhood" };
  let achievements: object[] = [mines, { hidden: true }, ascended];
  await page.route(/\/europe-west1\/user$/, async (route) => {
    if ((route.request().postDataJSON() as { data?: { method?: string } }).data?.method !== "achievements") return route.fallback();
    await route.fulfill({ json: { result: { achievements } } });
  });
  const heading = page.getByRole("heading", { name: /Your achievements/ });
  const answered = page.waitForResponse((r) => /\/europe-west1\/user$/.test(r.url()) && (r.request().postDataJSON() as { data?: { method?: string } }).data?.method === "achievements");
  await page.goto("/");
  await answered;
  await page.waitForTimeout(200);
  await expect(heading).toHaveCount(0);

  achievements = [ascended, { hidden: true }, { ...mines, earned: { at: earnedAt, game: "11111111-1111-4111-8111-111111111111", turn: 1234 } }];
  await page.goto("/");
  const panel = page.locator("section", { has: heading });
  await expect(heading).toHaveText("Your achievements 1 of 3 earned");
  const date = await page.evaluate((at) => `${new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" })}, turn ${(1234).toLocaleString()}`, earnedAt);
  await expect(panel.getByRole("listitem")).toHaveText([`Into the MinesEntered the Gnomish Mines${date}`, "AscendedAscended to demigodhoodNot yet", "Hidden achievementShown once earned"]);
});
