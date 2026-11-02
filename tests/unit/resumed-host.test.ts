import { expect, test } from "vitest";
import type { GameHost, Input } from "../../src/worker/game";
import type { ReplayHost } from "../../src/worker/replayer";
import { ResumedHost } from "../../src/worker/resume";

const KEY: Input = { key: 108 };
const LIVE_KEY: Input = { key: 46 };

/** A replay that answers from `inputs`, then waits, with how often anything waits on its end. */
function replayed(inputs: number) {
  let end!: () => void;
  const ended = new Promise<void>((resolve) => (end = resolve));
  let left = inputs;
  const host = {
    diverged: false,
    waitsOnEnd: 0,
    finished: {
      then: (done: () => unknown, failed?: (e: unknown) => unknown) => {
        host.waitsOnEnd++;
        return ended.then(done, failed);
      },
    },
    nextInput: () => (left-- > 0 ? Promise.resolve(KEY) : new Promise<Input>(() => {})),
    end,
  };
  return host;
}

const live = { nextInput: () => Promise.resolve(LIVE_KEY) } as unknown as GameHost;
const poskey = { kind: "poskey" } as Parameters<GameHost["nextInput"]>[0];

test("a long replay waits on its end once, not once for every answer", async () => {
  const replay = replayed(1000);
  const host = new ResumedHost(replay as unknown as ReplayHost, () => live);
  for (let i = 0; i < 1000; i++) expect(await host.nextInput(poskey)).toEqual(KEY);
  expect(replay.waitsOnEnd).toBeLessThanOrEqual(1);
});

test("the player takes over the wait the replay ran out on", async () => {
  const replay = replayed(1);
  const host = new ResumedHost(replay as unknown as ReplayHost, () => live);
  expect(await host.nextInput(poskey)).toEqual(KEY);
  const waiting = host.nextInput(poskey);
  replay.end();
  expect(await waiting).toEqual(LIVE_KEY);
  expect(await host.nextInput(poskey)).toEqual(LIVE_KEY);
});

test("a replay that went differently leaves the core waiting for good", async () => {
  const replay = replayed(0);
  const host = new ResumedHost(replay as unknown as ReplayHost, () => live);
  let answered = false;
  void host.nextInput(poskey).then(() => (answered = true));
  replay.diverged = true;
  replay.end();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(answered).toBe(false);
});
