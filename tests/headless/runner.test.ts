import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { GameRequest, ReplayProgress } from "../../src/protocol";
import { ReplayRunner } from "../../src/worker/replay-runner";
import { headlessBoot } from "./harness";

const TEXT = readFileSync(resolve(__dirname, "golden/valkyrie.txt"), "utf8");
// the last turn of the recording's first session, where a pause would take hold if the core never let go
const FIRST_SESSION_END = Math.max(
  ...[...TEXT.slice(0, TEXT.indexOf(" end save")).matchAll(/^\d+ T (\d+) /gm)].map((m) => Number(m[1])),
);

// a runner left going would boot cores that take over the shim's shared helpers from the next test's
const running: ReplayRunner[] = [];
afterEach(() => {
  for (const r of running.splice(0)) r.stop();
});

async function runner(turnsPerSecond: number) {
  const seen: { progress: ReplayProgress; prompt: GameRequest | null } = {
    progress: { turn: 0, playing: true, seeking: false, ended: null },
    prompt: null,
  };
  const r = new ReplayRunner(TEXT, await headlessBoot(), {
    events: () => {},
    replay: (m) => {
      if (m.type === "replay_progress") seen.progress = m.progress;
      if (m.type === "replay_prompt") seen.prompt = m.request;
    },
  }, turnsPerSecond);
  running.push(r);
  r.start();
  return { r, seen };
}

async function until(check: () => boolean, ms = 10000): Promise<void> {
  for (const end = Date.now() + ms; !check(); ) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("at full speed, a pause takes hold at once, not at the session's end", async () => {
  const { r, seen } = await runner(Infinity);
  await until(() => seen.progress.turn > 5);
  r.control({ action: "pause" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const held = seen.progress.turn;
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(seen.progress.turn).toBe(held);
  expect(seen.progress.ended).toBeNull();
  expect(held).toBeLessThan(FIRST_SESSION_END);
}, 30000);

test("a speed change and a seek straight after it leave the replay playing on", async () => {
  const { r, seen } = await runner(2);
  await until(() => seen.progress.turn >= 1);
  r.control({ action: "speed", turnsPerSecond: Infinity });
  r.control({ action: "seek", turn: 5 });
  await until(() => !seen.progress.seeking && seen.progress.turn >= 5);
  await new Promise((resolve) => setTimeout(resolve, 600));
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
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(seen.prompt).toBeNull();
}, 30000);
