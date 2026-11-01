import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { lastTurnIn, linesIn, type OnlineDeps, type OnlineGame, OnlineSession } from "../../src/port/online";

const START = { name: "Agnes", utcOffset: 3600, options: "name:Agnes", config: "rc", build: { version: "5.0.0", core: "abc" } };
const inFlight = (recording: string, game = "old"): OnlineGame => ({ game, utcOffset: 0, options: "o", config: "c", recording, generation: 2, now: 4000 });

let starts: number;
let resumes: { game?: string; name: string }[];
let found: OnlineGame | null;
let asks: { game: string; turn: number; sentAt: number }[];
let down: number;
let refuse: string | null;
let waits: boolean[];

function fail() {
  if (refuse) throw Object.assign(new Error("refused"), { code: refuse });
  if (down-- > 0) throw Object.assign(new Error("down"), { code: "functions/internal" });
}

const deps = (): OnlineDeps => ({
  now: () => 1000,
  waiting: (on) => waits.push(on),
  async startGame(input) {
    fail();
    starts++;
    return { game: `game-${starts}`, utcOffset: input.utcOffset, options: input.options, config: input.config, now: 4000 };
  },
  async resumeGame(input) {
    fail();
    resumes.push(input);
    return found;
  },
  async seed(input) {
    fail();
    asks.push(input);
    return { seed: input.turn * 1000, now: 5000 + asks.length, validTurns: 100 };
  },
});

const opened = async (want = {}) => {
  const session = new OnlineSession(deps());
  await session.open(START, want);
  return session;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  starts = 0;
  resumes = [];
  found = null;
  asks = [];
  down = 0;
  refuse = null;
  waits = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("with no game in flight, a new one starts from nothing", async () => {
  const game = await new OnlineSession(deps()).open(START, {});
  expect(game).toMatchObject({ game: "game-1", recording: "", generation: 1 });
});

test("a game in flight comes back with its recording, rather than another starting", async () => {
  found = inFlight("1 T 3 abcd\n");
  expect(await new OnlineSession(deps()).open(START, {})).toEqual(found);
  expect(starts).toBe(0);
});

test("the game asked for is the one asked about", async () => {
  await opened({ game: "wanted" });
  expect(resumes[0]).toMatchObject({ game: "wanted", name: "Agnes" });
});

test("a new game always starts one, whatever's in flight", async () => {
  found = inFlight("1 T 3 abcd\n");
  await opened({ fresh: true });
  expect(resumes).toEqual([]);
  expect(starts).toBe(1);
});

test("one ask serves a turn: each further seed is one more, and the time stays that answer's", async () => {
  const session = await opened();
  session.recorded("1 T 7 abcd");
  expect(await session.seed()).toEqual({ seed: 7000, now: 5001 });
  expect(await session.seed()).toEqual({ seed: 7001, now: 5001 });
  expect(asks).toEqual([{ game: "game-1", turn: 7, sentAt: 1000 }]);
});

test("a turn with no seeds asks nothing; a new turn that wants one asks and counts from its own answer", async () => {
  const session = await opened();
  await session.seed();
  session.recorded("1 k 106\n1 T 1 abcd\n1 k 106\n1 T 2 abcd");
  expect(await session.seed()).toEqual({ seed: 2000, now: 5002 });
  expect(asks.map((a) => a.turn)).toEqual([0, 2]);
});

test("the count wraps at 32 bits", async () => {
  const session = await opened();
  (session as unknown as { base: object }).base = { turn: 0, seed: 0xffffffff, now: 1, used: 0 };
  expect((await session.seed()).seed).toBe(0xffffffff);
  expect((await session.seed()).seed).toBe(0);
});

test("a game coming back asks for the turn in its recording", async () => {
  found = inFlight("1 T 41 abcd\n1 k 1\n1 T 42 abcd\n1 k 2\n");
  expect((await (await opened()).seed()).seed).toBe(42000);
});

test("a recording cut back goes back to its turn", async () => {
  const session = await opened();
  session.recorded("1 T 42 abcd");
  session.recorded("1 T 40 abcd\n1 k 106");
  expect((await session.seed()).seed).toBe(40000);
});

test("no answer means waiting, however long, and saying so", async () => {
  const session = await opened();
  down = 2;
  let reply: { seed: number } | null = null;
  void session.seed().then((r) => (reply = r));
  await vi.advanceTimersByTimeAsync(1);
  expect(reply).toBeNull();
  expect(waits).toEqual([true]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(reply).toBeNull();
  await vi.advanceTimersByTimeAsync(5000);
  expect(reply).toEqual({ seed: 0, now: 5001 });
  expect(waits).toEqual([true, false]);
});

test("an answer that won't change isn't asked for again", async () => {
  const session = await opened();
  refuse = "functions/not-found";
  await expect(session.seed()).rejects.toThrow("refused");
  expect(waits).toEqual([]);
});

test("starting a game waits for the server too", async () => {
  down = 2;
  const opening = new OnlineSession(deps()).open(START, {});
  await vi.advanceTimersByTimeAsync(10000);
  expect((await opening).game).toBe("game-1");
  expect(waits).toEqual([true, false]);
});

test("the last turn is read from whole lines only", () => {
  expect(lastTurnIn("1 k 84\n1 T 3 abcd\n1 y \"T 9\"")).toBe(3);
  expect(lastTurnIn("1 seed 5")).toBeNull();
  expect(lastTurnIn('1 T 3 abcd\n1 l "x\u20281 T 99999"')).toBe(3);
  expect(lastTurnIn("1 T 3 abcd")).toBe(3);
});

test("lines are counted by their ends", () => {
  expect(linesIn("")).toBe(0);
  expect(linesIn("a\nb\n")).toBe(2);
});
