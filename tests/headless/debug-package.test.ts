// PACKAGE=/path/to/package.json pnpm test debug-package replays a package downloaded from the app.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildDebugPackage, namedBones, readDebugPackage } from "../../src/port/debug-package";
import { replayRecording, Session } from "./harness";

if (process.env.PACKAGE)
  test("the package replays", async () => {
    const { recording, bones } = readDebugPackage(readFileSync(process.env.PACKAGE!, "utf8"));
    const replayed = await replayRecording(recording, new Map([...bones].map(([hash, data]) => [`bones/${hash}`, data])));
    expect(replayed.error).toBeNull();
  }, 600000);

test("a package holds what it takes to replay the game, bones included, with no other store", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await g.send("s".repeat(8));
  const data = Uint8Array.from({ length: 70000 }, (_, i) => i & 255);
  const hash = "a".repeat(64);
  const recording = `${[...g.persisted].filter(([k]) => k.startsWith("replay/")).map(([, v]) => new TextDecoder().decode(v)).join("")}`;

  const made = buildDebugPackage({ recording, files: { "0Tester.0": data }, bones: { [hash]: data }, shadow: { state: "following", turn: 3 } });
  const read = readDebugPackage(made);
  expect(read.recording).toBe(recording);
  expect(read.bones.get(hash)).toEqual(data);
  expect(JSON.parse(made)).toMatchObject({ shadow: { state: "following", turn: 3 } });
  expect((await replayRecording(read.recording)).error).toBeNull();
});

test("the bones a recording names are found, once each, and a look that found none isn't one", () => {
  const hash = "b".repeat(64);
  expect(namedBones(`1 nhrec 1\n2 bones bonD0.1 -\n3 bones bonD0.2 ${hash}\n4 bones bonD0.3 ${hash}\n`)).toEqual([hash]);
});
