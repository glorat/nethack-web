import { expect, test } from "vitest";
import { Session } from "./harness";

const DIRECTIONS = "hjklyubn";

async function extCmd(g: Session, name: string): Promise<void> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  const command = g.prompt.commands.find((c) => c.name === name);
  if (!command) throw new Error(`no ${name} command`);
  await g.answer({ kind: "ext_cmd", index: command.index });
}

async function conduct(g: Session): Promise<string[]> {
  await extCmd(g, "conduct");
  if (g.prompt?.kind !== "text") throw new Error(`no conduct window: ${g.messages.slice(-2).join(" ")}`);
  const lines = g.prompt.lines.map((l) => l.text);
  await g.dismiss();
  return lines;
}

function figure(lines: string[], label: RegExp): { of: number; actual: number; expected: number } {
  const line = lines.find((l) => label.test(l));
  const m = line?.match(/: (\d+)(?: of (\d+))?, expected ([\d.]+)/);
  if (!m) throw new Error(`no ${label} in ${lines.join(" | ")}`);
  return { actual: Number(m[1]), of: Number(m[2] ?? 0), expected: Number(m[3]) };
}

async function create(g: Session, monster: string): Promise<void> {
  await g.send("\x07");
  await g.getlin(monster);
}

async function fight(g: Session, turns: number): Promise<void> {
  await create(g, "gnome lord");
  for (let i = 0; i < turns && !g.ended; i++) {
    await g.skipText();
    await g.send(`F${DIRECTIONS[i % 8]}`);
  }
  await g.skipText();
}

/** Uses an item at each direction in turn until a roll for it shows. */
async function useAround(g: Session, command: string, item: string): Promise<number> {
  for (const dir of DIRECTIONS) {
    await g.send(command);
    await g.yn(item);
    await g.yn(dir);
    await g.skipText();
    const rolls = figure(await conduct(g), /Hits dealt/).of;
    if (rolls > 0) return rolls;
  }
  return 0;
}

test("fighting counts hits and damage dice, against what they should average", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  expect(figure(await conduct(g), /Hits dealt/).of).toBe(0);

  await fight(g, 200);

  const lines = await conduct(g);
  const hits = figure(lines, /Hits dealt/);
  const dice = figure(lines, /Damage dice dealt/);
  expect(hits.of).toBeGreaterThan(0);
  expect(hits.actual).toBeGreaterThan(0);
  expect(hits.expected).toBeGreaterThan(0);
  expect(hits.expected).toBeLessThanOrEqual(hits.of);
  // her spear's d6, without any of her bonuses
  expect(dice.expected).toBe(hits.actual * 3.5);
  expect(dice.actual).toBeGreaterThanOrEqual(hits.actual);
  expect(dice.actual).toBeLessThanOrEqual(hits.actual * 6);
});

test("being attacked counts as well", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await create(g, "jackal");
  for (let i = 0; i < 20 && !g.ended; i++) {
    await g.skipText();
    await g.send("ms");
  }
  await g.skipText();

  expect(figure(await conduct(g), /Hits taken/).of).toBeGreaterThan(0);
});

test("a thrown weapon's roll counts", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("40 daggers");
  const letter = g.messages.at(-1)?.match(/^(\w) - /)?.[1];
  if (!letter) throw new Error(`no daggers: ${g.messages.slice(-2).join(" ")}`);
  await create(g, "gnome lord");

  expect(await useAround(g, "t", letter)).toBeGreaterThan(0);
});

test("a ray's roll counts", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("blessed wand of cold");
  const letter = g.messages.at(-1)?.match(/^(\w) - /)?.[1];
  if (!letter) throw new Error(`no wand: ${g.messages.slice(-2).join(" ")}`);
  await create(g, "gnome lord");

  expect(await useAround(g, "z", letter)).toBeGreaterThan(0);
});

test("the hero's own ray bouncing back isn't an attack on them", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("blessed wand of cold");
  const letter = g.messages.at(-1)?.match(/^(\w) - /)?.[1];
  if (!letter) throw new Error(`no wand: ${g.messages.slice(-2).join(" ")}`);

  let hit = false;
  for (const dir of DIRECTIONS) {
    await g.send("z");
    await g.yn(letter);
    // no direction prompt once the wand has run out
    if (g.prompt?.kind === "yn") await g.yn(dir);
    await g.skipText();
    hit ||= g.messages.some((m) => /hits you/.test(m));
  }

  expect(hit).toBe(true);
  expect(figure(await conduct(g), /Hits taken/).of).toBe(0);
});

test("a normal game keeps the figures to itself until it's over", async () => {
  const g = await (await Session.start()).skipText();
  expect((await conduct(g)).some((l) => /Combat luck/.test(l))).toBe(false);

  await extCmd(g, "quit");
  const seen: string[] = [];
  while (!g.ended && g.prompt) {
    if (g.prompt.kind === "text") seen.push(...g.prompt.lines.map((l) => l.text));
    if (g.prompt.kind === "yn") await g.yn("y");
    else await g.dismiss();
  }
  expect(seen.some((l) => /Combat luck/.test(l))).toBe(true);
});

test("the figures survive saving and restoring", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await fight(g, 100);
  const before = await conduct(g);
  expect(figure(before, /Hits dealt/).of).toBeGreaterThan(0);

  await g.send("S");
  await g.skipText();
  const next = await Session.start({ wizard: true, saves: g.saves() });
  // debug mode asks whether to keep the save file
  while (next.prompt?.kind === "yn") await next.yn("n");
  await next.skipText();

  expect(await conduct(next)).toEqual(before);
});
