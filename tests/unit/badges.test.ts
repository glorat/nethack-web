import { expect, test } from "vitest";
import { conditionSeverity, encumbranceSeverity, hungerSeverity } from "../../src/port/badges";

test("hunger is graded as Cocoa grades it", () => {
  expect(["Satiated", "Hungry", "Weak", "Fainting", "Fainted", "Starved"].map(hungerSeverity)).toEqual([
    "info", "caution", "warning", "danger", "danger", "danger",
  ]);
});

test("hunger is graded from the core's padded text", () => {
  expect(["Hungry  ", "Weak    ", "Fainting"].map(hungerSeverity)).toEqual(["caution", "warning", "danger"]);
});

test("encumbrance is graded as Cocoa grades it", () => {
  expect(["Burdened", "Stressed", "Strained", "Overtaxed", "Overloaded"].map(encumbranceSeverity)).toEqual([
    "caution", "warning", "danger", "danger", "danger",
  ]);
});

test("conditions are graded by the core's groups", () => {
  expect(conditionSeverity("STONE")).toBe("danger");
  expect(conditionSeverity("GRAB")).toBe("danger");
  expect(conditionSeverity("STUN")).toBe("warning");
  expect(conditionSeverity("RIDE")).toBe("info");
  expect(conditionSeverity("WOUNDEDL")).toBe("caution");
});
