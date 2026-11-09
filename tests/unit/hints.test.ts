import { expect, test } from "vitest";
import dungeons from "../../nethack/dat/dungeon.lua?raw";
import shknam from "../../nethack/src/shknam.c?raw";
import { dungeonHint, hintTip, HINTS, leavesDungeon, messageHint, parseSeen, tipParts } from "../../src/port/hints";

test("every kind of shop's welcome gives the shop hint", () => {
  const start = shknam.indexOf("const struct shclass shtypes[]");
  const names = [...shknam.slice(start).matchAll(/^ {4}\{ "([^"]+)"/gm)].map((m) => m[1]);
  expect(names.length).toBeGreaterThan(10);
  for (const name of names) {
    expect(messageHint(`"Hello, Kevin!  Welcome to Asidonhopo's ${name}!"`)).toBe("shop");
    expect(messageHint(`"Velkommen, Kevin!  Welcome again to Izchak's ${name}!"`)).toBe("shop");
    expect(messageHint(`You enter Asidonhopo's ${name}!`)).toBe("shop");
    expect(messageHint(`You enter Asidonhopo's ${name} again!`)).toBe("shop");
  }
});

test("other messages give no hint", () => {
  expect(messageHint("Hello, Kevin, welcome to NetHack!  You are a neutral male human Valkyrie.")).toBeNull();
  expect(messageHint("You see here a general store receipt.")).toBeNull();
  expect(messageHint('"Back again, Kevin?  I\'ve got my eye on you."')).toBeNull();
});

test("the Mines and Sokoban are found by the core's dungeon names", () => {
  expect(dungeons).toContain('name = "The Gnomish Mines"');
  expect(dungeons).toContain('name = "Sokoban"');
  expect(dungeons).toContain('name = "The Dungeons of Doom"');
  expect(dungeonHint("The Gnomish Mines", 2)).toBe("mines");
  expect(dungeonHint("Sokoban", 1)).toBe("sokoban");
  expect(dungeonHint("The Dungeons of Doom", 2)).toBeNull();
});

test("the top of the dungeon gives the goal, and its up stairs leave the dungeon", () => {
  expect(dungeonHint("The Dungeons of Doom", 1)).toBe("goal");
  expect(leavesDungeon("The Dungeons of Doom", 1)).toBe(true);
  expect(leavesDungeon("The Gnomish Mines", 1)).toBe(false);
  expect(leavesDungeon("The Dungeons of Doom", 2)).toBe(false);
});

test("the Mines hint tells gnomes and dwarves they're among their own, as such or polymorphed", () => {
  for (const kind of ["gnomish wizard", "dwarvish valkyrie", "(gnomish) newt", " dwarvish archeologist "])
    expect(hintTip("mines", kind)).toContain("one of their own");
  for (const kind of ["human valkyrie", "elven priestess", "(human) gnome lord", ""])
    expect(hintTip("mines", kind)).toBe(HINTS.mines.tip);
});

test("keys in a tip are marked out for showing as keys", () => {
  expect(tipParts("pay with `p` before you leave")).toEqual([{ text: "pay with " }, { text: "p", key: true }, { text: " before you leave" }]);
  expect(tipParts("shown as `>`")).toEqual([{ text: "shown as " }, { text: ">", key: true }]);
  expect(tipParts("no keys")).toEqual([{ text: "no keys" }]);
});

test("what's kept on the device is read back, and anything unreadable as nothing opened", () => {
  expect([...parseSeen('["shop","mines"]')]).toEqual(["shop", "mines"]);
  expect(parseSeen(null).size).toBe(0);
  expect(parseSeen("not json").size).toBe(0);
  expect(parseSeen('{"shop":true}').size).toBe(0);
  expect([...parseSeen('["shop",3]')]).toEqual(["shop"]);
});
