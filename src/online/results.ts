// A player's finished online games, as the server lists them. Its replay of a game is the result, so until that has
// run a game has no score.

export interface GameResult {
  points?: number;
  turns?: number;
  role?: string;
  race?: string;
  gender?: string;
  align?: string;
  death?: string;
  deathlev?: number;
  maxlvl?: number;
}

export interface FinishedGame {
  game: string;
  name: string;
  startedAt: number;
  endedAt: number;
  /** The server has replayed it: without a result, that replay couldn't score it. */
  checked: boolean;
  result?: GameResult;
}

/** What a row says of a game: its character and how it ended, or why there's no score. */
export function outcome({ name, checked, result }: FinishedGame): string {
  if (!result) return checked ? `${name}: the server couldn't score this game` : `${name}: scored once the server has replayed the game, within a few hours`;
  const character = [result.role, result.race].filter(Boolean).join("-");
  const turn = result.turns !== undefined ? `, turn ${result.turns.toLocaleString()}` : "";
  return `${name}${character ? ` (${character})` : ""}: ${result.death ?? "ended"}${turn}`;
}

export const ascended = (result: GameResult | undefined): boolean => /^ascended\b/.test(result?.death ?? "");

/** An address for the game page that watches a finished online game. */
export function watchAddress(path: string, game: string): string {
  return `${path}?${new URLSearchParams({ replay: "", online: "", game })}`;
}

/** The online game a replay address names, or null if it names none. */
export function watchedGame(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.has("replay") && params.has("online") ? params.get("game") || null : null;
}
