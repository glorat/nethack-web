import { expect, test } from "vitest";
import { ascended, type FinishedGame, outcome, watchAddress, watchedGame } from "../../src/online/results";

const game: FinishedGame = { game: "g1", name: "Agnes", startedAt: 0, endedAt: 0, checked: false };

test("a watch address names the online game, and reads back as it", () => {
  const address = watchAddress("/play/", "abc-123");
  expect(watchedGame(new URL(address, "https://x").search)).toBe("abc-123");
  expect(watchedGame("?replay")).toBeNull();
  expect(watchedGame("?replay&online")).toBeNull();
  expect(watchedGame("?online&game=abc")).toBeNull();
});

test("a game says how it ended once scored, that its score is to come, or that it couldn't be scored", () => {
  expect(outcome({ ...game, checked: true, result: { role: "Val", race: "Dwa", death: "killed by a newt", turns: 1200 } })).toBe(`Agnes (Val-Dwa): killed by a newt, turn ${(1200).toLocaleString()}`);
  expect(outcome(game)).toMatch(/^Agnes: scored once the server has replayed the game/);
  expect(outcome({ ...game, checked: true })).toBe("Agnes: the server couldn't score this game");
});

test("a result missing fields still reads as words", () => {
  expect(outcome({ ...game, checked: true, result: { points: 5 } })).toBe("Agnes: ended");
});

test("only an ascension counts as one", () => {
  expect(ascended({ death: "ascended" })).toBe(true);
  expect(ascended({ death: "killed by an ascended being" })).toBe(false);
  expect(ascended(undefined)).toBe(false);
});
