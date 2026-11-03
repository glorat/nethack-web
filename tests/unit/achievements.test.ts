import { expect, test } from "vitest";
import { type Achievement, earned, grouped, latest } from "../../src/online/achievements";

const got = (id: string, at: number, group = "A"): Achievement => ({ id, name: id, description: "", group, earned: { at, game: "g", turn: 1 } });
const not = (id: string, group = "A"): Achievement => ({ id, name: id, description: "", group });

test("the latest earned come first, as many as asked for", () => {
  const list = [not("a"), { hidden: true } as const, got("b", 1), got("c", 3), got("d", 2)];
  expect(latest(list, 2).map((a) => a.id)).toEqual(["c", "d"]);
  expect(earned(list)).toHaveLength(3);
});

test("each heading keeps the server's order, and hidden ones are only counted", () => {
  const list = [not("a", "X"), got("b", 1, "Y"), { hidden: true } as const, not("c", "X"), { hidden: true } as const];
  expect(grouped(list)).toEqual({
    groups: [
      { name: "X", items: [list[0], list[3]] },
      { name: "Y", items: [list[1]] },
    ],
    hidden: 2,
  });
});
