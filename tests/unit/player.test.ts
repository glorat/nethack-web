import { expect, test } from "vitest";
import { randomPick, withRace, withRole } from "../../src/port/player";
import type { PlayerChoices } from "../../src/protocol";

// Valkyrie: human or dwarf, female, lawful or neutral. Wizard: human or elf, neutral or chaotic.
// Humans may be any alignment; dwarves only lawful; elves only chaotic.
const VALK = 0, WIZ = 1;
const HUMAN = 0, DWARF = 1, ELF = 2;
const MALE = 0, FEMALE = 1;
const LAWFUL = 0, NEUTRAL = 1, CHAOTIC = 2;

const roleRaces = [[HUMAN, DWARF], [HUMAN, ELF]];
const roleGenders = [[FEMALE], [MALE, FEMALE]];
const roleAligns = [[LAWFUL, NEUTRAL], [NEUTRAL, CHAOTIC]];
const raceAligns = [[LAWFUL, NEUTRAL, CHAOTIC], [LAWFUL], [CHAOTIC]];

function choices(chosen: Partial<PlayerChoices["chosen"]> = {}): PlayerChoices {
  const valid = (ro: number, ra: number) => roleRaces[ro].includes(ra);
  return {
    roles: [
      { name: "Valkyrie", femaleName: "Valkyrie", tile: 1, femaleTile: 2 },
      { name: "Wizard", femaleName: "Wizard", tile: 3, femaleTile: 4 },
    ],
    races: [
      { name: "human", tile: 5, femaleTile: 6 },
      { name: "dwarf", tile: 7, femaleTile: 8 },
      { name: "elf", tile: 9, femaleTile: 10 },
    ],
    validRace: [0, 1].map((ro) => [0, 1, 2].map((ra) => valid(ro, ra))),
    validGender: [0, 1].map((ro) => [0, 1, 2].map((ra) => [0, 1].map((g) => valid(ro, ra) && roleGenders[ro].includes(g)))),
    validAlign: [0, 1].map((ro) =>
      [0, 1, 2].map((ra) => [0, 1, 2].map((a) => valid(ro, ra) && roleAligns[ro].includes(a) && raceAligns[ra].includes(a))),
    ),
    chosen: { role: -1, race: -1, gender: -1, align: -1, ...chosen },
  };
}

test("picking a role moves the race, gender and alignment to ones it allows", () => {
  const c = choices();
  const wizardElf = { role: WIZ, race: ELF, gender: MALE, align: CHAOTIC };
  expect(withRole(c, wizardElf, VALK)).toEqual({ role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL });
});

test("picking a role keeps choices it still allows", () => {
  const c = choices();
  expect(withRole(c, { role: VALK, race: HUMAN, gender: FEMALE, align: NEUTRAL }, WIZ)).toEqual({
    role: WIZ,
    race: HUMAN,
    gender: FEMALE,
    align: NEUTRAL,
  });
});

test("picking a race moves the role to one that allows it", () => {
  const c = choices();
  expect(withRace(c, { role: VALK, race: HUMAN, gender: FEMALE, align: NEUTRAL }, ELF)).toEqual({
    role: WIZ,
    race: ELF,
    gender: FEMALE,
    align: CHAOTIC,
  });
});

test("a random pick keeps what the options chose and is always allowed", () => {
  for (let seed = 0; seed < 50; seed++) {
    let n = seed;
    const random = (k: number) => n++ % k;
    const p = randomPick(choices({ race: DWARF }), random);
    expect(p.race).toBe(DWARF);
    expect(p.role).toBe(VALK);
    expect(p).toMatchObject({ gender: FEMALE, align: LAWFUL });

    const q = randomPick(choices(), random);
    const c = choices();
    expect(c.validRace[q.role][q.race]).toBe(true);
    expect(c.validGender[q.role][q.race][q.gender]).toBe(true);
    expect(c.validAlign[q.role][q.race][q.align]).toBe(true);
  }
});
