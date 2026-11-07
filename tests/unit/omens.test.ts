import { expect, test } from "vitest";
import { cookie, moonPhase, omens, rumors } from "../../src/port/omens";

// from calendar.c's phase_of_the_moon(), compiled and run on these dates
const PHASES: [string, number][] = [
  ["2026-01-01", 3], ["2026-02-03", 4], ["2026-03-20", 0], ["2026-10-24", 3], ["2026-10-25", 4], ["2026-11-09", 0], ["2026-11-30", 5],
  ["2027-01-23", 4], ["2027-02-07", 0], ["2027-12-31", 1], ["2030-03-19", 4], ["2030-04-02", 0], ["2030-04-22", 5],
];

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

test("the moon's phase is the core's, day by day", () => {
  for (const [iso, phase] of PHASES) expect([iso, moonPhase(day(iso))]).toEqual([iso, phase]);
});

test("a game's opening lines follow the moon and the date, in the core's order", () => {
  expect(omens(day("2026-10-25"))).toEqual(["You are lucky!  Full moon tonight."]);
  expect(omens(day("2026-11-09"))).toEqual(["Be careful!  New moon tonight."]);
  expect(omens(day("2026-11-30"))).toEqual([]);
  expect(omens(day("2026-11-13"))).toEqual(["Watch out!  Bad things can happen on Friday the 13th."]);
});

test("a rumors file gives one rumor a line, and a cookie reads one out", () => {
  expect(rumors("A cream pie has two uses.\n\n  Elbereth  \n")).toEqual(["A cream pie has two uses.", "Elbereth"]);
  expect(cookie("Elbereth")).toEqual(["This cookie has a scrap of paper inside.", "It reads:", "Elbereth"]);
});
