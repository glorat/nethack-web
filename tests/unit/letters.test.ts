import { expect, test } from "vitest";
import { withLetters } from "../../src/port/letters";
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
