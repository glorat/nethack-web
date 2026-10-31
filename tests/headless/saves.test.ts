import { expect, test, vi } from "vitest";
import { CANT_REPLAY } from "../../src/worker/game";
import { replayRecording, Session } from "./harness";

async function extended(g: Session, name: string) {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === name)!.index });
}

/** Quits through #quit, declining the end-of-game questions; returns the text windows shown. */
async function quit(g: Session): Promise<string[]> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  const shown: string[] = [];
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") {
      shown.push(...p.lines.map((l) => l.text));
      await g.dismiss();
    } else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
  return shown;
}

test("a game left unfinished comes back without asking", async () => {
  const left = await (await Session.start()).skipText();
  await left.send("llll");

  const next = await (await Session.start({ saves: left.persisted })).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
  expect(next.messages.some((t) => /old game in progress/i.test(t))).toBe(false);
});

test("a game left unfinished days ago still comes back", async () => {
  const left = await (await Session.start()).skipText();
  await left.send("llll");

  const next = await (await Session.start({ saves: left.persisted, savesAge: 4 })).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
});

test("a game left unfinished is asked about while another tab is playing", async () => {
  const left = await (await Session.start()).skipText();

  const next = await Session.start({ saves: left.saves(), otherTab: true });
  expect(next.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/old game in progress/i) });
});

test("a game comes back with the start time it had, in the page's time zone", async () => {
  const date = "2026-01-26T12:00:00Z";
  const utcOffset = 10 * 3600;
  // gold to score with, as a game with no points leaves no log entry
  const left = await (await Session.start({ seed: 3, date, utcOffset })).skipText();
  await left.send("h,");

  const next = await (await Session.start({ saves: left.saves(), seed: 3, date, utcOffset })).skipText();
  await quit(next);
  expect(next.messages.filter((t) => /Cannot open/.test(t))).toEqual([]);
  const xlog = new TextDecoder().decode(next.saves().get("xlogfile"));
  expect(xlog).toContain(`starttime=${Date.parse(date) / 1000}\t`);
});

test("a game that comes back while engulfed is still engulfed", async () => {
  const g = await (await Session.start({ wizard: true, options: "pettype:none" })).skipText();
  await g.send("\x07");
  await g.getlin("fog cloud");
  for (let i = 0; i < 100 && !g.messages.some((t) => /engulfs you/.test(t)); i++) {
    await g.send("ms");
    while (g.prompt?.kind === "yn" || g.prompt?.kind === "text") {
      if (g.prompt.kind === "yn") await g.yn("n");
      else await g.dismiss();
    }
  }
  expect(g.messages.some((t) => /engulfs you/.test(t))).toBe(true);

  const next = await (await Session.start({ saves: g.persisted, wizard: true, resume: true })).skipText();
  expect(next.resumeFailure).toBeNull();
  await next.send("\x18");
  if (next.prompt?.kind !== "menu") throw new Error("no attributes");
  const shown = next.prompt.items.map((item) => item.text);
  expect(shown.some((t) => /You are engulfed by the fog cloud/.test(t))).toBe(true);
});

/** Debug mode only: teleports to the first free square beside or on the altar. */
async function toAltar(g: Session, altar: { x: number; y: number }) {
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
    const there = await g.teleport(altar.x + dx, altar.y + dy).then(() => true, () => false);
    await g.skipText();
    if (there) return;
  }
  throw new Error("no free square by the altar");
}

test("a priest doesn't greet the hero again soon after", async () => {
  const g = await (await Session.start({ wizard: true, seed: 1, options: "pettype:none" })).skipText();
  await extended(g, "wizloaddes");
  await (await g.getlin("minetn-2")).skipText();
  // map the level
  await (await g.send("\x06")).skipText();
  const altar = g.state.map.find((c) => c && String.fromCharCode(c.ch) === "_")!;
  const outside = { ...g.state.cursor! };

  await toAltar(g, altar);
  expect(g.messages.some((t) => /intones/.test(t))).toBe(true);
  await g.teleport(outside.x, outside.y).catch(() => {});
  await (await g.send("ss")).skipText();
  const left = g.messages.length;
  await toAltar(g, altar);
  expect(g.messages.slice(left).some((t) => /intones/.test(t))).toBe(false);
});

/** Debug mode only: the luck ^X reports. */
async function luck(g: Session): Promise<string | undefined> {
  await g.send("\x18");
  if (g.prompt?.kind !== "menu") throw new Error("no attributes");
  const line = g.prompt.items.map((item) => item.text).find((t) => /lucky|luck is/.test(t));
  await g.dismiss();
  return line?.trim();
}

test("a game that comes back on a full moon is as lucky as it was", async () => {
  // a full moon
  const date = "2024-01-25T12:00:00";
  const g = await (await Session.start({ wizard: true, date, options: "pettype:none" })).skipText();
  expect(g.messages.some((t) => /Full moon tonight/.test(t))).toBe(true);
  await (await g.send("s")).skipText();
  const before = await luck(g);
  expect(before).toBe("You are lucky (1).");

  const next = await (await Session.start({ saves: g.persisted, wizard: true, date })).skipText();
  expect(next.resumeFailure).toBeNull();
  expect(await luck(next)).toBe(before);
});

test("what's been rubbed off the start of an engraving stays off", async () => {
  const g = await (await Session.start({ seed: 1, options: "pettype:none" })).skipText();
  // off the stairs, where nothing can be written
  await (await g.send("j")).skipText();
  await g.send("E");
  await (await g.yn("-")).skipText();
  await (await g.getlin(".x")).skipText();
  // stepping off smudges it: with seed 1 the leading '.' is rubbed out
  await (await g.send("kj:")).skipText();
  const read = g.messages.findLast((t) => t.startsWith("You read:"));
  expect(read).toBe('You read: "x".');
});

test("a meal on the floor that was stopped carries on after coming back", async () => {
  const g = await (await Session.start({ wizard: true, seed: 1, options: "pettype:none" })).skipText();
  await g.send("\x17");
  await (await g.getlin("food ration")).skipText();
  await g.send("d");
  await (await g.yn(g.state.inventory.find((i) => /food ration/.test(i.text))!.accelerator)).skipText();
  // a newt beside the hero stops the meal after a bite
  await g.send("\x07");
  await (await g.getlin("newt")).skipText();
  await g.send("e");
  await (await g.yn("y")).skipText();
  expect(g.messages.at(-1)).toBe("You stop eating the food ration.");

  const next = await (await Session.start({ saves: g.persisted, wizard: true, resume: true })).skipText();
  expect(next.resumeFailure).toBeNull();
  await next.send("e");
  await (await next.yn("y")).skipText();
  expect(next.messages).toContain("You resume your meal.");
});

test("restoring a save removes it, leaving the game to its recording", async () => {
  const saved = await (await Session.start({ pageSeed: 7 })).skipText();
  await saved.send("S");

  const restored = await (await Session.start({ pageSeed: 7, saves: saved.saves() })).skipText();
  expect(restored.messages.some((t) => /welcome back/i.test(t))).toBe(true);
  expect([...restored.saves().keys()]).not.toContain("0Tester");

  const next = await (await Session.start({ pageSeed: 7, saves: restored.persisted })).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
});

test("the high score list is kept between games", async () => {
  // seed 3 starts the hero beside some gold, and net gold counts as points
  const first = await (await Session.start({ seed: 3 })).skipText();
  await first.send("h,");
  expect(Number(first.state.status.BL_GOLD?.text.replace(/\D/g, ""))).toBeGreaterThan(1);
  await quit(first);
  expect(first.saves().get("record")?.length).toBeGreaterThan(0);

  const second = await (await Session.start({ saves: first.saves(), name: "Other" })).skipText();
  const scores = await quit(second);
  expect(scores.some((line) => /Tester-Val/.test(line))).toBe(true);
});

test("a restored game, and one brought back after that, show the saved state", async () => {
  const g = await (await Session.start({ pageSeed: 7, options: "pettype:none" })).skipText();
  const shieldOn = g.state.status.BL_AC?.text;
  await g.send("T");
  if (g.prompt?.kind === "yn") await g.yn(g.state.inventory.find((i) => /shield/.test(i.text))!.accelerator);
  const shieldOff = g.state.status.BL_AC?.text;
  expect(Number(shieldOff)).toBeGreaterThan(Number(shieldOn));
  await g.send("S");

  const restored = await (await Session.start({ pageSeed: 7, saves: g.saves() })).skipText();
  expect(restored.state.status.BL_AC?.text).toBe(shieldOff);
  expect(restored.state.equipment[5]).toEqual({ letter: "", tile: -1 });
  expect(restored.state.inventory.some((i) => /small shield/.test(i.text))).toBe(true);

  const recovered = await Session.start({ pageSeed: 7, saves: restored.persisted });
  await recovered.skipText();
  expect(recovered.resumeFailure).toBeNull();
  expect(recovered.state.status.BL_AC?.text).toBe(shieldOff);
  expect(recovered.state.equipment[5]).toEqual({ letter: "", tile: -1 });
});

/** A game with a save and a return by replay behind it, left open in the middle of its third session. */
async function leftOpen(options = { pageSeed: 7, seedsVary: true, options: "time" }) {
  const first = await (await Session.start(options)).skipText();
  await first.send("s".repeat(12) + "hhjj");
  await first.send("S");
  const second = await (await Session.start({ ...options, saves: first.saves() })).skipText();
  await second.send("llkks");
  const third = await (await Session.start({ ...options, saves: second.persisted, resume: true })).skipText();
  await third.send("s".repeat(8) + "jl");
  return { third, options };
}

test("a game left unfinished comes back by replay, as of the very last command", async () => {
  const { third, options } = await leftOpen();
  // takes no time, so only the recording has it
  await third.send("i");
  await third.dismiss();

  const next = await (await Session.start({ ...options, saves: third.persisted, resume: true })).skipText();
  expect(next.resumeFailure).toBeNull();
  expect(next.prompt).toBeNull();
  expect(next.rng).toBe(third.rng);
  expect(next.state.status).toEqual(third.state.status);
  expect(next.hero).toEqual(third.hero);
  expect([...next.persisted.keys()]).not.toContain("resuming");
});

test("a game that came back by replay records on, and replays and comes back again", async () => {
  const { third, options } = await leftOpen();
  const resumeOptions = { ...options, resume: true };
  const next = await (await Session.start({ ...resumeOptions, saves: third.persisted })).skipText();
  await next.send("s".repeat(6));
  const again = await (await Session.start({ ...resumeOptions, saves: next.persisted })).skipText();
  expect(again.resumeFailure).toBeNull();
  expect(again.rng).toBe(next.rng);
  await again.send("s".repeat(3));
  await again.send("S");

  const restored = await (await Session.start({ ...resumeOptions, saves: again.saves() })).skipText();
  expect(restored.messages.some((t) => /welcome back/i.test(t))).toBe(true);
  await restored.send("s");
  const text = [...restored.persisted].filter(([k]) => k.startsWith("replay/")).map(([, v]) => new TextDecoder().decode(v)).join("");
  expect(text.match(/^\d+ back \S+Z$/gm)).toHaveLength(3);
  expect((await replayRecording(text)).error).toBeNull();
});

test("what's typed after coming back by replay is what the next turn takes", async () => {
  const { third, options } = await leftOpen();
  const saves = third.persisted;
  const next = await (await Session.start({ ...options, saves, resume: true })).skipText();
  await next.send("sss");
  const twin = await (await Session.start({ ...options, saves, resume: true })).skipText();
  await twin.send("sss");
  expect(twin.rng).toBe(next.rng);
  expect(next.recorded.filter((l) => / k \d+$/.test(l))).toHaveLength(3);
});

test("a recording missing a chunk isn't replayed", async () => {
  const { third, options } = await leftOpen();
  const saves = new Map(third.persisted);
  const [file] = [...saves.keys()].filter((k) => k.startsWith("replay/"));
  saves.set(file.replace(/\d+$/, "000002"), saves.get(file)!);
  saves.delete(file);
  const next = await Session.start({ ...options, saves, resume: true });
  expect(next.prompt).toMatchObject({ kind: "yn", query: CANT_REPLAY });
});

async function cutBack(tamper: (lines: string[], at: number) => void, turns = "s".repeat(8)) {
  const { third, options } = await leftOpen();
  await third.send(turns);
  const saves = new Map(third.persisted);
  const [file] = [...saves.keys()].filter((k) => k.startsWith("replay/"));
  const lines = new TextDecoder().decode(saves.get(file)).split("\n");
  const at = lines.findLastIndex((l) => / T \d+ /.test(l));
  tamper(lines, at);
  saves.set(file, new TextEncoder().encode(lines.join("\n")));
  const next = await (await Session.start({ ...options, saves, resume: true })).skipText();
  return { next, file, at, lines };
}

test("a game whose replay fails a sum comes back from the last one that passed, and says so", async () => {
  const { next, file, at, lines } = await cutBack((l, at) => {
    l[at] = l[at].replace(/ \w{4}$/, /0000$/.test(l[at]) ? " 0001" : " 0000");
  });
  expect(next.resumeFailure).toBeNull();
  expect(next.messages.some((t) => /last point that could be checked/.test(t))).toBe(true);
  const turn = (t: string) => Number(/ T (\d+) /.exec(t)![1]);
  expect(Number(next.state.status.BL_TIME?.text)).toBe(turn(lines[lines.slice(0, at).findLastIndex((l) => / T \d+ /.test(l))]));
  await next.send("s");
  const kept = new TextDecoder().decode(next.persisted.get(file));
  expect(kept).not.toContain(lines[at]);
  expect(kept).toMatch(/ back /);
  // the game cut back replays, whole
  expect((await replayRecording(kept)).error).toBeNull();
});

test("a game whose replay fails a full check goes back past the sums, to the last full check", async () => {
  const { next, lines } = await cutBack((l) => {
    const at = l.findLastIndex((x) => / = /.test(x));
    l[at] = l[at].replace(/"HP":"\d+"/, '"HP":"999"');
  });
  expect(next.resumeFailure).toBeNull();
  expect(next.messages.some((t) => /last point that could be checked/.test(t))).toBe(true);
  const full = lines.filter((l) => / = /.test(l));
  expect(next.state.status.BL_TIME?.text).toBe(/ = (\d+) /.exec(full.at(-2)!)![1]);
});

test("a page closed during a replay asks first, and Recover replays it", async () => {
  const { third, options } = await leftOpen();
  const saves = new Map(third.persisted);
  saves.set("resuming", new Uint8Array());
  const next = await Session.start({ ...options, saves, resume: true });
  expect(next.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/old game in progress/i) });
  await (await next.yn("r")).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
  expect(next.state.status.BL_TIME?.text).toBe(third.state.status.BL_TIME?.text);
  await next.send("s");
  expect([...next.persisted.keys()]).not.toContain("resuming");
});

test("a game that can't replay is the player's to destroy or continue, with no replay after that", async () => {
  const { third, options } = await leftOpen();
  const saves = new Map(third.persisted);
  const [file] = [...saves.keys()].filter((k) => k.startsWith("replay/"));
  saves.set(file, new TextEncoder().encode(new TextDecoder().decode(saves.get(file)).replace(/^(\d+) seed \d+$/m, "$1 k 83")));

  const destroyed = await Session.start({ ...options, saves: new Map(saves), resume: true });
  expect(destroyed.prompt).toMatchObject({ kind: "yn", query: CANT_REPLAY, choices: "yrn" });
  await (await destroyed.yn("y")).skipText();
  expect(destroyed.state.status.BL_TIME?.text).toBe("1");
  expect(destroyed.recorded.some((l) => / session new /.test(l))).toBe(true);

  const continued = await Session.start({ ...options, saves, resume: true });
  await (await continued.yn("r")).skipText();
  expect(continued.recorded.some((l) => / session unrecorded /.test(l))).toBe(true);
  expect(continued.recorded.some((l) => / y "r"/.test(l))).toBe(false);
  await continued.send("s");
  const again = await Session.start({ ...options, saves: continued.persisted, resume: true });
  expect(again.prompt).toMatchObject({ kind: "yn", query: CANT_REPLAY });
});

test("a game ends with anything else left beside its recording", async () => {
  const g = await (await Session.start({ pageSeed: 7 })).skipText();
  await g.send("s");
  const [file] = [...g.persisted.keys()].filter((k) => k.startsWith("replay/"));
  g.m.FS.writeFile(`/save/${file.replace(/[^/]+$/, "failed")}`, "left by an older build");
  await quit(g);
  expect(g.ended).toBe(true);
  expect([...g.persisted.keys()].filter((k) => k.startsWith("replay/"))).toEqual([]);
});

test("answering Recover with another tab open brings the game back by replay", async () => {
  const { third, options } = await leftOpen();
  const next = await Session.start({ ...options, saves: third.persisted, resume: true, otherTab: true });
  expect(next.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/old game in progress/i) });
  await (await next.yn("r")).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
  expect(next.state.status.BL_TIME?.text).toBe(third.state.status.BL_TIME?.text);
});

test("a game with no recording of its start asks, and one saved without one still restores", async () => {
  const left = await (await Session.start()).skipText();
  const without = (saves: Map<string, Uint8Array>) => new Map([...saves].filter(([k]) => !k.startsWith("replay/")));
  const asked = await Session.start({ saves: without(left.persisted) });
  expect(asked.prompt).toMatchObject({ kind: "yn", query: CANT_REPLAY });

  await left.send("S");
  const restored = await (await Session.start({ saves: without(left.saves()) })).skipText();
  expect(restored.recorded.some((l) => / session unrecorded /.test(l))).toBe(true);
  expect(restored.messages.some((t) => /welcome back/i.test(t))).toBe(true);
});
