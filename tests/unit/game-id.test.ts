import { expect, test } from "vitest";
import { gameOf, shortId } from "../../src/online/game-id";

const GAME = "3f9c2a7e-5b1d-4c8e-9a62-7d0e4b81c3f5";

test("a game's short ID is 22 characters that come back to its UUID", () => {
  expect(shortId(GAME)).toBe("P5wqflsdTI6aYn0OS4HD9Q");
  expect(gameOf("P5wqflsdTI6aYn0OS4HD9Q")).toBe(GAME);
  for (let i = 0; i < 200; i++) {
    const game = crypto.randomUUID();
    expect(gameOf(shortId(game))).toBe(game);
  }
});

test("a UUID is taken as it is, and nothing else is a game", () => {
  expect(gameOf(GAME)).toBe(GAME);
  for (const id of ["", "not-a-game", "A".repeat(21), "A".repeat(23), "P5wqflsdTI6aYn0OS4HD9R", GAME.toUpperCase(), "../../etc/passwd"]) expect(gameOf(id), id).toBeNull();
});
