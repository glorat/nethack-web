import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { GameEvent, GameRequest, ReplayProgress } from "../../src/protocol";
import { applyEvents, type GameState, initialState } from "../../src/port/state";
import { ReplayRunner } from "../../src/worker/replay-runner";
import { type BootCore, replay } from "../../src/worker/replayer";
import { headlessBoot, until } from "./harness";

const TEXT = readFileSync(resolve(__dirname, "golden/valkyrie.txt"), "utf8");
// the last turn of the recording's first session, where a pause would take hold if the core never let go
const FIRST_SESSION_END = Math.max(
  ...[...TEXT.slice(0, TEXT.indexOf(" end save")).matchAll(/^\d+ T (\d+)\b/gm)].map((m) => Number(m[1])),
);

// a runner left going would boot cores that take over the shim's shared helpers from the next test's
const running: ReplayRunner[] = [];
afterEach(() => {
  for (const r of running.splice(0)) r.stop();
});

type Boots = (current: () => boolean) => BootCore;

/** Changes what the core posts, or how long it takes, as a long game's core would. */
function postingThrough(wrap: (post: (events: GameEvent[]) => void, events: GameEvent[]) => void) {
  return (boots: Boots): Boots => (current) => (session, files, makeHost) =>
    boots(current)(session, files, (m) => {
      const host = makeHost(m);
      const post = host.post.bind(host);
      host.post = (events) => wrap(post, events);
      return host;
    });
}

// the recording's first session can otherwise finish within one of the runner's yields
const slowCore = postingThrough((post, events) => {
  const until = Date.now() + 2;
  while (Date.now() < until);
  post(events);
});
const withBells = postingThrough((post, events) => post([{ type: "bell" }, ...events]));

async function runner(turnsPerSecond: number, onEvents: (events: GameEvent[]) => void = () => {}, through: (boots: Boots) => Boots = (boots) => boots) {
  const seen: { progress: ReplayProgress; prompt: GameRequest | null } = {
    progress: { turn: 0, playing: true, seeking: false, ended: null },
    prompt: null,
  };
  const r = new ReplayRunner(TEXT, through(await headlessBoot()), {
    events: onEvents,
    replay: (m) => {
      if (m.type === "replay_progress") seen.progress = m.progress;
      if (m.type === "replay_prompt") seen.prompt = m.request;
    },
  }, turnsPerSecond);
  running.push(r);
  r.start();
  return { r, seen };
}

test("at full speed, a pause takes hold at once, not at the session's end", async () => {
  const { r, seen } = await runner(Infinity, () => {}, slowCore);
  await until(() => seen.progress.turn > 5);
  r.control({ action: "pause" });
  await until(() => r.idle);
  expect(seen.progress.ended).toBeNull();
  expect(seen.progress.turn).toBeLessThan(FIRST_SESSION_END);
}, 30000);

test("a speed change and a seek straight after it leave the replay playing on", async () => {
  const { r, seen } = await runner(2);
  await until(() => seen.progress.turn >= 1);
  r.control({ action: "speed", turnsPerSecond: Infinity });
  r.control({ action: "seek", turn: 5 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 5);
  await until(() => r.idle);
  r.control({ action: "play" });
  await until(() => seen.progress.turn > 20);
}, 30000);

test("a step left pending doesn't stop the replay after a seek", async () => {
  const { r, seen } = await runner(Infinity);
  r.control({ action: "seek", turn: 10 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 10);
  r.control({ action: "speed", turnsPerSecond: 2 });
  r.control({ action: "step" });
  r.control({ action: "speed", turnsPerSecond: Infinity });
  r.control({ action: "seek", turn: 40 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 40);
  r.control({ action: "play" });
  await until(() => seen.progress.turn > 60);
}, 30000);

test("a step left pending doesn't stop the replay after a seek to its first turn", async () => {
  const { r, seen } = await runner(Infinity);
  r.control({ action: "seek", turn: 10 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 10);
  r.control({ action: "speed", turnsPerSecond: 2 });
  r.control({ action: "step" });
  r.control({ action: "speed", turnsPerSecond: Infinity });
  r.control({ action: "seek", turn: 1 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 1);
  r.control({ action: "play" });
  await until(() => seen.progress.turn > 20);
}, 30000);

test("a prompt flashing when the replay seeks doesn't stay up", async () => {
  const { r, seen } = await runner(2);
  await until(() => seen.prompt !== null);
  r.control({ action: "speed", turnsPerSecond: Infinity });
  r.control({ action: "seek", turn: 20 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 20);
  await until(() => r.idle);
  expect(seen.prompt).toBeNull();
}, 30000);

test("at speed, the page gets the game in a few sends, and ends up showing the same", async () => {
  let everyEvent = 0;
  let expected = initialState();
  await replay(TEXT, (await headlessBoot())(() => true), {
    post: (events) => {
      everyEvent += events.length;
      expected = applyEvents(expected, events);
    },
    pace: () => Promise.resolve(),
    delay: () => Promise.resolve(),
    bones: () => undefined,
  });

  let shown = initialState();
  let sends = 0;
  const { seen } = await runner(Infinity, (events) => {
    sends++;
    shown = applyEvents(shown, events);
  });
  await until(() => seen.progress.ended !== null);
  expect(seen.progress.ended).toEqual({ error: null });
  expect(sends).toBeLessThan(everyEvent / 10);
  expect(shown.map).toEqual(expected.map);
  expect(shown.status).toEqual(expected.status);
  expect(shown.messages).toEqual(expected.messages);
  expect(shown.cursor).toEqual(expected.cursor);
}, 30000);

test("a pause at speed shows the page all that has happened", async () => {
  let shown = initialState();
  const { r, seen } = await runner(Infinity, (events) => {
    shown = applyEvents(shown, events);
  }, slowCore);
  await until(() => seen.progress.turn > 5);
  r.control({ action: "pause" });
  await until(() => r.idle);
  expect(seen.progress.ended).toBeNull();
  const { state } = r as unknown as { state: GameState };
  expect(shown.map).toEqual(state.map);
  expect(shown.status).toEqual(state.status);
}, 30000);

test("bells are left out at speed, and kept at 1×", async () => {
  const bellFirst = async (turnsPerSecond: number) => {
    const bells: number[] = [];
    const { seen } = await runner(turnsPerSecond, (events) => {
      if (events.some((e) => e.type === "bell")) bells.push(1);
    }, withBells);
    await until(() => seen.progress.turn >= 1);
    return bells.length;
  };
  expect(await bellFirst(2)).toBeGreaterThan(0);
  expect(await bellFirst(Infinity)).toBe(0);
}, 30000);

test("at 16× the turn still moves on the page as the game plays", async () => {
  const { seen } = await runner(32);
  await until(() => seen.progress.turn >= 5);
  expect(seen.progress.ended).toBeNull();
}, 30000);
