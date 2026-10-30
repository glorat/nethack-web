import { expect, test } from "vitest";
import { isQuestion, splitFields } from "../../src/port/question";
import type { MenuItem } from "../../src/protocol";

const answer = (text: string, more: Partial<MenuItem> = {}): MenuItem => ({
  identifier: 1, accelerator: "a", groupAccelerator: "", attr: 0, color: 8, text, tile: -1, preselected: false, ...more,
});
const line = (text: string) => answer(text, { identifier: 0, accelerator: "" });

test("two to four short answers make a question", () => {
  expect(isQuestion("one", [answer("Yes"), answer("No")])).toBe(true);
  expect(isQuestion("one", [answer("Yes"), answer("No"), answer("Maybe"), answer("Later"), line(""), line("Some text after.")])).toBe(true);
});

test("one answer, five, a long one or columns don't", () => {
  expect(isQuestion("one", [answer("Yes")])).toBe(false);
  expect(isQuestion("one", ["a", "b", "c", "d", "e"].map((t) => answer(t)))).toBe(false);
  expect(isQuestion("one", [answer("Yes"), answer("x".repeat(41))])).toBe(false);
  expect(isQuestion("one", [answer("Yes"), answer("No\tReally")])).toBe(false);
});

test("an answer is measured without its padding, and spaced-out columns count as columns", () => {
  expect(isQuestion("one", [answer("Yes"), answer(`  ${"x".repeat(40)}  `)])).toBe(true);
  expect(isQuestion("one", [answer("Yes"), answer("No      (default)")])).toBe(false);
  expect(isQuestion("one", ["a", "b", "c", "d"].map((t) => answer(t)))).toBe(true);
});

test("columns are split at tabs and at runs of spaces that don't follow a sentence", () => {
  expect(splitFields("a\tb")).toEqual(["a", "b"]);
  expect(splitFields("Name    Level")).toEqual(["Name", "Level"]);
  expect(splitFields("Done.  Next one")).toEqual(["Done.  Next one"]);
  expect(splitFields("trailing  ")).toEqual(["trailing  "]);
});

test("a blank line over the answers is a heading; an indented colon or an empty line with an attribute isn't", () => {
  expect(isQuestion("one", [line(""), answer("Yes"), answer("No")])).toBe(false);
  expect(isQuestion("one", [answer("Yes"), answer("No"), line("  note:")])).toBe(true);
  expect(isQuestion("one", [answer("Yes"), answer("No"), { ...line(""), attr: 1 }])).toBe(true);
});

test("pictures, headings over items, or another kind of menu don't", () => {
  expect(isQuestion("one", [answer("a mace", { tile: 3 }), answer("a dagger")])).toBe(false);
  expect(isQuestion("one", [line("Weapons"), answer("Yes"), answer("No")])).toBe(false);
  expect(isQuestion("one", [answer("Yes"), answer("No"), { ...line("Note"), attr: 1 }])).toBe(false);
  expect(isQuestion("one", [answer("Yes"), answer("No"), line("Choose:")])).toBe(false);
  expect(isQuestion("any", [answer("Yes"), answer("No")])).toBe(false);
});
