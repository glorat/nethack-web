import { expect, test } from "vitest";
import { cursorColor } from "../../src/port/cursor";

const GREEN = "rgba(0, 204, 0, 0.9)";
const YELLOW = "rgba(204, 204, 0, 0.9)";
const RED = "rgba(204, 0, 0, 0.9)";

test("the cursor is green above three quarters of full HP, yellow above half, red below", () => {
  expect(cursorColor(16, 16)).toBe(GREEN);
  expect(cursorColor(13, 16)).toBe(GREEN);
  expect(cursorColor(12, 16)).toBe(YELLOW);
  expect(cursorColor(9, 16)).toBe(YELLOW);
  expect(cursorColor(8, 16)).toBe(RED);
  expect(cursorColor(0, 16)).toBe(RED);
});

test("the percentage is a whole number, as Cocoa's is", () => {
  expect(cursorColor(31, 41)).toBe(YELLOW);
  expect(cursorColor(30, 59)).toBe(RED);
});

test("a cursor with no HP yet is green", () => {
  expect(cursorColor(0, 0)).toBe(GREEN);
  expect(cursorColor(NaN, 16)).toBe(GREEN);
});
