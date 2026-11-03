// The status panel's lines under the hero's name, as Cocoa words them (wincocoa.m RoleText, LevelText).

/** "Neutral human valkyrie", or "Neutral (human) newt" while polymorphed. */
export function heroText(alignment: string, kind: string): string {
  return [alignment, kind].filter(Boolean).join(" ");
}

/** "The Gnomish Mines 3: level 5", or "The Dungeons of Doom: level 5" where the two agree. */
export function levelText(description: string, dungeon: string, level: number): string {
  if (!dungeon || description === dungeon) return description;
  if (!description.startsWith("Dlvl:")) return `${dungeon}: ${description}`;
  const depth = description.slice(5).trim();
  if (Number(depth) === level) return `${dungeon}: level ${depth}`;
  return `${dungeon} ${level}: level ${depth}`;
}
