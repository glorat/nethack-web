import { vitals, type Metric } from "./metric";

const TAIL = 40;

/**
 * How the game stood at its end: turn, XL, HP, AC and gold, and its last messages with the turn, HP and hunger
 * (0 satiated to 6 starved) each came with.
 */
export const end: Metric = {
  name: "end",
  tier: "visible",
  create() {
    const tail: { turn: number; hp: number; hpmax: number; hunger: number; text: string }[] = [];
    let last: { turn: number; xl: number; hp: number; hpmax: number; ac: number; gold: number } | null = null;
    return {
      step(s) {
        const v = vitals(s);
        last = { turn: v.turn, xl: v.xl, hp: v.hp, hpmax: v.hpmax, ac: v.ac, gold: v.gold };
        for (const m of s.messages) {
          tail.push({ turn: v.turn, hp: v.hp, hpmax: v.hpmax, hunger: v.hunger, text: m.text });
          if (tail.length > TAIL) tail.shift();
        }
      },
      result: () => ({ ...last, tail }),
    };
  },
};
