import { chebyshev, vitals, type Metric } from "./metric";

// a depth counts as reached once the hero has stayed there this many turns, or the game ended there: a peek down the
// stairs and straight back doesn't count
const STAY = 5;

type Arrival = { turn: number; xl: number; ac: number; hpmax: number; pet: string | null };

/**
 * How deep the game got: the deepest level, how ready the hero was on first reaching each depth (turn, XL, AC, max HP
 * and a pet within two squares, as one arriving with the hero is placed), and the dungeon branches entered.
 */
export const depths: Metric = {
  name: "depths",
  tier: "visible",
  create() {
    let maxDepth = 0;
    const arrivals: Record<number, Arrival> = {};
    const dungeons = new Set<string>();
    let pending: { depth: number; turn: number; arrival: Arrival } | null = null;
    return {
      step(s) {
        if (s.dungeon) dungeons.add(s.dungeon);
        const v = vitals(s);
        if (v.depth === null || v.depth <= maxDepth) {
          if (v.depth !== null) pending = null;
          return;
        }
        if (pending?.depth !== v.depth) {
          let pet: string | null = null;
          if (s.hero) {
            for (const c of s.state.map) {
              if (c && c.glyphFlags & s.glyphFlag.PET && chebyshev(c, s.hero) <= 2) pet = s.monsterName(c.glyph) ?? "?";
            }
          }
          pending = { depth: v.depth, turn: v.turn, arrival: { turn: v.turn, xl: v.xl, ac: v.ac, hpmax: v.hpmax, pet } };
        }
        if (v.turn - pending.turn >= STAY) {
          maxDepth = pending.depth;
          arrivals[maxDepth] = pending.arrival;
          pending = null;
        }
      },
      result() {
        if (pending) {
          maxDepth = pending.depth;
          arrivals[maxDepth] = pending.arrival;
        }
        return { maxDepth, arrivals, dungeons: [...dungeons] };
      },
    };
  },
};
