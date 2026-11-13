import { cellAt, type GameState } from "../port/state";
import { nymphsNear, type Metric } from "./metric";

/**
 * Each nymph encounter: a nymph in view within 7 squares of the hero, from first sight until she's out of view for 20
 * turns, the level is left or the game is over.
 */
interface Encounter {
  level: string;
  start: number;
  end: number;
  firstDistance: number;
  heroInCorridor: boolean;
  awakeSigns: number;
  closest: number;
  turnsToContact: number | null;
  thrownAt: number;
  hitsByMissile: number;
  meleeAt: number;
  elbereth: number;
  zapHits: number;
  zapMisses: number;
  outcome: "killed" | "stole" | "gone";
}

const ch = (c: string) => c.charCodeAt(0);

/** The hero in a corridor: corridor squares beside it and no room floor. */
function inCorridor(state: GameState, hx: number, hy: number): boolean {
  let corridor = 0;
  let floor = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = cellAt(state, hx + dx, hy + dy);
      if (!c || (dx === 0 && dy === 0)) continue;
      if (c.ch === ch("#")) corridor++;
      if (c.ch === ch(".")) floor++;
    }
  }
  return corridor > 0 && floor === 0;
}

export const nymphEncounters: Metric = {
  name: "nymphEncounters",
  tier: "visible",
  create() {
    const done: Encounter[] = [];
    let current: Encounter | null = null;
    let lastSeen = -1;
    let prev = new Set<string>();
    const close = (outcome: Encounter["outcome"]) => {
      if (current) done.push({ ...current, outcome });
      current = null;
    };
    return {
      step(s) {
        if (!s.hero) return;
        const near = nymphsNear(s, 7);
        if (current && current.level !== s.level) close("gone");
        let stole = false;
        let killed = false;
        if (current) {
          for (const { text } of s.messages) {
            if (/\b(hits|misses) the [a-z ]*nymph/.test(text) && !/^You (hit|miss)/.test(text)) {
              current.thrownAt++;
              if (/\bhits the [a-z ]*nymph/.test(text)) current.hitsByMissile++;
            }
            if (/You (hit|miss|smite) the [a-z ]*nymph/.test(text)) current.meleeAt++;
            if (/The (wand|bolt of [a-z ]+|spell) hits the [a-z ]*nymph/.test(text)) current.zapHits++;
            if (/The (wand|bolt of [a-z ]+|spell) misses the [a-z ]*nymph/.test(text)) current.zapMisses++;
            if (/write in the (dust|frost)|burn into the floor|engrave/.test(text)) current.elbereth++;
            if (/\b(wood|water|mountain) nymph (stole|steals|charms|seduces|hits|misses|swings|pretends|picks up|turns to flee)|\bShe (stole|steals|charms)/.test(text)) current.awakeSigns++;
            if (/nymph (stole|steals)|\bShe (stole|steals)|charms you/.test(text)) stole = true;
            if (/You (kill|destroy) (the|a|an) [a-z ]*nymph\b/.test(text)) killed = true;
          }
        }
        const d = near.length ? Math.min(...near.map((n) => n.d)) : Infinity;
        if (near.length && !current) {
          current = { level: s.level, start: s.turn, end: s.turn, firstDistance: d, heroInCorridor: inCorridor(s.state, s.hero.x, s.hero.y), awakeSigns: 0,
            closest: d, turnsToContact: d <= 1 ? 0 : null, thrownAt: 0, hitsByMissile: 0, meleeAt: 0, elbereth: 0, zapHits: 0, zapMisses: 0, outcome: "gone" };
        }
        const open = current as Encounter | null;
        if (open) {
          if (near.length) {
            lastSeen = s.turn;
            open.end = s.turn;
            open.closest = Math.min(open.closest, d);
            if (d <= 1 && open.turnsToContact === null) open.turnsToContact = s.turn - open.start;
            if (s.newTurn && prev.size && near.some((n) => !prev.has(`${n.x},${n.y}`))) open.awakeSigns++;
          }
          if (killed) close("killed");
          else if (stole) close("stole");
          else if (s.turn - lastSeen > 20) close("gone");
        }
        if (s.newTurn) prev = new Set(near.map((n) => `${n.x},${n.y}`));
      },
      result() {
        close("gone");
        return done;
      },
    };
  },
};
