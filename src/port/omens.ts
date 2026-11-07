// What the core says about the real world as a game starts (allmain.c), and its fortune cookies (rumors.c), for the
// landing page to say without loading the core.

/** 0 to 7, with 0 new and 4 full: calendar.c's phase_of_the_moon(). */
export function moonPhase(at: Date): number {
  const startOfYear = new Date(at.getFullYear(), 0, 1);
  const dayOfYear = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - startOfYear.getTime()) / 86_400_000);
  const goldn = ((at.getFullYear() - 1900) % 19) + 1;
  let epact = (11 * goldn + 18) % 30;
  if ((epact === 25 && goldn > 11) || epact === 24) epact++;
  return ((((dayOfYear + epact) * 6 + 11) % 177) / 22) & 7;
}

/** The lines a game starting at this moment opens with, in the core's order. */
export function omens(at: Date): string[] {
  const lines: string[] = [];
  const phase = moonPhase(at);
  if (phase === 4) lines.push("You are lucky!  Full moon tonight.");
  else if (phase === 0) lines.push("Be careful!  New moon tonight.");
  if (at.getDay() === 5 && at.getDate() === 13) lines.push("Watch out!  Bad things can happen on Friday the 13th.");
  return lines;
}

/** The rumors in a file such as rumors.tru, one to a line. */
export const rumors = (text: string): string[] => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** What eating a fortune cookie prints. */
export const cookie = (rumor: string): string[] => ["This cookie has a scrap of paper inside.", "It reads:", rumor];
