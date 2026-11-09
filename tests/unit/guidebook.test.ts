import { expect, test } from "vitest";
import roleC from "../../nethack/src/role.c?raw";
import { guidebookMatches, guidebookText } from "../../src/port/guidebook";

const roles = [...roleC.matchAll(/^ {4}\{ \{ "([A-Za-z]+)", (?:0|"[A-Za-z]+") \},/gm)].map((m) => m[1]!);
const races = [...roleC.slice(roleC.indexOf("const struct Race races[")).matchAll(/^ {8}"([a-z]+)",\n {8}"[a-z]+",\n {8}"[a-z]+",\n {8}"[A-Z][a-z]{2}",/gm)].map((m) => m[1]!);

test("the build reads a paragraph for each role and race from the Guidebook, and nothing else", () => {
  expect(roles).toHaveLength(13);
  expect(races).toHaveLength(5);
  expect(__GUIDEBOOK_CHARACTERS__).toHaveLength(roles.length + races.length);
  for (const [, text] of __GUIDEBOOK_CHARACTERS__) expect(text).not.toMatch(/\\/);
});

test("every role and race the core offers finds its own paragraph, and only that one", () => {
  for (const name of [...roles, ...races]) expect(guidebookMatches(name), name).toHaveLength(1);
  expect(new Set([...roles, ...races].map(guidebookText)).size).toBe(roles.length + races.length);
  expect(guidebookText("Valkyrie")).toMatch(/^Valkyries are hardy warrior women\./);
  expect(guidebookText("Cavewoman")).toMatch(/^Cavemen and Cavewomen/);
  expect(guidebookText("Caveman")).toMatch(/^Cavemen and Cavewomen start with exceptional strength/);
  expect(guidebookText("dwarf")).toMatch(/^Dwarves are smaller than humans or elves/);
  expect(guidebookText("elf")).toMatch(/^Elves are agile, quick, and perceptive;/);
});
