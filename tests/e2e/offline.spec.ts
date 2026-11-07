import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const PROD = "http://127.0.0.1:5198/";

test("the production build plays offline after one visit", async ({ page, context }) => {
  const firebase: string[] = [];
  page.on("request", (r) => {
    const { hostname, pathname } = new URL(r.url());
    if (/googleapis|firebase|cloudfunctions|gstatic/.test(hostname) || /\/firebase-|recaptcha/.test(pathname)) firebase.push(r.url());
  });
  await page.goto(`${PROD}offline/`);
  await expect(page.getByRole("button", { name: /^Play Online/ })).toHaveCount(0);
  await expect(page.getByText("Ready to play offline")).toBeVisible({ timeout: 15_000 });
  // the first load isn't controlled yet; one reload puts the page under the worker
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  // the room's tiles and the page's faces come from the worker's copy too
  await expect.poll(() => page.evaluate(async () => (await fetch("/tiles/tiles64.png")).ok)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await document.fonts.ready, document.fonts.check("20px VT323") && document.fonts.check("14px 'IBM Plex Mono'")))).toBe(true);
  await page.getByLabel("Who are you?").fill(`Off${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Play Offline" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your character" });
  await expect(picker).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(picker).toBeVisible({ timeout: 15_000 });

  expect(firebase).toEqual([]);
  await page.goto(`${PROD}nowhere`);
  await expect(page.getByText("Ready to play offline")).toBeVisible();
});

test("a production build has each mode's pages, and its root only sends the visitor on", async ({ page }) => {
  const titles: Record<string, string> = {
    "online/": "nethack.app · Online",
    "online/play/": "nethack.app · Online",
    "online/watch/": "Watching · nethack.app · Online",
    "offline/": "nethack.app · Offline",
    "offline/play/": "nethack.app · Offline",
    "offline/watch/": "Watching · nethack.app · Offline",
    "terms/": "Terms of Use · nethack.app",
    "privacy/": "Privacy Policy · nethack.app",
  };
  for (const [path, title] of Object.entries(titles)) {
    const response = await page.request.get(`${PROD}${path}`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`<title>${title}</title>`);
  }
  // the preview server answers a missing file with a page, where the host gives a 404 and the worker never installs
  const precache = JSON.parse(/const PRECACHE = (\[.*?\]);/.exec(readFileSync("dist/sw.js", "utf8"))![1]) as string[];
  expect(precache.filter((f) => !existsSync(`dist/${f.slice(2)}${f.endsWith("/") ? "index.html" : ""}`))).toEqual([]);
  const root = await (await page.request.get(PROD)).text();
  expect(root).not.toContain('id="app"');
  expect(root).toContain('property="og:image"');
  // the post links to a home, not the root, so each needs its own preview
  for (const home of ["offline/", "online/"]) expect(await (await page.request.get(`${PROD}${home}`)).text()).toContain('<meta property="og:image" content="https://nethack.app/social.jpg" />');
});
