// What the core's xlogfile and record entries say, spelt out. nethack-server builds this file into its functions, so it
// imports nothing.

/** The fields of an entry that these read. */
export interface Entry {
  role?: string | undefined;
  race?: string | undefined;
  gender?: string | undefined;
  align?: string | undefined;
  death?: string | undefined;
}

/** The points an xlogfile line gives, if it has them. */
export function pointsIn(line: string): number | undefined {
  const points = /(?:^|\t)points=(\d+)(?:\t|$)/.exec(line)?.[1];
  return points === undefined ? undefined : Number(points);
}

/** The core's own word for an ascension. */
export const ascended = (entry: Entry | undefined): boolean => entry?.death === "ascended";

/** The core's abbreviations, in its order, with their names; a role's second name is its female one. */
export const ROLES: Record<string, [string, string?]> = {
  Arc: ["Archeologist"], Bar: ["Barbarian"], Cav: ["Caveman", "Cavewoman"], Hea: ["Healer"], Kni: ["Knight"], Mon: ["Monk"],
  Pri: ["Priest", "Priestess"], Rog: ["Rogue"], Ran: ["Ranger"], Sam: ["Samurai"], Tou: ["Tourist"], Val: ["Valkyrie"], Wiz: ["Wizard"],
};
export const RACES: Record<string, string> = { Hum: "Human", Elf: "Elf", Dwa: "Dwarf", Gno: "Gnome", Orc: "Orc" };
export const ALIGNMENTS: Record<string, string> = { Law: "Lawful", Neu: "Neutral", Cha: "Chaotic" };
export const GENDERS: Record<string, string> = { Mal: "Male", Fem: "Female" };

/** "Human Valkyrie", "Elf Priestess": what's missing is left out, and what isn't known is shown as it is. */
export function characterName({ role, race, gender }: Entry): string {
  const names = role ? ROLES[role] : undefined;
  const roleName = names ? (gender === "Fem" && names[1]) || names[0] : role;
  return [race ? (RACES[race] ?? race) : undefined, roleName].filter(Boolean).join(" ");
}

export const alignmentName = ({ align }: Entry): string => (align ? (ALIGNMENTS[align] ?? align) : "");
