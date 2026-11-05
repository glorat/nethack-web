import { expect, test } from "vitest";
import { alignmentName, ascended, characterName } from "../../src/port/xlog";

test("an ascension is the core's own word for it", () => {
  expect(ascended({ death: "ascended" })).toBe(true);
  expect(ascended({ death: "killed by an ascended being" })).toBe(false);
  expect(ascended(undefined)).toBe(false);
});

test("the core's abbreviations are spelt out, with what's missing left out and what's unknown kept", () => {
  expect(characterName({ role: "Val", race: "Hum", gender: "Fem" })).toBe("Human Valkyrie");
  expect(characterName({ role: "Pri", race: "Elf", gender: "Fem" })).toBe("Elf Priestess");
  expect(characterName({ role: "Pri", race: "Elf", gender: "Mal" })).toBe("Elf Priest");
  expect(characterName({ role: "Cav" })).toBe("Caveman");
  expect(characterName({ role: "Xyz", race: "Abc" })).toBe("Abc Xyz");
  expect(characterName({})).toBe("");
  expect(alignmentName({ align: "Neu" })).toBe("Neutral");
  expect(alignmentName({})).toBe("");
});
