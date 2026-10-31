import { expect, test } from "vitest";
import { Session } from "./harness";

/** The lines without their times. */
const bare = (lines: string[]) => lines.map((l) => l.replace(/^\d+ /, ""));
const file = (g: Session) => new TextDecoder().decode(g.saves().get("replay/0Tester/000001"));

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

test("a new game is recorded from its start, each line with its time, and kept next to the game", async () => {
  const g = await (await Session.start({ pageSeed: 5, utcOffset: 11 * 3600 })).skipText();
  await g.send("s");

  const lines = bare(g.recorded);
  expect(lines.slice(0, 2)).toEqual(["nhrec 1", expect.stringMatching(/^session new \d{4}-\d\d-\d\dT[\d:.]+Z tz=\+11:00$/)]);
  expect(lines.some((l) => /^opt ".*name:Tester.*"$/.test(l))).toBe(true);
  expect(lines).toContain("alone 1");
  expect(lines).toContain("seed 5");
  expect(lines.some((l) => /^now \d+$/.test(l))).toBe(true);
  expect(lines.some((l) => /^uuid [\w-]{36}$/.test(l))).toBe(true);
  expect(lines).toContain(`k ${"s".charCodeAt(0)}`);
  expect(lines.some((l) => /^T \d+ [0-9a-f]{4}$/.test(l))).toBe(true);
  expect(lines.some((l) => /^= \d+ @\d+,\d+ -?\d+ \{.*"HP":"\d+".*"LEVELDESC":"Dlvl:1".*\}$/.test(l))).toBe(true);
  const now = Date.now() / 1000;
  expect(g.recorded.every((l) => Math.abs(Number(l.split(" ")[0]) - now) < 60)).toBe(true);
  expect(file(g)).toBe(g.recorded.map((l) => `${l}\n`).join(""));
});

test("each turn's time is written once, before the command that starts it", async () => {
  const g = await (await Session.start({ options: "time" })).skipText();
  await g.send("sss");
  const lines = bare(g.recorded);
  const at = lines.flatMap((l, i) => (l.startsWith("T ") ? [i] : []));
  expect(at.length).toBeGreaterThan(2);
  for (const i of at.slice(0, -1)) expect(lines[i + 1]).toMatch(/^(= .*|k \d+)$/);
  const turns = at.map((i) => Number(lines[i].split(" ")[1]));
  expect(turns).toEqual([...turns].sort((a, b) => a - b));
  expect(new Set(turns).size).toBe(turns.length);
});

test("a saved game's recording carries on when it's restored", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("S");
  expect(bare(g.recorded).at(-1)).toBe("end save");

  const next = await (await Session.start({ saves: g.saves() })).skipText();
  expect(bare(next.recorded)[0]).toMatch(/^session restore \S+Z$/);
  expect(file(next)).toBe([...g.recorded, ...next.recorded].map((l) => `${l}\n`).join(""));
});

test("marks turns from the core's own count, with no line for a checkpoint", async () => {
  const g = await (await Session.start({ options: "time" })).skipText();
  await g.send("sss>");
  const turns = bare(g.recorded).filter((l) => l.startsWith("T ")).map((l) => l.split(" ")[1]);
  expect(turns.at(-1)).toBe(g.state.status.BL_TIME?.text);
  expect(bare(g.recorded).filter((l) => l.startsWith("ckpt"))).toEqual([]);
});

test("each session records the options it started with", async () => {
  const g = await (await Session.start({ options: "time" })).skipText();
  await g.send("S");
  const next = await (await Session.start({ saves: g.saves(), options: "showexp" })).skipText();
  expect(bare(next.recorded).some((l) => /^opt ".*showexp.*"$/.test(l))).toBe(true);
});

test("a save's end is kept before the page can go", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("S");
  expect(new TextDecoder().decode(g.persisted.get("replay/0Tester/000001"))).toMatch(/ end save\n$/);
});

test("a new game started over an old one leaves out the answer that destroyed it", async () => {
  const left = await (await Session.start()).skipText();
  await left.send("s");
  const next = await Session.start({ saves: left.persisted, otherTab: true });
  await next.yn("y");
  await next.skipText();
  const lines = bare(next.recorded);
  expect(lines[1]).toMatch(/^session new /);
  expect(lines.filter((l) => l.startsWith("y "))).toEqual([]);
});

test("a game keeps the time zone it started in when it's restored elsewhere", async () => {
  const date = "2024-01-24T20:00:00Z";
  const g = await (await Session.start({ date, utcOffset: 10 * 3600 })).skipText();
  expect(g.messages.some((t) => /full moon tonight/i.test(t))).toBe(true);
  await g.send("S");

  const next = await (await Session.start({ saves: g.saves(), date, utcOffset: 0 })).skipText();
  expect(next.messages.some((t) => /full moon tonight/i.test(t))).toBe(true);
});

test("a game that ends hands over its whole recording and leaves none behind", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("S");
  const next = await (await Session.start({ saves: g.saves() })).skipText();
  await quit(next);

  expect(next.recording).toBe([...g.recorded, ...next.recorded].map((l) => `${l}\n`).join(""));
  expect(bare(next.recorded).at(-1)).toBe("end over");
  expect([...next.saves().keys()].filter((f) => f.startsWith("replay/"))).toEqual([]);
});
