import { expect, test } from "vitest";
import { MARK_DETECTED, MARK_PEACEFUL, MARK_PET, MARK_PILE, MARK_RIDDEN } from "../../src/port/marks";
import type { MapCell } from "../../src/protocol";
import { Session } from "./harness";

const OPTIONS = "hilite_pet,hilite_pile";
const DIRS: Record<string, [number, number]> = { h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] };

const marked = (g: Session, mark: number) => g.state.map.filter((c): c is MapCell => !!c && (c.marks & mark) !== 0);

async function wish(g: Session, item: string) {
  await g.send("\x17");
  await g.getlin(item);
}

async function create(g: Session, monster: string) {
  await g.send("\x07");
  await g.getlin(monster);
}

test("the pet is marked", async () => {
  const g = await (await Session.start({ options: OPTIONS })).skipText();
  const [pet, ...others] = marked(g, MARK_PET);
  expect(others).toEqual([]);
  expect(Math.max(Math.abs(pet.x - g.hero.x), Math.abs(pet.y - g.hero.y))).toBe(1);
});

test("a square with more than one object is marked as a pile", async () => {
  const g = await (await Session.start({ wizard: true, options: OPTIONS })).skipText();
  await wish(g, "apple");
  await wish(g, "orange");
  for (const fruit of [/apple/, /orange/]) {
    await g.send("d");
    await g.yn(g.state.inventory.find((i) => fruit.test(i.text))!.accelerator);
  }
  const { x, y } = g.hero;
  const [key] = Object.entries(DIRS).find(([, [dx, dy]]) => g.cell(x + dx, y + dy)?.ch === ".".charCodeAt(0))!;
  await g.send(key);
  expect(marked(g, MARK_PILE).map((c) => [c.x, c.y])).toEqual([[x, y]]);
});

test("a peaceful monster is marked until it is angered", async () => {
  const g = await (await Session.start({ wizard: true, options: OPTIONS })).skipText();
  await create(g, "peaceful gnome lord");
  const [gnome] = marked(g, MARK_PEACEFUL);
  expect(String.fromCharCode(gnome.ch)).toBe("G");

  const [key] = Object.entries(DIRS).find(([, [dx, dy]]) => gnome.x === g.hero.x + dx && gnome.y === g.hero.y + dy)!;
  await g.send(`F${key}`);
  while (g.prompt?.kind === "yn") await g.yn("y");
  expect(marked(g, MARK_PEACEFUL)).toEqual([]);
});

test("the steed is marked while ridden", async () => {
  const g = await (await Session.start({ wizard: true, character: "role:Knight,race:human,gender:female,align:lawful" })).skipText();
  const { x, y } = g.hero;
  const [key] = Object.entries(DIRS).find(([, [dx, dy]]) => g.cell(x + dx, y + dy)?.ch === "u".charCodeAt(0))!;
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "ride")!.index });
  await g.yn(key);
  while (g.prompt?.kind === "yn") await g.yn("y");
  expect(g.hero.marks & MARK_RIDDEN).toBe(MARK_RIDDEN);
});

test("a monster sensed but not seen is marked as detected", async () => {
  const g = await (await Session.start({ wizard: true, options: OPTIONS })).skipText();
  await wish(g, "blindfold");
  await wish(g, "blessed potion of monster detection");
  await g.send("P");
  await g.yn(g.state.inventory.find((i) => /blindfold/.test(i.text))!.accelerator);
  await g.send("q");
  await g.yn(g.state.inventory.find((i) => /potion/.test(i.text))!.accelerator);
  await g.skipText();
  expect(marked(g, MARK_DETECTED).length).toBeGreaterThan(0);
});
