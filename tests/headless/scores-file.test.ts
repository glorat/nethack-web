import { expect, test } from "vitest";
import { ascended, parseEnding, parseScores, scoreDate } from "../../src/offline/scores";

const LINE = "5.0.0 1234 0 3 3 0 16 1 20261102 20261101 0 Val Hum Fem Law Agnes,killed by a newt, while sleeping";

test("a high score line gives what the landing page shows", () => {
  expect(parseScores(`${LINE}\n`)).toEqual([{ points: 1234, name: "Agnes", role: "Val", race: "Hum", death: "killed by a newt, while sleeping", date: 20261102 }]);
});

test("lines that aren't scores are left out", () => {
  expect(parseScores("rubbish\n\n1.2.3 nope\n")).toEqual([]);
});

test("only an ascension counts as ascended", () => {
  expect(ascended(parseScores(LINE.replace(/killed.*/, "ascended"))[0])).toBe(true);
  expect(ascended(parseScores(LINE)[0])).toBe(false);
});

test("the date is the one the core wrote", () => {
  expect(scoreDate(parseScores(LINE)[0])).toBe(new Date(2026, 10, 2).toLocaleDateString(undefined, { dateStyle: "medium" }));
});

test("a game log line gives the latest game's ending, and anything else gives none", () => {
  const line = "version=5.0.0\tpoints=1234\tdeathdnum=0\tdeathlev=3\tname=Agnes\tdeath=killed by a newt\tdeathdate=20261102\tbirthdate=20261101";
  expect(parseEnding(line)).toEqual({ name: "Agnes", points: 1234, death: "killed by a newt", date: 20261102 });
  expect(parseEnding("rubbish")).toBeNull();
});
