import { expect, test } from "vitest";
import { biggerTextSize, nearestTextSize, smallerTextSize, textSizeFromOptions } from "../../src/port/textsize";

test("text grows and shrinks a step at a time, and stops at the ends", () => {
  expect(biggerTextSize(13)).toBe(14);
  expect(biggerTextSize(14)).toBe(16);
  expect(biggerTextSize(28)).toBe(28);
  expect(smallerTextSize(13)).toBe(12);
  expect(smallerTextSize(10)).toBe(10);
});

test("a size asked for becomes the nearest step", () => {
  expect(nearestTextSize(15)).toBe(14);
  expect(nearestTextSize(17)).toBe(16);
  expect(nearestTextSize(40)).toBe(28);
  expect(nearestTextSize(1)).toBe(10);
});

test("the options' size picks the starting size only when none was chosen here, and applies when changed in game", () => {
  expect(textSizeFromOptions(18, true, null)).toBe(18);
  expect(textSizeFromOptions(18, true, 24)).toBeNull();
  expect(textSizeFromOptions(17, false, 24)).toBe(16);
});
