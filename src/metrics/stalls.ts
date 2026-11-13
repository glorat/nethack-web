import type { Metric } from "./metric";

/** The most answers given while the game clock stood still, and on which turn: a bot going round in circles. */
export const stalls: Metric = {
  name: "stalls",
  tier: "visible",
  create() {
    let run = 0;
    let turn: number | null = null;
    let longest = { keys: 0, turn: null as number | null };
    return {
      step(s) {
        if (s.turn === turn) run++;
        else [run, turn] = [0, s.turn];
        if (run > longest.keys) longest = { keys: run, turn };
      },
      result: () => longest,
    };
  },
};
