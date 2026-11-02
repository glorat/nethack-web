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
  await answer("https://europe-west1-nethack-web-server.cloudfunctions.net/user", "functions", ({ method, input }) => {
    const now = Math.floor(Date.now() / 1000);
    const answers: Record<string, object> = {
      listGames: { games: [] },
      startGame: { game: "game", utcOffset: 0, options: input?.options, config: input?.config, now },
      seed: { seed: 1, now, validTurns: 1000 },
    };
    return { result: answers[method!] };
  });
  return seen;
}

async function startOnlineGame(page: Page) {
  await page.goto(`${PROD}?online`);
  await page.getByLabel("Who are you?").fill("Checked");
  await page.getByRole("button", { name: "Play Online" }).click();
  await page.getByRole("button", { name: /^Start New Game/ }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await picker.waitFor({ timeout: 30_000 });
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

for (const [failure, respond] of [
  ["can't load", (route) => route.abort()],
  ["loads but never gets ready", (route) => route.fulfill({ contentType: "text/javascript", body: "window.grecaptcha = { enterprise: { ready() {} } };" })],
] as [string, Parameters<Page["route"]>[1]][]) {
  test(`an online game still works when reCAPTCHA ${failure}`, async ({ page }) => {
    const seen = await fakeServer(page);
    await page.route(RECAPTCHA, respond);
    await startOnlineGame(page);
    await reachedAll(seen);
  });
}

test("a dev build doesn't use App Check", async ({ page }) => {
  const appCheck: string[] = [];
  page.on("request", (r) => {
    if (/recaptcha|firebaseappcheck/.test(r.url())) appCheck.push(r.url());
  });
  await page.route(/^http:\/\/127\.0\.0\.1:9299\//, (route) => route.abort());
  await page.goto("/");
  await page.getByLabel("Who are you?").fill("Developer");
  const auth = page.waitForRequest(/^http:\/\/127\.0\.0\.1:9299\//);
  await page.getByRole("button", { name: "Play Online" }).click();
  await auth;
  expect(appCheck).toEqual([]);
});
