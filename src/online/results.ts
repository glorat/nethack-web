// A player's finished online games, as the server lists them. Its replay of a game is the result, so until that has
// run a game has no score.

import { watchAddress } from "../port/modes";

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
  if (!result) return checked ? `${name}: this game couldn't be scored` : `${name}: score not ready yet. It will appear here.`;
  return ending(name, result);
}

function ending(who: string, result: GameResult): string {
  const character = [result.role, result.race].filter(Boolean).join("-");
  const turn = result.turns !== undefined ? `, turn ${result.turns.toLocaleString()}` : "";
  return `${who}${character ? ` (${character})` : ""}: ${result.death ?? "ended"}${turn}`;
}

/** A game on the leaderboard, under its player's handle rather than the character's name. */
export interface LeaderboardEntry {
  /** For a link to the game; missing for one scored before the server kept it there. */
  game?: string;
  /** Null for a player who hasn't chosen one. */
  handle: string | null;
  yours: boolean;
  endedAt?: number;
  result: GameResult;
}

export const standing = ({ handle, result }: LeaderboardEntry): string => ending(handle ?? "Anonymous", result);

export { ascended } from "../port/xlog";

/** An address for the page that watches a finished online game. */
export function gameWatchAddress(game: string): string {
  return `${watchAddress("online")}?${new URLSearchParams({ game })}`;
}

/** The game an online watch page's address names, or null if it names none. */
export function watchedGame(search: string): string | null {
  return new URLSearchParams(search).get("game") || null;
}
