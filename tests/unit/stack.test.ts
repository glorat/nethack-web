import { expect, test } from "vitest";
import { listsStack } from "../../src/port/stack";
import type { MenuItem } from "../../src/protocol";

const item = (text: string, more: Partial<MenuItem> = {}): MenuItem => ({
  identifier: 97, accelerator: "a", groupAccelerator: "", attr: 0, color: 8, text, tile: 10, preselected: false, ...more,
});

test("a menu of things with a stack in it lists a stack", () => {
  expect(listsStack("one", [item("a +0 dagger"), item("12 uncursed +0 daggers (in quiver)")])).toBe(true);
  expect(listsStack("any", [item("50 gold pieces")])).toBe(true);
});

test("single things, numbers that aren't a stack's, and lists to read don't", () => {
  expect(listsStack("one", [item("a +0 dagger"), item("1 +0 dagger")])).toBe(false);
  expect(listsStack("one", [item("2 players", { tile: -1 })])).toBe(false);
  expect(listsStack("one", [item("12 daggers", { identifier: 0 })])).toBe(false);
  expect(listsStack("none", [item("12 daggers")])).toBe(false);
});
