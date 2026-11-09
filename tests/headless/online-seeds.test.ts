import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { FIRST_INJECTION, serverSeeds } from "../../src/online/authority";
import { OnlineSession } from "../../src/online/session";
import { replayRecording, Session } from "./harness";

const VALID_TURNS = 25;
const ASK_AHEAD_TURNS = 5;

/** The server's seed function, and every answer it gave. */
function server() {
  const answers: { turn: number; seed: number; inject: boolean }[] = [];
  const seedFor = (turn: number, inject: boolean) => createHmac("sha256", "secret").update(inject ? `inject:${turn}` : String(turn)).digest().readUInt32BE(0);
  return {
    answers,
    seed: async ({ turn, inject = false }: { turn: number; inject?: boolean }) => {
      const seed = seedFor(turn, inject);
      answers.push({ turn, seed, inject });
      return { seed, now: 1_800_000_000, validTurns: VALID_TURNS, askAheadTurns: ASK_AHEAD_TURNS };
    },
  };
}

/** An online game's seeds, the page's session and the worker's timetable, on a headless core in debug mode; or, with `back`, that game coming back from where it was left. */
async function onlineGame(back?: { answering: ReturnType<typeof server>; before: string[]; saves: Map<string, Uint8Array> }) {
  const answering = back?.answering ?? server();
  const before = back?.before ?? [];
  const page = new OnlineSession({
    seed: answering.seed,
    now: () => 0,
    waiting: () => {},
    listGames: async () => ({ games: [] }),
    startGame: async () => ({ game: "g", utcOffset: 0, options: "", config: "", now: 0 }),
    resumeGame: async () => null,
  });
  const holder: { g?: Session } = {};
  // the page knows the turn from the recording it's been sent
  const askSeed = (turn?: number) => {
    page.recorded([...before, ...(holder.g?.recorded ?? [])].join("\n"));
    return page.seed(turn);
  };
  const seeds = serverSeeds(0, before.join("\n"), askSeed);
  const g = await Session.start({ wizard: true, options: "pettype:none,time", seeds, ...(back ? { saves: back.saves, resume: true } : {}) });
  holder.g = g;
  return { g: await g.skipText(), answers: answering.answers, answering };
}

const lines = (g: Session) => g.recorded.map((l) => l.slice(l.indexOf(" ") + 1));
const turnsOf = (g: Session) => lines(g).filter((l) => l.startsWith("T ")).map((l) => Number(l.split(" ")[1]));
const lastTurn = (g: Session) => turnsOf(g).at(-1) ?? 0;

async function passTo(g: Session, turn: number) {
  // with m, as a plain search passes no turn once a monster is next to the hero; and no to debug mode's "Die?"
  while (lastTurn(g) < turn) {
    await g.send("ms");
    while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  }
  expect(lastTurn(g)).toBe(turn);
}

async function levelChange(g: Session) {
  await g.send("\x16");
  await g.getlin("2");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  expect(g.state.status.dungeon_level?.text).toBe("2");
}

/** The validator's rule (nethack-server `check.ts`): each `seed` line is a core answer, or one more than the `seed` line before it. */
function unexplainedSeeds(g: Session, answers: { seed: number; inject: boolean }[]): string[] {
  const given = new Set(answers.filter((a) => !a.inject).map((a) => a.seed));
  let previous: number | null = null;
  const odd: string[] = [];
  for (const line of lines(g).filter((l) => l.startsWith("seed "))) {
    const seed = Number(line.split(" ")[1]);
    if (!given.has(seed) && (previous === null || seed !== (previous + 1) >>> 0)) odd.push(line);
    previous = seed;
  }
  return odd;
}

/** Each `reseed` line, the turn it went in at, and the timetable it records. */
function reseeds(g: Session): { turn: number; seed: number; next: number; ahead: number }[] {
  let turn = 0;
  const out: { turn: number; seed: number; next: number; ahead: number }[] = [];
  for (const l of lines(g)) {
    if (l.startsWith("T ")) turn = Number(l.split(" ")[1]);
    const [tag, seed, next, ahead] = l.split(" ");
    if (tag === "reseed") out.push({ turn, seed: Number(seed), next: Number(next), ahead: Number(ahead) });
  }
  return out;
}

/** What a validator would check: following the chain from turn 1, each seed is the server's for its point and sits at the first `T` at or after it and after the one before. */
function offTimetable(g: Session, answers: { turn: number; seed: number; inject: boolean }[]): string[] {
  const turns = turnsOf(g);
  const odd: string[] = [];
  let point = FIRST_INJECTION;
  let previous = -1;
  for (const r of reseeds(g)) {
    const at = turns.find((t) => t >= point && t > previous);
    previous = r.turn;
    if (r.turn !== at) odd.push(`seed for ${point} went in at ${r.turn}, not ${at}`);
    if (!answers.some((a) => a.inject && a.turn === point && a.seed === r.seed)) odd.push(`${r.seed} isn't the server's for ${point}`);
    if (r.next !== point + VALID_TURNS || r.ahead !== ASK_AHEAD_TURNS) odd.push(`timetable after ${point} is ${r.next} ${r.ahead}`);
    point = r.next;
  }
  return odd;
}

async function finish(g: Session) {
  for (let i = 0; i < 5; i++) await g.send("ms");
  const replayed = await replayRecording(g.recorded.join("\n") + "\n");
  expect(replayed.error).toBeNull();
}

test("seeds go in on the server's timetable from turn 1, each where the one before said, and the game replays", async () => {
  const { g, answers } = await onlineGame();
  await passTo(g, 60);
  await finish(g);

  expect(reseeds(g).map((r) => r.turn)).toEqual([1, 26, 51]);
  expect(offTimetable(g, answers)).toEqual([]);
  expect(unexplainedSeeds(g, answers)).toEqual([]);
  // each asked for by its point, and none before its time: 76 is asked for at 71, after the game stops
  expect(answers.filter((a) => a.inject).map((a) => a.turn)).toEqual([1, 26, 51]);
});

test("a level change on the turn a seed to inject is asked for leaves the timetable as it was", async () => {
  const { g, answers } = await onlineGame();
  await passTo(g, 26 - ASK_AHEAD_TURNS);
  expect(answers.filter((a) => a.inject).map((a) => a.turn)).toEqual([1, 26]);
  await levelChange(g);
  await passTo(g, 30);
  await finish(g);

  expect(unexplainedSeeds(g, answers)).toEqual([]);
  expect(offTimetable(g, answers)).toEqual([]);
  expect(reseeds(g).map((r) => r.turn)).toEqual([1, 26]);
  const injected = new Set(answers.filter((a) => a.inject).map((a) => a.seed));
  expect(lines(g).filter((l) => l.startsWith("seed ") && injected.has(Number(l.split(" ")[1])))).toEqual([]);
});

test("a level change on the turn a seed is injected takes its own seeds from the server, and the timetable holds", async () => {
  const { g, answers } = await onlineGame();
  await passTo(g, 26);
  await levelChange(g);
  await finish(g);

  expect(unexplainedSeeds(g, answers)).toEqual([]);
  expect(offTimetable(g, answers)).toEqual([]);
  expect(answers.filter((a) => !a.inject).map((a) => a.turn)).toContain(26);
});

test("a game that comes back carries on with the timetable its last reseed line holds", async () => {
  const first = await onlineGame();
  await passTo(first.g, 40);
  expect(reseeds(first.g).map((r) => r.turn)).toEqual([1, 26]);
  const asked = first.answers.length;

  const second = await onlineGame({ answering: first.answering, before: first.g.recorded, saves: first.g.persisted });
  expect(second.g.recorded.some((l) => / back /.test(l))).toBe(true);
  await passTo(second.g, 80);
  const whole = { recorded: [...first.g.recorded, ...second.g.recorded] } as Session;

  // no fresh start at turn 1: the next is the point the last line named
  expect(first.answers.slice(asked).filter((a) => a.inject).map((a) => a.turn)).toEqual([51, 76]);
  expect(reseeds(whole).map((r) => r.turn)).toEqual([1, 26, 51, 76]);
  expect(offTimetable(whole, first.answers)).toEqual([]);
  expect(unexplainedSeeds(whole, first.answers)).toEqual([]);
}, 30_000);
