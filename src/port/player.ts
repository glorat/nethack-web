// The character picker's rules: a pick that rules out another choice moves
// that choice to the first one still allowed, as Cocoa's picker does.
import type { PlayerChoices, PlayerPick } from "../protocol";

export const GENDERS = ["Male", "Female"];
export const ALIGNS = ["Lawful", "Neutral", "Chaotic"];

/** The four tty selection menus, in the order they are shown. */
export type PlayerStage = "role" | "race" | "gender" | "align";
/** The box that currently owns the keyboard. Play is a button, not a box. */
export type PlayerFocus = PlayerStage;
const STAGE_ORDER: PlayerStage[] = ["role", "race", "gender", "align"];

/** Returns an integer in [0, n). */
export type Random = (n: number) => number;

const mathRandom: Random = (n) => Math.floor(Math.random() * n);

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
export function randomPick(c: PlayerChoices, random: Random = mathRandom): PlayerPick {
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

/** The menus currently worth showing, in tty order. */
export function shownStages(c: PlayerChoices, p: PlayerPick): PlayerStage[] {
  const stages: PlayerStage[] = ["role"];
  if (indices(c.races.length, (ra) => c.validRace[p.role][ra]).length > 1) stages.push("race");
  if (indices(GENDERS.length, (g) => c.validGender[p.role][p.race][g]).length > 1) stages.push("gender");
  if (indices(ALIGNS.length, (a) => c.validAlign[p.role][p.race][a]).length > 1) stages.push("align");
  return stages;
}

/** The next tty menu, skipping one whose only choice is already forced. Null at the last one. */
export function nextStage(c: PlayerChoices, p: PlayerPick, stage: PlayerFocus): PlayerStage | null {
  const stages = shownStages(c, p);
  const from = STAGE_ORDER.indexOf(stage);
  for (let i = from + 1; i < STAGE_ORDER.length; i++) {
    const s = STAGE_ORDER[i]!;
    if (stages.includes(s)) return s;
  }
  return null;
}

/** The previous menu that was actually shown. Escape at the first one quits. */
export function prevStage(c: PlayerChoices, p: PlayerPick, stage: PlayerFocus): PlayerStage | null {
  const stages = shownStages(c, p);
  const from = STAGE_ORDER.indexOf(stage);
  for (let i = from - 1; i >= 0; i--) {
    const s = STAGE_ORDER[i]!;
    if (stages.includes(s)) return s;
  }
  return null;
}

/** Tab: the next (or previous) menu, wrapping at either end. */
export function cycleStage(c: PlayerChoices, p: PlayerPick, stage: PlayerFocus, back = false): PlayerStage {
  const stages = shownStages(c, p);
  const at = stages.indexOf(stage);
  if (at < 0) return back ? stages[stages.length - 1]! : stages[0]!;
  const step = back ? -1 : 1;
  return stages[(at + step + stages.length) % stages.length]!;
}

/** Arrows: the next allowed choice inside one menu, or null at its edge. */
export function moveChoice(c: PlayerChoices, p: PlayerPick, stage: PlayerStage, delta: -1 | 1): PlayerPick | null {
  switch (stage) {
    case "role": {
      const role = p.role + delta;
      return role < 0 || role >= c.roles.length ? null : withRole(c, p, role);
    }
    case "race": {
      for (let ra = p.race + delta; ra >= 0 && ra < c.races.length; ra += delta) {
        if (c.validRace[p.role][ra]) return withRace(c, p, ra);
      }
      return null;
    }
    case "gender": {
      for (let g = p.gender + delta; g >= 0 && g < GENDERS.length; g += delta) {
        if (c.validGender[p.role][p.race][g]) return { ...p, gender: g };
      }
      return null;
    }
    case "align": {
      for (let a = p.align + delta; a >= 0 && a < ALIGNS.length; a += delta) {
        if (c.validAlign[p.role][p.race][a]) return { ...p, align: a };
      }
      return null;
    }
  }
}

/** The tty's `*`: randomise the active menu only, then let the caller advance. */
export function randomStage(c: PlayerChoices, p: PlayerPick, stage: PlayerStage, random: Random = mathRandom): PlayerPick {
  switch (stage) {
    case "role":
      return withRole(c, p, random(c.roles.length));
    case "race": {
      const allowed = indices(c.races.length, (ra) => c.validRace[p.role][ra]);
      return allowed.length ? withRace(c, p, allowed[random(allowed.length)]!) : p;
    }
    case "gender": {
      const allowed = indices(GENDERS.length, (g) => c.validGender[p.role][p.race][g]);
      return allowed.length ? { ...p, gender: allowed[random(allowed.length)]! } : p;
    }
    case "align": {
      const allowed = indices(ALIGNS.length, (a) => c.validAlign[p.role][p.race][a]);
      return allowed.length ? { ...p, align: allowed[random(allowed.length)]! } : p;
    }
  }
}
