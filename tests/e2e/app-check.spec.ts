import { expect, type Page, test } from "@playwright/test";

const PROD = "http://127.0.0.1:5198/";
const RECAPTCHA = "https://www.google.com/recaptcha/enterprise.js*";
const FAKE_RECAPTCHA = `window.grecaptcha = { enterprise: {
  ready: (f) => f(),
  render: (_, options) => { window.solved = options.callback; return 1; },
  execute: async () => { window.solved(); return "recaptcha-token"; },
} };`;

test.use({ serviceWorkers: "block" });

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

/** Answers for the real project, so that a production build can play. Returns the App Check header each service got. */
async function fakeServer(page: Page): Promise<Map<string, string | undefined>> {
  const seen = new Map<string, string | undefined>();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  const answer = (pattern: string, service: string, body: (call: { method?: string; input?: { options?: string; config?: string } }) => object) =>
    page.route(pattern, (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      seen.set(service, request.headers()["x-firebase-appcheck"]);
      return route.fulfill({ json: body(request.postDataJSON().data ?? {}), headers: cors });
    });
  const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const idToken = `${jwtPart({ alg: "none" })}.${jwtPart({ sub: "player", exp: 4102444800 })}.x`;
  await answer("https://identitytoolkit.googleapis.com/**", "auth", () => ({ idToken, refreshToken: "r", expiresIn: "3600", localId: "player", users: [{ localId: "player" }] }));
  await answer("https://firestore.googleapis.com/**", "firestore", () => ({ writeResults: [{}], commitTime: new Date().toISOString() }));
  await answer("https://europe-west1-nethack-web-server.cloudfunctions.net/{user,publicApi}", "functions", ({ method, input }) => {
    const now = Math.floor(Date.now() / 1000);
    const answers: Record<string, object> = {
      listGames: { games: [] },
      profile: { signedIn: false, handle: null, request: null },
      leaderboard: { entries: [] },
      startGame: { game: "game", utcOffset: 0, options: input?.options, config: input?.config, now },
      seed: { seed: 1, now, validTurns: 1000 },
    };
    return { result: answers[method!] };
  });
  return seen;
}

async function startOnlineGame(page: Page) {
  await page.goto(`${PROD}online/`);
  await page.getByLabel("Who are you?").fill("Checked");
  await page.getByRole("button", { name: "Play Online" }).click();
  await page.getByRole("button", { name: /^Start New Game/ }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.waitFor({ timeout: 30_000 });
  // a human can be any role, and roles the race can\'t play are disabled
  await picker.getByRole("listbox", { name: "Race" }).getByRole("option", { name: "human" }).click();
  await picker.getByRole("listbox", { name: "Role" }).getByRole("option", { name: /Valkyrie/ }).click();
  await picker.getByRole("listbox", { name: "Race" }).locator("button:not([disabled])").first().click();
  for (const group of ["Gender", "Alignment"]) await picker.getByRole("radiogroup", { name: group }).locator("button:not([disabled])").first().click();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const playing = page.locator(".app[data-commanding]");
  for (;;) {
    await dialog.or(playing).first().waitFor();
    if (!(await dialog.isVisible())) break;
    const shown = await dialog.innerText();
    const button = dialog.getByRole("button", { name: /just start play|^OK$/i }).first();
    if (await button.isVisible()) await button.click();
    else await page.keyboard.press("Escape");
    await page.waitForFunction((shown) => document.querySelector<HTMLElement>('[role="dialog"]')?.innerText !== shown, shown, { polling: "raf" });
  }
  await page.keyboard.type("ms");
}

const reachedAll = (seen: Map<string, unknown>) => expect.poll(() => [...seen.keys()].sort(), { timeout: 30_000 }).toEqual(["auth", "firestore", "functions"]);

test("a production build sends App Check tokens with every kind of call", async ({ page }) => {
  const seen = await fakeServer(page);
  let exchange = "";
  await page.route(RECAPTCHA, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));
  await page.route("https://content-firebaseappcheck.googleapis.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    exchange = route.request().url() + route.request().postData();
    return route.fulfill({ json: { token: "app-check-token", ttl: "3600s" }, headers: cors });
  });
  await startOnlineGame(page);
  await reachedAll(seen);
  expect(exchange).toContain("exchangeRecaptchaEnterpriseToken");
  expect(exchange).toContain("recaptcha-token");
  expect(Object.fromEntries(seen)).toEqual({ auth: "app-check-token", firestore: "app-check-token", functions: "app-check-token" });
});

test("before an online game starts, the player is told finished games are public, and can read the terms and privacy policy", async ({ page }) => {
  await fakeServer(page);
  await page.route(RECAPTCHA, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));
  await page.route("https://content-firebaseappcheck.googleapis.com/**", (route) =>
    route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ json: { token: "app-check-token", ttl: "3600s" }, headers: cors }),
  );
  await page.goto(`${PROD}online/`);
  await page.getByLabel("Who are you?").fill("Checked");
  await page.getByRole("button", { name: "Play Online" }).click();
  await expect(page.getByRole("button", { name: /^Start New Game/ })).toBeVisible({ timeout: 30_000 });
  const notice = page.locator(".online-notice");
  await expect(notice).toContainText("Finished online games are public");
  await notice.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveTitle("Privacy Policy · NetHack");
  await page.getByRole("link", { name: "Terms of Use" }).click();
  await expect(page).toHaveTitle("Terms of Use · NetHack");
});

test("a finished online game can be deleted from the home, after saying what that means, and is told when it can't be yet", async ({ page }) => {
  await fakeServer(page);
  await page.route(RECAPTCHA, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));
  await page.route("https://content-firebaseappcheck.googleapis.com/**", (route) =>
    route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ json: { token: "app-check-token", ttl: "3600s" }, headers: cors }),
  );
  const at = Date.parse("2026-11-01T12:00:00Z");
  const finished = (game: string, name: string, points: number) => ({ game, name, startedAt: at, endedAt: at, checked: true, result: { points, death: "killed by a newt", turns: 9 } });
  const games = [finished("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Agnes", 50), finished("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Bert", 40)];
  const deletes: string[] = [];
  let boards = 0;
  await page.route("https://europe-west1-nethack-web-server.cloudfunctions.net/{user,publicApi}", (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const { method, input } = request.postDataJSON().data;
    if (method === "leaderboard") boards++;
    if (method === "finishedGames") return route.fulfill({ json: { result: { games } }, headers: cors });
    if (method !== "deleteGame") return route.fallback();
    deletes.push(input.game);
    if (deletes.length === 1) return route.fulfill({ status: 400, json: { error: { status: "FAILED_PRECONDITION", message: "not saved" } }, headers: cors });
    return route.fulfill({ json: { result: { status: "deleted" } }, headers: cors });
  });
  await page.goto(`${PROD}online/`);
  const panel = page.locator("section", { has: page.getByRole("heading", { name: "Your finished online games" }) });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  const remove = panel.getByRole("button", { name: /^Delete Agnes's game/ });
  await remove.click();
  const asking = panel.getByRole("group", { name: /^Delete Agnes's game/ });
  await expect(asking).toContainText("you can't undo it");
  await expect(asking.getByRole("button", { name: "Keep It" })).toBeFocused();
  await asking.getByRole("button", { name: "Keep It" }).click();
  await expect(asking).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(deletes).toEqual([]);

  await remove.click();
  await asking.getByRole("button", { name: "Delete Game" }).press("Enter");
  await expect(asking.getByRole("alert")).toContainText("still being saved");
  await expect(asking.getByRole("button", { name: "Delete Game" })).toBeFocused();
  await asking.getByRole("button", { name: "Keep It" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(2);

  const before = boards;
  await remove.click();
  await asking.getByRole("button", { name: "Delete Game" }).click();
  await expect(panel.getByRole("status")).toHaveText(/^Deleted Agnes's game of /);
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel.getByRole("listitem")).toContainText("Bert");
  expect(deletes).toEqual([games[0]!.game, games[0]!.game]);
  await expect.poll(() => boards).toBeGreaterThan(before);
});

test("a scored online game's link can be copied from the home, and one without a score has none", async ({ page }) => {
  await fakeServer(page);
  await page.route(RECAPTCHA, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));
  await page.route("https://content-firebaseappcheck.googleapis.com/**", (route) =>
    route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ json: { token: "app-check-token", ttl: "3600s" }, headers: cors }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => void ((window as unknown as { copied: string }).copied = text) } });
  });
  const at = Date.parse("2026-11-01T12:00:00Z");
  const games = [
    { game: "3f9c2a7e-5b1d-4c8e-9a62-7d0e4b81c3f5", name: "Agnes", startedAt: at, endedAt: at, checked: true, result: { points: 50, death: "killed by a newt", turns: 9 } },
    { game: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Bert", startedAt: at, endedAt: at, checked: false },
  ];
  await page.route("https://europe-west1-nethack-web-server.cloudfunctions.net/{user,publicApi}", (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    if (request.postDataJSON().data.method === "finishedGames") return route.fulfill({ json: { result: { games } }, headers: cors });
    return route.fallback();
  });
  await page.goto(`${PROD}online/`);
  const panel = page.locator("section", { has: page.getByRole("heading", { name: "Your finished online games" }) });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("button", { name: /^Share Bert's game/ })).toHaveCount(0);
  await panel.getByRole("button", { name: /^Share Agnes's game/ }).click();
  await expect(panel.getByRole("status")).toHaveText(/^Copied the link to Agnes's game of /);
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(`${new URL(PROD).origin}/g/P5wqflsdTI6aYn0OS4HD9Q`);
});

const exchange = (page: Page, answer: () => "token" | "brief" | "refuse" | "unreachable") =>
  page.route("https://content-firebaseappcheck.googleapis.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const kind = answer();
    if (kind === "unreachable") return route.abort();
    if (kind === "refuse") return route.fulfill({ status: 403, json: { error: { code: 403, status: "PERMISSION_DENIED" } }, headers: cors });
    return route.fulfill({ json: { token: "app-check-token", ttl: kind === "brief" ? "1s" : "3600s" }, headers: cors });
  });

const fakeRecaptcha = (page: Page) => page.route(RECAPTCHA, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));

const untilReturned = async (page: Page, check: () => Promise<boolean>) =>
  expect
    .poll(
      async () => {
        await page.keyboard.type("ms").catch(() => {});
        return check();
      },
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe(true);

for (const [failure, respond] of [
  ["can't load", (route) => route.abort()],
  ["loads but never gets ready", (route) => route.fulfill({ contentType: "text/javascript", body: "window.grecaptcha = { enterprise: { ready() {} } };" })],
] as [string, Parameters<Page["route"]>[1]][]) {
  test(`nothing goes to the server while reCAPTCHA ${failure}, and offline play is still there`, async ({ page }) => {
    const seen = await fakeServer(page);
    await page.route(RECAPTCHA, respond);
    await page.goto(`${PROD}online/`);
    await page.getByLabel("Who are you?").fill("Checked");
    await page.getByRole("button", { name: "Play Online" }).click();
    await expect(page.getByText("Connecting…")).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(page.getByText("Connecting…")).toBeVisible();
    expect([...seen.keys()]).toEqual([]);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".landing-bar").getByRole("link", { name: "Go Offline" })).toBeVisible();
  });
}

for (const [failure, respond] of [
  ["can't load", (route) => route.abort()],
  ["never gets ready", (route) => route.fulfill({ contentType: "text/javascript", body: "window.grecaptcha = { enterprise: { ready() {} } };" })],
] as [string, Parameters<Page["route"]>[1]][]) {
  test(`an online home whose reCAPTCHA ${failure} says it can't reach the server, and offers offline`, async ({ page }) => {
    const seen = await fakeServer(page);
    await page.route(RECAPTCHA, respond);
    await page.goto(`${PROD}online/`);
    const note = page.getByRole("alert").filter({ hasText: "Can't reach the server right now" });
    await expect(note).toBeVisible({ timeout: 15_000 });
    await expect(note.getByRole("link", { name: "Play Offline Instead" })).toBeVisible();
    expect([...seen.keys()]).toEqual([]);
  });
}

test("a browser App Check refuses is told why at the online home, and offered offline, before anything goes to the server", async ({ page }) => {
  const seen = await fakeServer(page);
  await fakeRecaptcha(page);
  await exchange(page, () => "refuse");
  await page.goto(`${PROD}online/`);
  const alert = page.getByRole("alert").filter({ hasText: "isn't available" });
  await expect(alert).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/online/");
  expect(new URL(page.url()).search).toBe("?refused");
  expect([...seen.keys()]).toEqual([]);
  await alert.getByRole("link", { name: "Go Offline" }).click();
  await expect(page).toHaveURL(/\/offline\/$/);
});

test("App Check refusing mid-game ends it at the landing page", async ({ page }) => {
  await fakeServer(page);
  await fakeRecaptcha(page);
  let answer: "brief" | "refuse" = "brief";
  await exchange(page, () => answer);
  await startOnlineGame(page);
  answer = "refuse";
  await untilReturned(page, async () => new URL(page.url()).search === "?refused");
  await expect(page.getByRole("alert").filter({ hasText: "isn't available" })).toBeVisible();
  // the landing page can show its alert before its own load event, which mustn't count as another
  await page.waitForLoadState("load");
  let loads = 0;
  page.on("load", () => loads++);
  await page.waitForTimeout(3000);
  expect(loads).toBe(0);
});

test("losing touch with App Check mid-game only shows the banner, and the lines follow when it's back", async ({ page }) => {
  const seen = await fakeServer(page);
  await fakeRecaptcha(page);
  let answer: "brief" | "unreachable" = "brief";
  await exchange(page, () => answer);
  await startOnlineGame(page);
  answer = "unreachable";
  const banner = page.getByText("Not connected");
  await untilReturned(page, () => banner.isVisible());
  expect(page.url()).toContain("game=");
  seen.clear();
  answer = "brief";
  await untilReturned(page, async () => seen.has("firestore") && !(await banner.isVisible()));
});

test("a batch refused while holding a token is taken as already there", async ({ page }) => {
  await fakeServer(page);
  await fakeRecaptcha(page);
  await exchange(page, () => "token");
  await page.route("https://firestore.googleapis.com/**", (route) =>
    route.fulfill(
      route.request().method() === "OPTIONS"
        ? { status: 204, headers: cors }
        : { status: 403, json: { error: { code: 403, status: "PERMISSION_DENIED", message: "Missing or insufficient permissions." } }, headers: cors },
    ),
  );
  await startOnlineGame(page);
  await expect(page.getByText(/being played elsewhere/)).toBeVisible({ timeout: 30_000 });
});

test("a dev build doesn't use App Check", async ({ page }) => {
  const appCheck: string[] = [];
  page.on("request", (r) => {
    if (/recaptcha|firebaseappcheck/.test(r.url())) appCheck.push(r.url());
  });
  await page.route(/^http:\/\/127\.0\.0\.1:9299\//, (route) => route.abort());
  await page.goto("/online/");
  await page.getByLabel("Who are you?").fill("Developer");
  const auth = page.waitForRequest(/^http:\/\/127\.0\.0\.1:9299\//);
  await page.getByRole("button", { name: "Play Online" }).click();
  await auth;
  expect(appCheck).toEqual([]);
});
