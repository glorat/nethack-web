import { expect, test, vi } from "vitest";
import { loadServer } from "../../src/server/load";

test("a server client that can't load leaves no client and no error", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(loadServer(() => Promise.reject(new TypeError("Failed to fetch")))).resolves.toBeNull();
  warn.mockRestore();
});

test("the server client loads", async () => {
  expect((await loadServer())?.options.projectId).toBe("nethack-web-server");
});
