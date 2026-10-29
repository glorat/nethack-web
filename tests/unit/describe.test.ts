import { expect, test } from "vitest";
import { tooltipText } from "../../src/port/describe";

test("a tooltip keeps what farlook says is actually there", () => {
  expect(tooltipText("d        a dog or other canine (tame little dog)")).toBe("tame little dog");
  expect(tooltipText("@        a human or elf (human valkyrie called Tester)")).toBe("human valkyrie called Tester");
  expect(tooltipText("         can be many things (unexplored area)")).toBe("unexplored area");
});

test("a tooltip keeps text after the parentheses, and text without any", () => {
  expect(tooltipText("@        a human (peaceful watchman) [seen: normal vision]")).toBe("peaceful watchman [seen: normal vision]");
  expect(tooltipText("#        a tree")).toBe("a tree");
});
