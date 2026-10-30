import { expect, test } from "vitest";
import { NH_COLORS, textStyle } from "../../src/ui/colors";
import { headingStyle } from "../../src/ui/dialogs/MenuDialog";

test("a menu line keeps its color, and no color is the default text color", () => {
  expect(textStyle(2, 0)).toEqual({ color: NH_COLORS[2] });
  expect(textStyle(8, 0)).toEqual({});
});

test("attributes are drawn as Cocoa draws them", () => {
  expect(textStyle(8, 1)).toEqual({ fontWeight: "700" });
  expect(textStyle(8, 5)).toEqual({ fontWeight: "700" });
  expect(textStyle(8, 2)).toEqual({ opacity: "0.55" });
  expect(textStyle(8, 3)).toEqual({ fontStyle: "italic" });
  expect(textStyle(8, 4)).toEqual({ textDecoration: "underline" });
  expect(textStyle(1, 7)).toEqual({ color: NH_COLORS[1], background: "color-mix(in srgb, currentColor 20%, transparent)" });
});

test("the urgent and no-history flags don't change how a line looks", () => {
  expect(textStyle(8, 1 | 16 | 32)).toEqual({ fontWeight: "700" });
});

test("a heading keeps its color, with its inverse drawn as a strong heading instead", () => {
  const heading = (color: number, attr: number) => headingStyle({ identifier: 0, accelerator: "", groupAccelerator: "", attr, color, text: "Weapons", tile: -1, preselected: false });
  expect(heading(1, 7)).toEqual({ color: NH_COLORS[1] });
  expect(heading(8, 4)).toEqual({ textDecoration: "underline" });
});
