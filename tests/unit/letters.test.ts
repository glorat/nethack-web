import { expect, test } from "vitest";
import { letterAt, positionalLetters, withLetters } from "../../src/port/letters";
import type { MenuItem } from "../../src/protocol";

const item = (accelerator: string, identifier = 1): MenuItem => ({
  identifier, accelerator, groupAccelerator: "", attr: 0, color: 8, text: "x", tile: -1, preselected: false,
});

test("items with no letter get the next free one, skipping letters in use and headings", () => {
  const items = withLetters("one", [item("", 0), item(""), item("b"), item(""), item("")]);
  expect(items.map((i) => i.accelerator)).toEqual(["", "a", "b", "c", "d"]);
});

test("after z come capitals, and past Z an item stays without", () => {
  const items = withLetters("any", Array.from({ length: 53 }, () => item("")));
  expect(items[25].accelerator).toBe("z");
  expect(items[26].accelerator).toBe("A");
  expect(items[51].accelerator).toBe("Z");
  expect(items[52].accelerator).toBe("");
});

test("a menu nothing can be picked from gets none", () => {
  expect(withLetters("none", [item("")])[0].accelerator).toBe("");
});

test("positional labels are a to Z and then start again", () => {
  expect([0, 25, 26, 51, 52, 53, 77, 78].map(letterAt)).toEqual([
    "a", "z", "A", "Z", "a", "b", "z", "A",
  ]);
});

test("positional labels follow the displayed order, so sorting relabels by position", () => {
  const items = Array.from({ length: 53 }, (_, i) => ({ ...item("core"), identifier: i + 1, text: `${i}` }));
  items[0].identifier = 1;
  const order = items.map((_, i) => i).reverse();
  const labels = positionalLetters(items, order, "one");
  expect(order.map((i) => labels.get(i))).toEqual(Array.from({ length: 53 }, (_, i) => letterAt(i)));
  expect(labels.get(order[0])).toBe("a");
  expect(labels.get(order[52])).toBe("a");
});

test("short and read-only menus keep their own letters", () => {
  const short = [item("x"), item("y")];
  expect([...positionalLetters(short, [0, 1], "one").values()]).toEqual(["x", "y"]);
  const read = [item("x"), item("", 0)];
  expect([...positionalLetters(read, [0, 1], "none").values()]).toEqual(["x"]);
});
