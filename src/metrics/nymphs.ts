import { nymphsNear, type Metric } from "./metric";

const ACTS = /\b(wood|water|mountain) nymph (stole|steals|charms|seduces|hits|misses|swings|pretends|picks up|turns to flee|takes)|\bShe (stole|steals|charms)/;

/**
 * Awake nymphs met, nymphs killed, thefts, and mirrors a nymph took instead (apply.c: she admires herself and takes
 * it, stealing nothing else). A nymph counts as awake once one within 7 squares changes square or one acts in a
 * message; sightings on a level within 30 turns of the last are the same one.
 */
export const nymphs: Metric = {
  name: "nymphs",
  tier: "visible",
  create() {
    let awakeMet = 0, kills = 0, thefts = 0, mirrorTrades = 0;
    let lastLevel = "";
    let prev = new Set<string>();
    const lastAwake = new Map<string, number>();
    return {
      step(s) {
        const now = new Set(nymphsNear(s, 7).map((n) => `${n.x},${n.y}`));
        // one acting in a message is near the hero, though she may already have teleported off the map
        let acted = false;
        for (const m of s.messages) {
          if (ACTS.test(m.text)) acted = true;
          if (/You (kill|destroy) (the|a|an) [a-z ]*nymph\b/.test(m.text)) kills++;
          // "charms you" comes before the "stole" of the same theft
          if (/nymph (stole|steals)|\bShe (stole|steals)/.test(m.text)) thefts++;
          if (/nymph admires herself in your/.test(m.text)) mirrorTrades++;
        }
        let moved = false;
        if (s.newTurn) {
          moved = s.level === lastLevel && prev.size > 0 && [...now].some((p) => !prev.has(p));
          prev = now;
          lastLevel = s.level;
        }
        if ((moved && now.size) || acted) {
          if (s.turn - (lastAwake.get(s.level) ?? -Infinity) > 30) awakeMet++;
          lastAwake.set(s.level, s.turn);
        }
      },
      result: () => ({ awakeMet, kills, thefts, mirrorTrades }),
    };
  },
};
