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

export const ascended = (score: Score): boolean => /^ascended\b/.test(score.death);

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
