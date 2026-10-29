import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5199/",
    viewport: { width: 1400, height: 900 },
  },
  webServer: [
    {
      command: "npx vite --port 5199 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5199/",
      reuseExistingServer: !process.env.CI,
    },
    {
      // the service worker only registers in a production build
      command: "npx vite build && npx vite preview --port 5198 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5198/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
