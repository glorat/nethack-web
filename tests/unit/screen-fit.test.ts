import { expect, test } from "vitest";
import { screenAdvice } from "../../src/port/screen-fit";

test("only a narrow touch screen gets advice: a tablet to turn, a phone to come back on something bigger", () => {
  expect(screenAdvice(1180, 1180, true)).toBe("none");
  expect(screenAdvice(820, 1180, true)).toBe("turn");
  expect(screenAdvice(390, 844, true)).toBe("bigger");
  // the largest phones, sideways, get the game's own layout
  expect(screenAdvice(932, 932, true)).toBe("none");
  expect(screenAdvice(430, 932, true)).toBe("bigger");
  expect(screenAdvice(700, 1440, false)).toBe("none");
});
