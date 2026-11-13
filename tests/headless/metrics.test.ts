// Every replay metric over a golden game, checked against each other and the replay itself.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { METRICS } from "../../src/metrics/index";
import { stepper } from "../../src/metrics/step";
import { replayWatched } from "./harness";

test("replay metrics over a golden game", async () => {
  const text = readFileSync(resolve(__dirname, "golden/archeologist.txt"), "utf8");
  const counters = METRICS.map((m) => ({ name: m.name, counter: m.create({ pattern: /./ }) }));
  // the core's constants exist once it has booted
  const mg = () => (globalThis as { nethackGlobal?: { constants?: { MG?: Record<string, number> } } }).nethackGlobal?.constants?.MG ?? {};
  let toStep: ReturnType<typeof stepper> | null = null;
  let lastTurn = 0;
  let answers = 0;
  const error = await replayWatched(text, (seen) => {
    toStep ??= stepper(mg(), () => null);
    const step = toStep(seen);
    lastTurn = step.turn;
    answers++;
    for (const { counter } of counters) counter.step(step);
  });
  expect(error).toBeNull();
  const r = Object.fromEntries(counters.map(({ name, counter }) => [name, counter.result()])) as Record<string, any>;

  expect(answers).toBeGreaterThan(100);
  expect(r.end.turn).toBe(lastTurn);
  expect(r.depths.arrivals[1].turn).toBe(1);
  // the deepest level reached, by the depth metric and by where the hero stood
  const levels = (r.positions as [number, string][]).map(([, level]) => Number(/^Dlvl:(\d+)/.exec(level)?.[1] ?? 0));
  expect(Math.max(...levels)).toBeGreaterThanOrEqual(r.depths.maxDepth);
  expect(r.depths.maxDepth).toBeGreaterThan(1);
  // every turn from the first is put down to something
  const counted = Object.values(r.activity.turns as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(counted).toBe(lastTurn - 1);
  expect(r.messages.length).toBeGreaterThan(0);
  expect(r.stalls.keys).toBeGreaterThan(0);
  expect((r.positions as [number, string, string, number | null][]).every(([, , , x]) => x !== null)).toBe(true);
}, 120_000);
