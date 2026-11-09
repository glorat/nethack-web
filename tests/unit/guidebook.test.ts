import { expect, test } from "vitest";
import guidebook from "../../nethack/doc/Guidebook.mn?raw";
import roleC from "../../nethack/src/role.c?raw";
import { RACE_TEXT, ROLE_TEXT } from "../../src/port/guidebook";

const paragraphs = guidebook
  .split(/^\.(?:pg|hn).*$/m)
  .map((p) => p.replace(/\\f[IPB]/g, "").replace(/\s+/g, " ").trim());

test("each role's and race's text is a paragraph of the Guidebook, word for word", () => {
  for (const text of [...Object.values(ROLE_TEXT), ...Object.values(RACE_TEXT)]) expect(paragraphs).toContain(text);
});

test("every role and race the core offers has its text", () => {
  const roles = [...roleC.matchAll(/^ {4}\{ \{ "([A-Za-z]+)", (?:0|"[A-Za-z]+") \},/gm)].map((m) => m[1]);
  const races = [...roleC.slice(roleC.indexOf("const struct Race races[")).matchAll(/^ {8}"([a-z]+)",\n {8}"[a-z]+",\n {8}"[a-z]+",\n {8}"[A-Z][a-z]{2}",/gm)].map((m) => m[1]);
  expect(roles).toHaveLength(13);
  expect(races).toHaveLength(5);
  expect(Object.keys(ROLE_TEXT).sort()).toEqual([...roles].sort());
  expect(Object.keys(RACE_TEXT).sort()).toEqual([...races].sort());
});
