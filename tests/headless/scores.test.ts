import { expect, test } from "vitest";
import { replayRecording, Session } from "./harness";

/** Quits a game, declining the questions at its end. */
async function quit(g: Session): Promise<void> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else if (p?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
}

async function scores(): Promise<Map<string, Uint8Array>> {
  // seed 3 starts the hero beside some gold
  const g = await (await Session.start({ name: "Scorer", seed: 3 })).skipText();
  await g.send("h,");
  await quit(g);
  const saves = g.saves();
  expect(saves.get("record")?.length).toBeGreaterThan(0);
  return new Map([...saves].filter(([k]) => k === "record"));
}

/** Makes doppelgangers, which pick their forms from the high score list, and lets them change. */
async function doppelgangers(saves?: Map<string, Uint8Array>) {
  const g = await (await Session.start({ wizard: true, seed: 11, saves })).skipText();
  for (let i = 0; i < 6; i++) {
    await g.send("\x07");
    await g.getlin("doppelganger");
    while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  }
  for (let i = 0; i < 40 && !g.ended; i++) {
    await g.send("s");
    while (g.prompt && g.prompt.kind !== "poskey" && !g.ended)
      await (g.prompt.kind === "text" ? g.dismiss() : g.prompt.kind === "menu" ? g.answer({ kind: "menu", selection: [] }) : g.yn("n"));
  }
  return g;
}

test("what's on the high score list makes no difference to play", async () => {
  const without = await doppelgangers();
  const rng = without.rng;
  const messages = without.messages;
  const withScores = await doppelgangers(await scores());
  expect(withScores.rng).toBe(rng);
  expect(withScores.messages).toEqual(messages);
});

test("a game played with scores on the list replays where there are none", async () => {
  const saves = await scores();
  const g = await (await Session.start({ pageSeed: 7, options: "time", saves })).skipText();
  await g.send("s".repeat(10));
  await quit(g);
  expect((await replayRecording(g.recording!)).error).toBeNull();
});

test("a finished game still goes on the high score list, after what's there", async () => {
  const saves = await scores();
  const lines = (m: Map<string, Uint8Array>) => new TextDecoder().decode(m.get("record")).trim().split("\n").length;
  const g = await (await Session.start({ name: "Second", seed: 3, saves })).skipText();
  await g.send("h,");
  await quit(g);
  expect(lines(g.saves())).toBe(lines(saves) + 1);
});
