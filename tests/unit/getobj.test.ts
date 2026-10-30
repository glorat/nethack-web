import { expect, test } from "vitest";
import { unlistedLetters } from "../../src/port/getobj";
import type { MenuItem } from "../../src/protocol";

const item = (accelerator: string, text: string, identifier = accelerator.charCodeAt(0)): MenuItem => ({
  identifier, accelerator, groupAccelerator: "", attr: 0, color: 8, text, tile: -1, preselected: false,
});
const heading = (text: string): MenuItem => item("", text, 0);

const quaff = [heading("Potions"), item("d", "4 potions of water"), item("e", "a potion of healing"), heading("Special"), item("*", "(list everything)")];

test("an item prompt's menu also takes the carried letters it doesn't list", () => {
  expect(unlistedLetters("one", quaff, "$ade")).toBe("$a");
});

test("other menus take only their own letters", () => {
  expect(unlistedLetters("any", quaff, "$ade")).toBe("");
  expect(unlistedLetters("one", quaff.slice(0, 3), "$ade")).toBe("");
});
