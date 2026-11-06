import { expect, test, vi } from "vitest";
import { expectedScoringMs, scoreGame, type ScoreDeps } from "../../src/online/score";
import { waitShown } from "../../src/ui/dialogs/GameOverDialog";

const GAME = "00000000-0000-4000-8000-000000000001";

function deps(answers: (object | { code: string })[]) {
  let now = 0;
  const asked: number[] = [];
  const d: ScoreDeps = {
    ask: async () => {
      asked.push(now);
      const answer = answers.shift()!;
      if ("code" in answer) throw answer;
      return answer;
    },
    sleep: async (ms) => {
      now += ms;
    },
    now: () => now,
  };
  return { d, asked };
}

test("a scored game gives its points and where to see it", async () => {
  const { d } = deps([{ result: { points: 1234 } }]);
  expect(await scoreGame(GAME, "https://nethack.app", 60_000, d)).toEqual({ kind: "scored", points: 1234, address: "https://nethack.app/g/AAAAAAAAQACAAAAAAAAAAQ" });
});

test("a game the server couldn't score says so", async () => {
  const { d } = deps([{}]);
  expect(await scoreGame(GAME, "", 60_000, d)).toEqual({ kind: "unscored" });
});

test("it asks again while the end is on its way or the server is busy with it, and leaves it for later past the time", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const waiting = deps([{ code: "functions/failed-precondition" }, { code: "functions/aborted" }, { result: { points: 5 } }]);
  expect(await scoreGame(GAME, "", 60_000, waiting.d)).toMatchObject({ kind: "scored", points: 5 });
  expect(waiting.asked).toEqual([0, 2000, 4000]);
  const slow = deps(Array.from({ length: 10 }, () => ({ code: "functions/aborted" })));
  expect(await scoreGame(GAME, "", 5000, slow.d)).toEqual({ kind: "later" });
  expect(slow.asked).toEqual([0, 2000, 4000]);
  const failed = deps([{ code: "functions/internal" }]);
  expect(await scoreGame(GAME, "", 60_000, failed.d)).toEqual({ kind: "later" });
  expect(failed.asked).toEqual([0]);
});

test("the wait moves steadily to the expected time, then ever slower, never reaching the end", () => {
  expect(waitShown(0, 1000)).toBe(0);
  expect(waitShown(500, 1000)).toBeCloseTo(0.45);
  expect(waitShown(1000, 1000)).toBeCloseTo(0.9);
  expect(waitShown(3000, 1000)).toBeGreaterThan(0.97);
  expect(waitShown(100_000, 1000)).toBeLessThan(1);
});

test("a longer recording is expected to take longer", () => {
  expect(expectedScoringMs(4000)).toBeGreaterThan(expectedScoringMs(100));
});
