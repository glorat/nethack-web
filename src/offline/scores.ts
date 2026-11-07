// The core's high score file, kept where the landing page can read it without loading the core.
// The core keeps only the best few games, so this can't say how many were played.

const SCORES_KEY = "nethack-web.scores";

export interface Score {
  points: number;
  name: string;
  role: string;
  race: string;
  death: string;
  /** As the core writes it, YYYYMMDD. */
  date: number;
}

const LINE = /^\d+\.\d+\.\d+ (\d+) -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ (\d{8}) \d+ -?\d+ (\S+) (\S+) \S+ \S+ ([^,]*),(.*)$/;

export function parseScores(record: string): Score[] {
  return record.split("\n").flatMap((line) => {
    const m = LINE.exec(line);
    return m ? [{ points: Number(m[1]), date: Number(m[2]), role: m[3], race: m[4], name: m[5], death: m[6] }] : [];
  });
}

export { ascended } from "../port/xlog";

/** The core's date as the browser's way of writing one. */
export function scoreDate({ date }: Score): string {
  const at = new Date(Math.floor(date / 10000), Math.floor(date / 100) % 100 - 1, date % 100);
  return at.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function keepScores(record: string): void {
  try {
    localStorage.setItem(SCORES_KEY, record);
  } catch {}
}

export function savedScores(): Score[] {
  try {
    return parseScores(localStorage.getItem(SCORES_KEY) ?? "");
  } catch {
    return [];
  }
}

const LAST_KEY = "nethack-web.lastEnding";

/** The latest game to score, from its line in the core's game log. */
export interface Ending {
  name: string;
  points: number;
  death: string;
  /** As the core writes it, YYYYMMDD. */
  date: number;
}

/** A line of the core's xlogfile: tab-separated fields of the form name=value. */
export function parseEnding(line: string): Ending | null {
  const fields = new Map(line.split("\t").map((f) => [f.slice(0, f.indexOf("=")), f.slice(f.indexOf("=") + 1)] as const));
  const name = fields.get("name");
  const points = Number(fields.get("points"));
  const date = Number(fields.get("deathdate"));
  if (!name || !Number.isFinite(points) || !Number.isFinite(date)) return null;
  return { name, points, death: fields.get("death") ?? "", date };
}

export function keepLastEnding(line: string): void {
  try {
    localStorage.setItem(LAST_KEY, line);
  } catch {}
}

export function lastEnding(): Ending | null {
  try {
    const line = localStorage.getItem(LAST_KEY);
    return line ? parseEnding(line) : null;
  } catch {
    return null;
  }
}
