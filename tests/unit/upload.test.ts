import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { batchId, LogUploader, MAX_BATCH, rebuildRecording, type UploadDeps, type UploadState, type UploadStore, type WriteResult } from "../../src/port/upload";

const GAME = "game-1";
const head = (n: number) => [`1 nhrec 1`, `1 session new 2026-01-26T12:00:00.000Z tz=+00:00`, `1 uuid ${GAME}`, ...Array.from({ length: n }, (_, i) => `1 k ${i}`)];
const text = (lines: string[]) => `${lines.join("\n")}\n`;

class Server {
  batches = new Map<string, { lines: string; sentAt: number }>();
  /** What the next writes do: "down" fails, "lost" stores but says it failed. */
  next: ("down" | "lost")[] = [];
  writes: string[] = [];
  async write(id: string, lines: string, sentAt: number): Promise<WriteResult> {
    this.writes.push(id);
    const fault = this.next.shift();
    if (fault === "down") return "failed";
    if (this.batches.has(id)) return "exists";
    this.batches.set(id, { lines, sentAt });
    return fault === "lost" ? "failed" : "stored";
  }
  rebuilt(): string {
    return rebuildRecording([...this.batches].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, b]) => ({ id, lines: b.lines })));
  }
}

function memoryStore(): UploadStore & { states: Map<string, UploadState> } {
  const states = new Map<string, UploadState>();
  return {
    states,
    load: (game) => structuredClone(states.get(game) ?? null),
    save: (game, state) => void (state ? states.set(game, structuredClone(state)) : states.delete(game)),
    finishedGames: () => [...states].filter(([, s]) => s.finished !== undefined).map(([g]) => g),
  };
}

let server: Server;
let store: ReturnType<typeof memoryStore>;
const deps = (): UploadDeps => ({ store, now: () => 1000, write: (_game, id, lines, sentAt) => server.write(id, lines, sentAt) });

beforeEach(() => {
  vi.useFakeTimers();
  server = new Server();
  store = memoryStore();
});
afterEach(() => vi.useRealTimers());

test("lines are sent one batch a second after they stop coming", async () => {
  const up = new LogUploader(deps());
  up.add(head(1));
  await vi.advanceTimersByTimeAsync(500);
  up.add(["1 k 1"]);
  await vi.advanceTimersByTimeAsync(999);
  expect(server.writes).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(server.writes).toEqual([batchId(1, 1)]);
  expect(server.rebuilt()).toBe(text([...head(1), "1 k 1"]));
});

test("lines come through in order however they're split, with a batch per send", async () => {
  const up = new LogUploader(deps());
  up.add(head(0));
  await vi.advanceTimersByTimeAsync(1000);
  up.add(["1 k 0"]);
  await vi.advanceTimersByTimeAsync(1000);
  up.add(["1 k 1", "1 k 2"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes).toEqual([batchId(1, 1), batchId(1, 4), batchId(1, 5)]);
  expect(server.rebuilt()).toBe(text(head(3)));
});

test("a failed write is tried again, with lines since then going in a later batch", async () => {
  const up = new LogUploader(deps());
  server.next = ["down"];
  up.add(head(0));
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.batches.size).toBe(0);
  up.add(["1 k 0"]);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(10000);
  expect(server.writes).toEqual([batchId(1, 1), batchId(1, 1), batchId(1, 4)]);
  expect(server.rebuilt()).toBe(text(head(1)));
});

test("a batch stored whose answer was lost isn't taken for anything but that batch", async () => {
  const up = new LogUploader(deps());
  server.next = ["lost"];
  up.add(head(0));
  await vi.advanceTimersByTimeAsync(1000);
  up.add(["1 k 0"]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(server.rebuilt()).toBe(text(head(1)));
});

test("a page closed with a batch on its way sends it again exactly, then the rest", async () => {
  let up = new LogUploader(deps());
  server.next = ["lost"];
  up.add(head(0));
  await vi.advanceTimersByTimeAsync(1000);
  vi.clearAllTimers();

  up = new LogUploader(deps());
  up.before(text(head(5)));
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes).toEqual([batchId(1, 1), batchId(1, 1), batchId(1, 4)]);
  expect(server.rebuilt()).toBe(text(head(5)));
});

test("lines not sent before the page closed are sent when the game comes back", async () => {
  let up = new LogUploader(deps());
  up.add(head(2));
  await vi.advanceTimersByTimeAsync(1000);
  vi.clearAllTimers();

  up = new LogUploader(deps());
  up.before(text(head(4)));
  up.add(["1 back x"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.rebuilt()).toBe(text([...head(4), "1 back x"]));
});

test("a recording cut back starts a generation, which replaces what came after the cut", async () => {
  let up = new LogUploader(deps());
  up.add(head(5));
  await vi.advanceTimersByTimeAsync(1000);

  up = new LogUploader(deps());
  up.before(text(head(2)));
  up.add(["1 back x", "1 k 99"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect([...server.batches.keys()].sort()).toEqual([batchId(1, 1), batchId(2, 6)]);
  expect(server.rebuilt()).toBe(text([...head(2), "1 back x", "1 k 99"]));
});

test("a cut back into a batch that may not have arrived sends the part of it that's kept", async () => {
  let up = new LogUploader(deps());
  up.add(head(0));
  await vi.advanceTimersByTimeAsync(1000);
  server.next = ["down"];
  up.add(["1 k 0", "1 k 1", "1 k 2"]);
  await vi.advanceTimersByTimeAsync(1000);
  vi.clearAllTimers();

  up = new LogUploader(deps());
  up.before(text(head(1)));
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.rebuilt()).toBe(text(head(1)));
});

test("a game that ended is sent at once, and if it can't be, on the next visit", async () => {
  let up = new LogUploader(deps());
  server.next = ["down"];
  up.add(head(1));
  up.finished(text([...head(1), "1 end over"]));
  await vi.advanceTimersByTimeAsync(0);
  expect(server.batches.size).toBe(0);
  vi.clearAllTimers();
  expect(store.finishedGames()).toEqual([GAME]);

  up = new LogUploader(deps());
  await vi.advanceTimersByTimeAsync(0);
  expect(server.rebuilt()).toBe(text([...head(1), "1 end over"]));
  expect(store.states.size).toBe(0);
});

test("a long backlog is split to fit a batch, and goes straight on", async () => {
  const long = "x".repeat(MAX_BATCH / 2);
  const up = new LogUploader(deps());
  up.add([...head(0), long, long, long]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.batches.size).toBeGreaterThan(1);
  for (const b of server.batches.values()) expect(b.lines.length).toBeLessThanOrEqual(MAX_BATCH);
  expect(server.rebuilt()).toBe(text([...head(0), long, long, long]));
});

test("a line too long for any batch stops the upload rather than being refused for good", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const up = new LogUploader(deps());
  up.add([...head(0), "x".repeat(MAX_BATCH + 1)]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes).toEqual([batchId(1, 1)]);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a game that can never replay isn't sent", async () => {
  const up = new LogUploader(deps());
  up.add(["1 nhrec 1", "1 session unrecorded 2026-01-26T12:00:00.000Z tz=+00:00", "1 k 0"]);
  up.add(["1 uuid other"]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(server.writes).toEqual([]);
});
