import { expect, test } from "vitest";
import { type Achievement, earned, ordered } from "../../src/online/achievements";

const got = (id: string, at: number): Achievement => ({ id, name: id, description: "", earned: { at, game: "g", turn: 1 } });
const not = (id: string): Achievement => ({ id, name: id, description: "" });

test("earned ones come first, latest first, then the rest as listed, with hidden ones last", () => {
  const list = [not("a"), { hidden: true } as const, got("b", 1), not("c"), got("d", 2)];
  expect(ordered(list).map((a) => ("id" in a ? a.id : "?"))).toEqual(["d", "b", "a", "c", "?"]);
  expect(earned(list)).toHaveLength(2);
});
