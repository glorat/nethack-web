import { expect, test } from "vitest";
import { replayRecording, Session } from "./harness";

async function quit(g: Session): Promise<void> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
}

async function play(g: Session): Promise<void> {
  await g.send("s".repeat(20));
  await g.send("hhjjkkll");
  await g.send("s".repeat(20));
}

/** Injects `seed` once, at the first turn from `from` on. */
function once(from: number, seed: number): (turn: number) => number | null {
  let given = false;
  return (turn) => {
    if (given || turn < from) return null;
    given = true;
    return seed;
  };
}

const lines = (text: string) => text.split("\n").filter(Boolean).map((l) => l.slice(l.indexOf(" ") + 1));
const turns = (text: string) => lines(text).filter((l) => l.startsWith("T "));
const lastTurn = (g: Session) => Number(turns(g.recorded.join("\n")).at(-1)!.split(" ")[1]);

test("a seed injected between turns changes the game from there, and the recording replays it", async () => {
  const plain = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(plain);
  await quit(plain);
  const injected = await (await Session.start({ pageSeed: 7, options: "time", injectSeed: once(10, 424242) })).skipText();
  await play(injected);
  await quit(injected);

  const text = injected.recording!;
  const recorded = lines(text);
  const at = recorded.indexOf("reseed 424242");
  expect(at).toBeGreaterThan(0);
  expect(recorded.filter((l) => l.startsWith("reseed "))).toHaveLength(1);
  // after that turn's checks, before its first command
  const turn = recorded.slice(0, at).filter((l) => l.startsWith("T ")).at(-1)!;
  expect(Number(turn.split(" ")[1])).toBeGreaterThanOrEqual(10);
  expect(recorded[at + 1]).toMatch(/^[kc] /);

  // the same game up to the seed, a different one after it
  const before = turns(text).indexOf(turn) + 1;
  expect(turns(text).slice(0, before)).toEqual(turns(plain.recording!).slice(0, before));
  expect(turns(text).slice(before)).not.toEqual(turns(plain.recording!).slice(before));

  const replayed = await replayRecording(text);
  expect(replayed.error).toBeNull();
  expect(replayed.state.status).toEqual(injected.state.status);
});

test("an injected seed that was changed or taken out of a recording stops its replay at the next turn", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time", injectSeed: once(10, 424242) })).skipText();
  await play(g);
  await quit(g);
  const text = g.recording!;

  for (const changed of [text.replace(/ reseed 424242\n/, " reseed 424243\n"), text.replace(/^.* reseed 424242\n/m, "")]) {
    expect(changed).not.toEqual(text);
    const replayed = await replayRecording(changed);
    expect(replayed.error?.message).toMatch(/sum/);
  }
});

test("a game left open after injected seeds comes back by replaying them, and goes on injecting", async () => {
  const first = await (await Session.start({ pageSeed: 7, options: "time", injectSeed: once(10, 424242) })).skipText();
  await play(first);

  const second = await (await Session.start({ saves: first.persisted, pageSeed: 7, options: "time", resume: true, injectSeed: once(lastTurn(first) + 5, 99) })).skipText();
  expect(second.state.status).toEqual(first.state.status);
  await play(second);
  await quit(second);
  const text = second.recording!;
  expect(text).toMatch(/ back /);
  expect(lines(text).filter((l) => l.startsWith("reseed "))).toEqual(["reseed 424242", "reseed 99"]);

  const replayed = await replayRecording(text);
  expect(replayed.error).toBeNull();
  expect(replayed.state.status).toEqual(second.state.status);
});

test("a seed the core can't take, or a hook that fails, leaves the game as it would have been", async () => {
  const plain = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(plain);
  for (const injectSeed of [once(10, 2 ** 32), once(10, -1), once(10, 1.5), () => { throw new Error("no seed"); }]) {
    const g = await (await Session.start({ pageSeed: 7, options: "time", injectSeed })).skipText();
    await play(g);
    expect(g.recorded.join("\n")).not.toMatch(/ reseed /);
    expect(g.state.status).toEqual(plain.state.status);
  }
});
