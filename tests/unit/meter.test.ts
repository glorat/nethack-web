import { expect, test } from "vitest";
import { meterLevel } from "../../src/port/meter";

test("a bar warns below two thirds and is critical below one third", () => {
  expect(meterLevel(15, 15)).toBe("normal");
  expect(meterLevel(10, 15)).toBe("normal");
  expect(meterLevel(9, 15)).toBe("warning");
  expect(meterLevel(5, 15)).toBe("warning");
  expect(meterLevel(4, 15)).toBe("critical");
  expect(meterLevel(0, 15)).toBe("critical");
  expect(meterLevel(0, 0)).toBe("normal");
  expect(meterLevel(NaN, NaN)).toBe("normal");
});
