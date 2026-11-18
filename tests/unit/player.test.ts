import { expect, test } from "vitest";
import { cycleStage, moveChoice, nextStage, prevStage, randomPick, randomStage, shownStages, withRace, withRole } from "../../src/port/player";
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

test("Tab cycles the boxes that are shown, in both directions", () => {
  const c = choices();
  const wiz = { role: WIZ, race: HUMAN, gender: MALE, align: NEUTRAL };
  expect(shownStages(c, wiz)).toEqual(["role", "race", "gender", "align"]);
  expect(cycleStage(c, wiz, "role")).toBe("race");
  expect(cycleStage(c, wiz, "race")).toBe("gender");
  expect(cycleStage(c, wiz, "gender")).toBe("align");
  expect(cycleStage(c, wiz, "align")).toBe("role");
  expect(cycleStage(c, wiz, "role", true)).toBe("align");
  expect(cycleStage(c, wiz, "align", true)).toBe("gender");

  // Valkyries skip gender and wrap from alignment back to role.
  const valk = { role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL };
  expect(shownStages(c, valk)).toEqual(["role", "race", "align"]);
  expect(cycleStage(c, valk, "race")).toBe("align");
  expect(cycleStage(c, valk, "align")).toBe("role");
  expect(cycleStage(c, valk, "role", true)).toBe("align");
});

test("arrows move only within the active box and skip choices it rules out", () => {
  const c = choices();
  const wiz = { role: WIZ, race: HUMAN, gender: MALE, align: NEUTRAL };
  expect(moveChoice(c, { role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL }, "role", 1)?.role).toBe(WIZ);

  // Dwarves are not a Wizard race, so down from human lands on elf.
  expect(moveChoice(c, wiz, "race", 1)).toMatchObject({ role: WIZ, race: ELF, align: CHAOTIC });
  expect(moveChoice(c, { ...wiz, race: ELF, align: CHAOTIC }, "race", 1)).toBe(null);
  expect(moveChoice(c, wiz, "gender", 1)?.gender).toBe(FEMALE);
  expect(moveChoice(c, { role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL }, "gender", 1)).toBe(null);
  expect(moveChoice(c, wiz, "align", 1)?.align).toBe(CHAOTIC);
  expect(moveChoice(c, { ...wiz, race: ELF, align: CHAOTIC }, "align", -1)).toBe(null);
});

test("the tty sequence skips stages with only one valid choice", () => {
  const c = choices();
  // Valkyries allow two races but only female, so gender is skipped.
  const valk = { role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL };
  expect(nextStage(c, valk, "role")).toBe("race");
  expect(nextStage(c, valk, "race")).toBe("align");
  expect(nextStage(c, valk, "gender")).toBe("align");
  expect(nextStage(c, valk, "align")).toBe(null);

  // Wizards allow both genders and more than one alignment, so every stage is shown.
  const wiz = { role: WIZ, race: HUMAN, gender: MALE, align: NEUTRAL };
  expect(nextStage(c, wiz, "role")).toBe("race");
  expect(nextStage(c, wiz, "race")).toBe("gender");
  expect(nextStage(c, wiz, "gender")).toBe("align");
  expect(nextStage(c, wiz, "align")).toBe(null);
});

test("a random stage changes only that facet", () => {
  const c = choices();
  const wiz = { role: WIZ, race: HUMAN, gender: MALE, align: NEUTRAL };
  expect(randomStage(c, wiz, "gender", () => 1)).toEqual({ ...wiz, gender: FEMALE });
  expect(randomStage(c, wiz, "align", () => 1)).toEqual({ ...wiz, align: CHAOTIC });
  expect(randomStage(c, wiz, "race", () => 0)).toEqual(wiz);
  // A random role still settles the other facets to ones it allows.
  expect(randomStage(c, wiz, "role", () => 0)).toEqual({
    role: VALK,
    race: HUMAN,
    gender: FEMALE,
    align: NEUTRAL,
  });
});

test("escape walks back through the menus that were shown", () => {
  const c = choices();
  const valk = { role: VALK, race: HUMAN, gender: FEMALE, align: LAWFUL };
  // Valkyries skip gender, so alignment goes back to race, and play to alignment.
  expect(prevStage(c, valk, "role")).toBe(null);
  expect(prevStage(c, valk, "race")).toBe("role");
  expect(prevStage(c, valk, "align")).toBe("race");

  const wiz = { role: WIZ, race: HUMAN, gender: MALE, align: NEUTRAL };
  expect(prevStage(c, wiz, "race")).toBe("role");
  expect(prevStage(c, wiz, "gender")).toBe("race");
  expect(prevStage(c, wiz, "align")).toBe("gender");
});
