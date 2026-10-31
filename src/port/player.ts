// The character picker's rules: a pick that rules out another choice moves
// that choice to the first one still allowed, as Cocoa's picker does.
import { fixedInputs } from "./fixedinputs";
import type { PlayerChoices, PlayerPick } from "../protocol";

export const GENDERS = ["Male", "Female"];
export const ALIGNS = ["Lawful", "Neutral", "Chaotic"];

/** Returns an integer in [0, n). */
export type Random = (n: number) => number;

const pageRandom: Random = (n) => {
  const fixed = fixedInputs();
  return fixed ? fixed.seed % n : Math.floor(Math.random() * n);
};

function indices(n: number, ok: (i: number) => boolean): number[] {
  return Array.from({ length: n }, (_, i) => i).filter(ok);
}

function keepOrFirst(n: number, ok: (i: number) => boolean, current: number): number {
  return current >= 0 && current < n && ok(current) ? current : (indices(n, ok)[0] ?? -1);
}

function keepOrRandom(n: number, ok: (i: number) => boolean, current: number, random: Random): number {
  if (current >= 0 && current < n && ok(current)) return current;
  const allowed = indices(n, ok);
  return allowed[random(allowed.length)] ?? -1;
}

function settle(c: PlayerChoices, p: PlayerPick): PlayerPick {
  return {
    ...p,
    gender: keepOrFirst(GENDERS.length, (g) => c.validGender[p.role][p.race][g], p.gender),
    align: keepOrFirst(ALIGNS.length, (a) => c.validAlign[p.role][p.race][a], p.align),
  };
}

export function withRole(c: PlayerChoices, p: PlayerPick, role: number): PlayerPick {
  return settle(c, { ...p, role, race: keepOrFirst(c.races.length, (ra) => c.validRace[role][ra], p.race) });
}

export function withRace(c: PlayerChoices, p: PlayerPick, race: number): PlayerPick {
  return settle(c, { ...p, race, role: keepOrFirst(c.roles.length, (ro) => c.validRace[ro][race], p.role) });
}

/** Fills whatever `c.chosen` leaves open at random, keeping what it fixes where the rules allow. */
export function randomPick(c: PlayerChoices, random: Random = pageRandom): PlayerPick {
  const { chosen } = c;
  // a race chosen without a role picks the role to suit it, not the other way round
  const raceFirst = chosen.race >= 0 && chosen.role < 0;
  let role = chosen.role;
  let race = chosen.race;
  if (raceFirst) {
    role = keepOrRandom(c.roles.length, (ro) => c.validRace[ro][race], role, random);
  } else {
    role = keepOrRandom(c.roles.length, () => true, role, random);
    race = keepOrRandom(c.races.length, (ra) => c.validRace[role][ra], race, random);
  }
  return {
    role,
    race,
    gender: keepOrRandom(GENDERS.length, (g) => c.validGender[role][race][g], chosen.gender, random),
    align: keepOrRandom(ALIGNS.length, (a) => c.validAlign[role][race][a], chosen.align, random),
  };
}
