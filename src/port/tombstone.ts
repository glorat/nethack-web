// The core's tombstone, from rip.c, engraved as the end of a game engraves it. nethack-server builds this file into its
// functions, for the share card, so it imports nothing.

/** A row: text before the engraving, and on the stone's face, the engraving and the stone's right edge after it. */
export interface Row {
  before: string;
  engraved?: string;
  after?: string;
}

/** The face is this wide, and each engraved line is cut to it. */
const FACE = 18;
const DEATH_WIDTH = 16;

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function centred(text: string, width: number): string {
  const s = text.slice(0, width);
  const left = Math.floor((width - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(width - s.length - left);
}

/** The stone, engraved with who, the score, up to three lines of the death, and the year. */
export function tombstone({ who, points, death, year }: { who: string; points?: number | undefined; death?: string | undefined; year?: number | undefined }): Row[] {
  const engraving = [who, points !== undefined ? `${points.toLocaleString("en-US")} points` : "", ...wrap(death ?? "", DEATH_WIDTH).slice(0, 3), year !== undefined ? String(year) : ""];
  while (engraving.length < 6) engraving.push("");
  return [
    { before: "         ----------" },
    { before: "        /          \\" },
    { before: "       /    REST    \\" },
    { before: "      /      IN      \\" },
    { before: "     /     PEACE      \\" },
    { before: "    /                  \\" },
    ...engraving.map((line) => ({ before: "    |", engraved: centred(line, FACE), after: "|" })),
    { before: "   *|     *  *  *      | *" },
    { before: "____)/\\_//(\\/(/\\)/\\//\\/|_)____" },
  ];
}
