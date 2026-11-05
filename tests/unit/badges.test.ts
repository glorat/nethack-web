import { expect, test } from "vitest";
import botl from "../../nethack/src/botl.c?raw";
import { conditionSeverity, encumbranceSeverity, hungerSeverity, statusBadges } from "../../src/port/badges";

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

test("badges come hunger first, then encumbrance, then conditions, each with its meaning", () => {
  const badges = statusBadges(["STONE", "CONF"], "Hungry  ", "Burdened");
  expect(badges.map((b) => [b.label, b.severity])).toEqual([
    ["Hungry", "caution"], ["Burdened", "caution"], ["Stoning", "danger"], ["Confused", "warning"],
  ]);
  expect(badges[2].tip).toMatch(/turning to stone/);
});

test("every condition, hunger and encumbrance the core can show has a meaning", () => {
  const conditions = [...botl.matchAll(/\{\s*\d+, BL_MASK_(\w+),\s+bl_\w+,/g)].map((m) => m[1]);
  expect(conditions.length).toBeGreaterThan(25);
  const hunger = ["Satiated", "Hungry", "Weak", "Fainting", "Fainted", "Starved"].map((h) => statusBadges([], h, "")[0]);
  const encumbrance = ["Burdened", "Stressed", "Strained", "Overtaxed", "Overloaded"].map((e) => statusBadges([], "", e)[0]);
  for (const badge of [...statusBadges(conditions, "", ""), ...hunger, ...encumbrance]) {
    expect(badge.tip, badge.label).toBeTruthy();
  }
  expect(statusBadges(conditions, "", "").filter((b, i) => b.label === conditions[i])).toEqual([]);
});

test("no hunger or encumbrance gives no badge for them", () => {
  expect(statusBadges([], "", "")).toEqual([]);
  expect(statusBadges([], "        ", "")).toEqual([]);
});
