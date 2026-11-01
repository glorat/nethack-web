import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { batchId, type LogPosition, LogUploader, MAX_BATCH, type UploadNotice, type WriteResult } from "../../src/port/upload";
import { rebuildRecording } from "../rebuild-recording";

const GAME = "game-1";
const numbered = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `1 k ${from + i}`);
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

let server: Server;
let notices: (UploadNotice | null)[];
const uploader = (position: LogPosition = { generation: 1, sent: 0 }) =>
  new LogUploader({ now: () => 1000, notice: (n) => notices.push(n), write: (_game, id, lines, sentAt) => server.write(id, lines, sentAt) }, GAME, position);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  server = new Server();
  notices = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("lines are sent in one batch a second after the first of them", async () => {
  const up = uploader();
  up.add(numbered(2), true);
  await vi.advanceTimersByTimeAsync(500);
  up.add(numbered(1, 3), true);
  await vi.advanceTimersByTimeAsync(499);
  expect(server.writes).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(server.writes).toEqual([batchId(1, 1)]);
  expect(server.rebuilt()).toBe(text(numbered(3)));
  expect(server.batches.get(batchId(1, 1))!.sentAt).toBe(1000);
});

test("steady play still sends", async () => {
  const up = uploader();
  for (let i = 1; i <= 10; i++) {
    up.add([`1 k ${i}`], true);
    await vi.advanceTimersByTimeAsync(300);
  }
  expect(server.writes.length).toBeGreaterThan(1);
});

test("new lines don't put off a retry", async () => {
  const up = uploader();
  server.next = ["down"];
  up.add(numbered(1), true);
  await vi.advanceTimersByTimeAsync(1000);
  for (let i = 0; i < 6; i++) {
    up.add(numbered(1, 2 + i), true);
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(server.batches.size).toBeGreaterThan(0);
});

test("a batch only ever ends where the core stopped to wait", async () => {
  const up = uploader();
  up.add(numbered(2), false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(server.writes).toEqual([]);
  up.add([], true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.rebuilt()).toBe(text(numbered(2)));
});

test("a failed write says so, is tried again exactly, and later lines wait for a later batch", async () => {
  const up = uploader();
  server.next = ["down"];
  up.add(numbered(2), true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(notices).toEqual(["unsent"]);
  up.add(numbered(1, 3), true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(notices.at(-1)).toBeNull();
  expect(server.batches.get(batchId(1, 1))!.lines).toBe(numbered(2).join("\n"));
  expect(server.rebuilt()).toBe(text(numbered(3)));
});

test("a batch stored whose answer was lost counts as sent when tried again", async () => {
  const up = uploader();
  server.next = ["lost"];
  up.add(numbered(2), true);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(5000);
  up.add(numbered(1, 3), true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(notices.at(-1)).toBeNull();
  expect(server.rebuilt()).toBe(text(numbered(3)));
});

test("a first write that finds its batch there means someone else is playing, and stops", async () => {
  server.batches.set(batchId(1, 3), { lines: "1 k other", sentAt: 1 });
  const up = uploader({ generation: 1, sent: 2 });
  up.before(text(numbered(2)));
  up.add(numbered(1, 3), true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(notices).toEqual(["elsewhere"]);
  up.add(numbered(1, 4), true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(server.writes).toHaveLength(1);
});

test("a game that comes back carries on from what the server holds", async () => {
  let up = uploader();
  up.add(numbered(3), true);
  await vi.advanceTimersByTimeAsync(1000);
  up = uploader({ generation: 1, sent: 3 });
  up.before(text(numbered(3)));
  up.add(["1 back", ...numbered(1, 4)], true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes).toEqual([batchId(1, 1), batchId(1, 4)]);
  expect(server.rebuilt()).toBe(text([...numbered(3), "1 back", "1 k 4"]));
});

test("a recording cut back starts a generation, which replaces what came after the cut", async () => {
  let up = uploader();
  up.add(numbered(5), true);
  await vi.advanceTimersByTimeAsync(1000);
  up = uploader({ generation: 1, sent: 5 });
  up.before(text(numbered(3)));
  up.add(["1 back"], true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes.at(-1)).toBe(batchId(2, 4));
  expect(server.rebuilt()).toBe(text([...numbered(3), "1 back"]));
});

test("a game that ended is sent at once, whole, and retried while the page lasts", async () => {
  const up = uploader();
  up.add(numbered(2), false);
  server.next = ["down"];
  up.finished(text([...numbered(2), "1 end over"]));
  await vi.advanceTimersByTimeAsync(0);
  expect(notices).toEqual(["unsent"]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(server.rebuilt()).toBe(text([...numbered(2), "1 end over"]));
});

test("a long backlog is split to fit a batch, and goes straight on", async () => {
  const line = `1 l "${"x".repeat(100 * 1024)}"`;
  const up = uploader();
  up.add([line, line, line], true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(server.writes).toEqual([batchId(1, 1), batchId(1, 3)]);
  expect(server.rebuilt()).toBe(text([line, line, line]));
});

test("a line too long for any batch stops the upload rather than being refused for good", async () => {
  const up = uploader();
  up.add(["x".repeat(MAX_BATCH + 1)], true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(server.writes).toEqual([]);
});

test("a session's last lines go at once, and settling waits for them", async () => {
  const up = uploader();
  let settled = false;
  up.add(["1 k 1"], true);
  void up.settled().then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(10);
  expect(settled).toBe(false);
  up.add(["1 end save"], true);
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true);
  expect(server.rebuilt()).toBe(text(["1 k 1", "1 end save"]));
});

test("settling doesn't wait for an upload that has stopped", async () => {
  server.batches.set(batchId(1, 1), { lines: "other", sentAt: 1 });
  const up = uploader();
  let settled = false;
  up.add(["1 end save"], true);
  void up.settled().then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true);
});
