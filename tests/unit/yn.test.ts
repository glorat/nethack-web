import { expect, test } from "vitest";
import { countKey, keyText, ynAnswer, ynQuestion } from "../../src/port/yn";

const code = (c: string) => c.charCodeAt(0);

test("Escape gives quit, then no, then the default", () => {
  expect(ynAnswer(null, "ynq", "y")).toBe(code("q"));
  expect(ynAnswer("\x1b", "yn", "y")).toBe(code("n"));
  expect(ynAnswer(null, "ra", "a")).toBe(code("a"));
  expect(ynAnswer(null, "ra", "")).toBe(27);
});

test("Return and space give the default", () => {
  expect(ynAnswer("\r", "yn", "n")).toBe(code("n"));
  expect(ynAnswer(" ", "ynq", "y")).toBe(code("y"));
});

test("upper case is lowered unless the choices have upper case", () => {
  expect(ynAnswer("Y", "yn", "n")).toBe(code("y"));
  expect(ynAnswer("R", "rRlL", "")).toBe(code("R"));
});

test("with no choices any key is the answer, Escape included", () => {
  expect(ynAnswer("h", "", "")).toBe(code("h"));
  expect(ynAnswer(null, "", "")).toBe(27);
});

test("the question shows only the choices before an ESC, then the default", () => {
  expect(ynQuestion("Really save?", "yn", "n")).toBe("Really save? [yn] (n)");
  expect(ynQuestion("Continue?", "yn\x1bq", "")).toBe("Continue? [yn]");
  expect(ynQuestion("In what direction?", "", "")).toBe("In what direction?");
});

test("answers are written as the core writes them", () => {
  expect(keyText(code("y"))).toBe("y");
  expect(keyText(27)).toBe("<esc>");
  expect(keyText(4)).toBe("^D");
});

test("digits build a count that Return answers with, as '#'", () => {
  let count: number | null = null;
  for (const key of "12") count = (countKey(count, key) as { count: number }).count;
  expect(count).toBe(12);
  expect(countKey(count, "Backspace")).toEqual({ count: 1 });
  expect(countKey(count, "Enter")).toEqual({ answer: "#", count: 12 });
  expect(countKey(count, "y")).toEqual({ answer: "#", count: 12 });
  expect(countKey(count, "Y")).toEqual({ answer: "#", count: 12 });
  expect(countKey(0, "Enter")).toEqual({ answer: "n" });
});

test("Escape or another key stops counting, and without a count other keys aren't about one", () => {
  expect(countKey(5, "Escape")).toEqual({ count: null });
  expect(countKey(5, "q")).toEqual({ count: null });
  expect(countKey(1, "Backspace")).toEqual({ count: null });
  expect(countKey(null, "y")).toBeNull();
  expect(countKey(null, "#")).toEqual({ count: 0 });
});

test("a count stops growing past what Cocoa allows", () => {
  expect(countKey(100000000, "5")).toEqual({ count: 100000000 });
});
