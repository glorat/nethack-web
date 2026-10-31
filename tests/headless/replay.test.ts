import { expect, test } from "vitest";
import { replayCore, replayRecording, Session } from "./harness";

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

/** A few dozen turns of moving about, searching and looking through menus. */
async function play(g: Session): Promise<void> {
  await g.send("s".repeat(25));
  await g.send("hhjjkkll");
  await g.send("i");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.answer({ kind: "menu", selection: [] }));
  await g.send("s".repeat(10));
}

const messages = (s: { messages: { text: string }[] }) => s.messages.map((m) => m.text);

test("a finished game replays to its end, every check matching", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(g);
  await quit(g);
  expect(g.recording).toMatch(/ = \d+ @\d+,\d+ -?\d+ \{/);

  const replayed = await replayRecording(g.recording!);
  expect(replayed.error).toBeNull();
  expect(messages(replayed.state)).toEqual(messages(g.state));
  expect(replayed.state.status).toEqual(g.state.status);
});

test("a game saved, restored, left open and recovered replays through all of it", async () => {
  const first = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(first);
  await first.send("S");

  const second = await (await Session.start({ saves: first.saves(), pageSeed: 7, options: "time" })).skipText();
  await play(second);

  const third = await (await Session.start({ saves: second.persisted, pageSeed: 7, options: "time" })).skipText();
  await play(third);
  await quit(third);
  const text = third.recording!;
  expect(text).toMatch(/ session restore /);
  expect(text).toMatch(/ session recover /);

  const replayed = await replayRecording(text);
  expect(replayed.error).toBeNull();
  // the replay shows all three sessions, the last game only its own
  expect(messages(replayed.state).slice(-messages(third.state).length)).toEqual(messages(third.state));
  expect(replayed.state.status).toEqual(third.state.status);
});

test("a recording that was changed is caught where the game goes differently", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(g);
  await quit(g);
  // different seeds make a different level, which the moves then go differently in
  const tampered = g.recording!.replace(/^(\d+) seed 7$/gm, "$1 seed 8");

  const replayed = await replayRecording(tampered);
  expect(replayed.error?.message).toMatch(/^line \d+ /);
});

test("an answer that can't be read is reported at its own line", async () => {
  const g = await (await Session.start({ pageSeed: 7 })).skipText();
  await g.send("s");
  await quit(g);
  const line = g.recording!.split("\n").find((l) => / y "y"$/.test(l))!;
  const replayed = await replayRecording(g.recording!.replace(line, line.replace(/y "y"$/, "y zz")));
  expect(replayed.error?.message).toMatch(new RegExp(`^line ${line.split(" ")[0]} \\(y zz\\)`));
});

test("a line lost from the middle of a recording is caught", async () => {
  const g = await (await Session.start({ pageSeed: 7 })).skipText();
  await g.send("s");
  await quit(g);
  const lines = g.recording!.split("\n");
  lines.splice(10, 1);
  expect((await replayRecording(lines.join("\n"))).error?.message).toBe("line 11 is missing");
});

test("a game whose hero starts with other attributes is caught by them", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(g);
  await quit(g);
  // the fifth seed, taken once the first level is made, decides the hero's attributes and starting kit
  let n = 0;
  const tampered = g.recording!.replace(/^(\d+) seed 7$/gm, (line, seq) => (++n === 5 ? `${seq} seed 8` : line));
  expect(n).toBeGreaterThanOrEqual(5);

  const replayed = await replayRecording(tampered);
  const [, recorded, shown] = /^line \d+ \(= \d+ @\S+ \S+ (\{.*\})\): the core shows \d+ @\S+ \S+ (\{.*\})$/.exec(replayed.error?.message ?? "")!;
  const [was, is] = [JSON.parse(recorded), JSON.parse(shown)];
  expect(["ST", "DX", "CO", "IN", "WI", "CH"].some((a) => was[a] !== is[a])).toBe(true);
});

test("prompts the player cancelled replay as cancelled", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await g.send("i");
  await g.dismiss();
  await g.send("#");
  await g.answer({ kind: "ext_cmd", index: g.prompt!.kind === "ext_cmd" ? g.prompt.commands.find((c) => c.name === "name")!.index : -1 });
  if (g.prompt?.kind === "menu") await g.dismiss();
  await g.send("s");
  await quit(g);
  expect(g.recording).toMatch(/^\d+ m -$/m);

  const replayed = await replayRecording(g.recording!);
  expect(replayed.error).toBeNull();
  expect(replayed.state.status).toEqual(g.state.status);
});

test("a game that differs only in what the status line doesn't show is caught by its random generator", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await play(g);
  await g.send("s".repeat(25));
  await quit(g);
  const check = /^(\d+ = \d+ @\d+,\d+) -?\d+ /m;
  expect(g.recording).toMatch(check);
  const replayed = await replayRecording(g.recording!.replace(check, "$1 1 "));
  expect(replayed.error?.message).toMatch(/^line \d+ \(= /);
});

test("a replay on another build goes by its checks, not the bytes of its files", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time", shadowed: true })).skipText();
  await g.send("s".repeat(25));
  await quit(g);
  expect(g.recording).toMatch(/^\d+ lv [0-9a-f]{16}$/m);
  expect((await replayRecording(g.recording!.replace(/^(\d+ lv) \S+$/gm, `$1 ${"0".repeat(16)}`))).error).toBeNull();
});

test("a replay leaves the game's files byte for byte as the game did", async () => {
  const g = await (await Session.start({ pageSeed: 7, seedsVary: true, options: "time" })).skipText();
  await play(g);
  await g.send("s".repeat(10));
  const text = [...g.persisted].filter(([k]) => k.startsWith("replay/")).map(([, v]) => new TextDecoder().decode(v)).join("");

  const { files, error } = await replayCore(text);
  expect(error).toBeNull();
  const game = [...g.persisted.keys()].filter((k) => k.startsWith("0Tester"));
  expect(game.length).toBeGreaterThan(1);
  const differing = game.filter((k) => Buffer.compare(Buffer.from(g.persisted.get(k)!), Buffer.from(files.get(k) ?? new Uint8Array())) !== 0);
  expect(differing).toEqual([]);
});

test("hovering over the map during a game leaves the replay byte for byte the same", async () => {
  const g = await (await Session.start({ pageSeed: 7, seedsVary: true, options: "time" })).skipText();
  await play(g);
  for (let x = 1; x < 79; x += 3) for (let y = 1; y < 20; y += 3) g.describe(x, y);
  await g.send("s".repeat(25));
  for (let x = 2; x < 79; x += 5) g.describe(x, 5);
  await g.send("s".repeat(25));
  const text = [...g.persisted].filter(([k]) => k.startsWith("replay/")).map(([, v]) => new TextDecoder().decode(v)).join("");

  const { files, error } = await replayCore(text);
  expect(error).toBeNull();
  const game = [...g.persisted.keys()].filter((k) => k.startsWith("0Tester"));
  expect(game.filter((k) => Buffer.compare(Buffer.from(g.persisted.get(k)!), Buffer.from(files.get(k) ?? new Uint8Array())) !== 0)).toEqual([]);
});

test("items picked from a menu by address replay by name, and one that's gone stops the replay there", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "time" })).skipText();
  await g.send("D");
  await g.pick(/all types|^A /i);
  while (g.prompt?.kind === "menu" && !g.prompt.items.some((i) => /food ration/.test(i.text))) await g.pick(/all types|food/i);
  const picked = g.prompt?.kind === "menu" ? g.prompt.items.find((i) => /food ration/.test(i.text))! : null;
  expect(picked!.identifier).toBeGreaterThan(1000);
  await g.pick(/food ration/);
  while (g.prompt && g.prompt.kind !== "poskey") await g.dismiss();
  await g.send("s");
  await quit(g);
  const line = g.recording!.split("\n").find((l) => / m .*food ration/.test(l))!;
  expect(line).not.toContain(String(picked!.identifier));

  expect((await replayRecording(g.recording!)).error).toBeNull();
  const gone = await replayRecording(g.recording!.replace(line, line.replace(/food ration/g, "food rations")));
  expect(gone.error?.message).toMatch(/^line \d+ \(m .*no item/);
});
