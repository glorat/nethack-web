// A finished online game's chapters: its chronicle, as the server publishes it, to jump to in its replay.

/** A chronicle entry as `/v1/games/{id}/story.json` gives it. */
interface ChronicleEntry {
  turn: number;
  line: number;
  flags: number;
  text: string;
}

export interface Chapter {
  turn: number;
  /** The recording line it happened on; seeking just past it shows it done. */
  line: number;
  text: string;
  kind: "end" | "descent" | "feat" | "event";
}

// the core's livelog flags, from include/global.h
const LL_ACHIEVE = 0x2;
const LL_UMONST = 0x4;
const LL_DIVINEGIFT = 0x8;
const LL_ARTIFACT = 0x40;
const LL_MINORAC = 0x1000;
const LL_DUMP = 0x4000;
const FEATS = LL_ACHIEVE | LL_UMONST | LL_DIVINEGIFT | LL_ARTIFACT | LL_MINORAC;

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function chaptersOf(chronicle: ChronicleEntry[]): Chapter[] {
  return chronicle.map(({ turn, line, flags, text }, i) => ({
    turn,
    line,
    text: capitalised(text),
    // the game's end is the last entry, made only for the dumplog
    kind: i === chronicle.length - 1 && flags === LL_DUMP ? "end" : /^entered level \d/.test(text) ? "descent" : flags & FEATS ? "feat" : "event",
  }));
}

/** A game's chapters, or none if the server has no story for it, as for a game not yet scored. */
export async function loadChapters(game: string): Promise<Chapter[]> {
  const response = await fetch(`/v1/games/${encodeURIComponent(game)}/story.json`);
  if (!response.ok) return [];
  const { chronicle } = (await response.json()) as { chronicle: ChronicleEntry[] };
  return chaptersOf(chronicle);
}

/** Where an address asks the replay to start, by recording line or by turn, and whether to play on from there. */
export function startingPoint(search: string): ({ line: number } | { turn: number }) & { play: boolean } | null {
  const params = new URLSearchParams(search);
  const play = params.get("play") === "1";
  const count = (name: string) => {
    const value = Number(params.get(name));
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  const line = count("line");
  if (line !== null) return { line, play };
  const turn = count("turn");
  return turn !== null ? { turn, play } : null;
}
