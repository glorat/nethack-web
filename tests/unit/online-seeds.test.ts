import { beforeEach, expect, test } from "vitest";
import { FIRST_INJECTION, serverSeeds } from "../../src/online/authority";
import type { SeedReply } from "../../src/protocol";

let asks: (number | undefined)[];
let pending: Map<number | undefined, (reply: SeedReply) => void>;

/** Seeds from a server whose answers wait until `answer` gives them; the core's own asks name no turn, so take `coreTurn`. */
let coreTurn: number;
const askSeed = (turn?: number) => {
  asks.push(turn);
  return new Promise<SeedReply>((resolve) => pending.set(turn, resolve));
};
const answer = (turn: number | undefined, figures = { validTurns: 25, askAheadTurns: 5 }) => {
  const t = turn ?? coreTurn;
  pending.get(turn)!({ seed: t * 1000, now: 9000 + t, ...figures });
  pending.delete(turn);
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  asks = [];
  pending = new Map();
  coreTurn = 0;
});

test("a new game asks for its first seed to inject at once, puts it in at turn 1, and records where the next goes", async () => {
  const seeds = serverSeeds(1, "", askSeed);
  expect(asks).toEqual([FIRST_INJECTION]);
  answer(1);
  await settle();
  expect(await seeds.injectedSeed!(1, null)).toEqual({ seed: 1000, schedule: "26 5" });
  expect(asks).toEqual([1]);
});

test("each seed is asked for the turns the server said before its point, without stopping play, and goes in exactly there", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 26 5", askSeed);
  expect(asks).toEqual([]);
  for (let turn = 2; turn < 21; turn++) expect(seeds.injectedSeed!(turn, "26 5")).toBeNull();
  expect(asks).toEqual([]);
  expect(seeds.injectedSeed!(21, "26 5")).toBeNull();
  expect(asks).toEqual([26]);
  answer(26);
  await settle();
  // come, but not due: a client gets no choice of where it goes in
  for (let turn = 22; turn < 26; turn++) expect(seeds.injectedSeed!(turn, "26 5")).toBeNull();
  expect(await seeds.injectedSeed!(26, "26 5")).toEqual({ seed: 26000, schedule: "51 5" });
  expect(asks).toEqual([26]);
});

test("a command that passes both points asks there and waits, and the next counts from the point, not the turn", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 26 5", askSeed);
  expect(seeds.injectedSeed!(18, "26 5")).toBeNull();
  const waited = seeds.injectedSeed!(30, "26 5");
  expect(asks).toEqual([26]);
  expect(waited).toBeInstanceOf(Promise);
  answer(26);
  expect(await waited).toEqual({ seed: 26000, schedule: "51 5" });
});

test("the server's figures in each reply set the next point", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 26 5", askSeed);
  seeds.injectedSeed!(21, "26 5");
  answer(26, { validTurns: 10, askAheadTurns: 2 });
  await settle();
  expect(await seeds.injectedSeed!(26, "26 5")).toEqual({ seed: 26000, schedule: "36 2" });
  expect(seeds.injectedSeed!(33, "36 2")).toBeNull();
  expect(seeds.injectedSeed!(34, "36 2")).toBeNull();
  expect(asks).toEqual([26, 36]);
});

test("a game that comes back carries on with the timetable its recording holds, waiting for a point already passed", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 126 5\n", askSeed);
  expect(asks).toEqual([]);
  const waited = seeds.injectedSeed!(140, "126 5");
  expect(asks).toEqual([126]);
  answer(126);
  expect(await waited).toEqual({ seed: 126000, schedule: "151 5" });
});

test("a seed asked for a point the recording no longer holds, as after a cut-back, gives way to the point it does", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 126 5", askSeed);
  seeds.injectedSeed!(121, "126 5");
  expect(seeds.injectedSeed!(98, "101 5")).toBeNull();
  expect(asks).toEqual([126, 101]);
  answer(101);
  await settle();
  expect(await seeds.injectedSeed!(101, "101 5")).toEqual({ seed: 101000, schedule: "126 5" });
});

test("the core's own seeds, as on a level change, leave the timetable alone, and the clock never goes back", async () => {
  const seeds = serverSeeds(1, "1 reseed 7 26 5", askSeed);
  seeds.injectedSeed!(21, "26 5");
  coreTurn = 23;
  const level = seeds.randomSeed();
  answer(undefined);
  expect(await level).toBe(23000);
  expect(seeds.now()).toBe(9023);
  answer(26);
  await settle();
  expect(seeds.injectedSeed!(24, "26 5")).toBeNull();
  expect(await seeds.injectedSeed!(26, "26 5")).toEqual({ seed: 26000, schedule: "51 5" });
  expect(seeds.now()).toBe(9026);
  expect(asks).toEqual([26, undefined]);

  // answered before a later core seed, so its time is earlier, and the clock keeps the later
  seeds.injectedSeed!(46, "51 5");
  pending.get(51)!({ seed: 51000, now: 9040, validTurns: 25, askAheadTurns: 5 });
  coreTurn = 48;
  const later = seeds.randomSeed();
  answer(undefined);
  await later;
  expect(await seeds.injectedSeed!(51, "51 5")).toEqual({ seed: 51000, schedule: "76 5" });
  expect(seeds.now()).toBe(9048);
});
