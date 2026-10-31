import { defineConfig } from "@playwright/test";

const update = !!process.env.E2E_UPDATE;

export default defineConfig({
  testDir: "tests/e2e",
  // slow, and only at risk from changes to the service worker: run with pnpm run test:e2e:update
  testIgnore: update ? undefined : "update.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5199/",
    viewport: { width: 1400, height: 900 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://127.0.0.1:5199",
          localStorage: [
            {
              name: "nethack.fixedInputs",
              // a Monday at no full or new moon, which change what the game says and does
              value: JSON.stringify({ seed: 1, now: Date.UTC(2026, 5, 22, 12) / 1000, utcOffset: 0, uuid: "00000000-0000-4000-8000-000000000001" }),
            },
          ],
        },
      ],
    },
  },
  webServer: [
    {
      command: "pnpm exec vite --port 5199 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5199/",
      reuseExistingServer: !process.env.CI,
    },
    {
      // the service worker only registers in a production build
      command: "pnpm exec vite build && pnpm exec vite preview --port 5198 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5198/",
      reuseExistingServer: !process.env.CI,
    },
    ...(update
      ? [
          {
            // reads dist/, which the preview server above has built by the time the tests start
            command: "node scripts/serve-update-test.mjs 5197",
            url: "http://127.0.0.1:5197/__next-version",
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
  ],
});
