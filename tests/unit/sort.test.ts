import { expect, test } from "vitest";
import { sortedOrder, sortKey } from "../../src/port/sort";
import type { MenuItem } from "../../src/protocol";

test("an item sorts by its name, past its count, sign and descriptions", () => {
  expect(sortKey("2 blessed +1 daggers")).toBe("daggers");
  expect(sortKey("an uncursed very rusty +0 long sword")).toBe("long sword");
  expect(sortKey("the Amulet of Yendor")).toBe("Amulet of Yendor");
  expect(sortKey("a partly eaten food ration")).toBe("food ration");
});

const item = (text: string, identifier = 1): MenuItem => ({
  identifier, accelerator: "", groupAccelerator: "", attr: 0, color: 8, text, tile: -1, preselected: false,
});

test("names are compared in any case, and ties keep their order whatever their details say", () => {
  const items = [item("Banana"), item("an apple"), item("a +0 dagger (in quiver)"), item("a +0 dagger (alternate weapon; not wielded)")];
  expect(sortedOrder(items)).toEqual([1, 0, 2, 3]);
});

test("rows before the first heading are sorted too", () => {
  expect(sortedOrder([item("a mace"), item("2 daggers"), item("Potions", 0), item("a potion of water")])).toEqual([1, 0, 2, 3]);
});

test("items are sorted under each heading, which stays put", () => {
  const items = [item("Weapons", 0), item("a mace"), item("2 daggers"), item("Potions", 0), item("a potion of water"), item("an Elixir")];
  expect(sortedOrder(items)).toEqual([0, 2, 1, 3, 5, 4]);
});
