// replayWatched stops before every answer a recording holds, with that answer, and the replay still ends as recorded.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { replayRecording, replayWatched } from "./harness";

test("a watched replay stops at each answer, with the answer about to be given", async () => {
  const text = readFileSync(resolve(__dirname, "golden/archeologist.txt"), "utf8");
  const keys: number[] = [];
  let stops = 0;
  let last = "";
  const error = await replayWatched(text, ({ state, answer }) => {
    stops++;
    if (answer?.tag === "k") keys.push(Number(answer.rest));
    last = state.status.BL_TIME?.text ?? "";
  });
  expect(error).toBeNull();
  expect(keys).toEqual([...text.matchAll(/^\d+ k (\d+)$/gm)].map((m) => Number(m[1])));
  expect(stops).toBeGreaterThanOrEqual(keys.length);
  expect(last).toBe((await replayRecording(text)).state.status.BL_TIME?.text);
});

test("an error thrown by the watcher comes back as itself, not as the recording's", async () => {
  const text = readFileSync(resolve(__dirname, "golden/archeologist.txt"), "utf8");
  const oops = new Error("watcher failed");
  await expect(replayWatched(text, () => { throw oops; })).rejects.toBe(oops);
});
