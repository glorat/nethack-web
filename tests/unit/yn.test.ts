import { expect, test } from "vitest";
import { keyText, ynAnswer, ynQuestion } from "../../src/port/yn";

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
