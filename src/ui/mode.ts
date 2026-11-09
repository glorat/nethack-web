// What the game page leaves to the mode being played. A replay has none.
import type { GameEvent, SeedReply, StartOptions } from "../protocol";

/** The core's farewell after Save & Quit, the one ending with nothing left to read. */
export const SAVED_FAREWELL = "Be seeing you...";

export interface GameStart {
  name: string;
  assetBase: string;
  options: string;
  config: string;
  shadowed: boolean;
}

export interface PageMode {
  readonly kind: "online" | "offline";
  /** Keys typed before the game has shown anything were typed without seeing it, and are dropped. */
  readonly dropsUnseenKeys: boolean;
  /** What the worker starts with, or null if the game can't start, which the mode has shown. */
  start(game: GameStart): Promise<StartOptions | null>;
  events(events: GameEvent[]): void;
  /** A finished game's recording. */
  finished(text: string): void;
  /** The address of the finished game's replay, which a reload of it comes back to if the mode can still find the recording. */
  replayAddress(): string;
  /** A seed for the core, or with `turn` one to inject, or null if there won't be one, which the mode has shown. */
  seed(turn?: number): Promise<SeedReply | null>;
  /** Whatever has to happen before Save & Quit leaves the page. */
  leaving(): Promise<void>;
  /** The page is going, with no time to wait for anything. */
  closing(): void;
  /** Where a game that can't come back can start again instead. */
  newGameAddress(): string;
  /** For a game that has just ended, its score as it comes, and how long that's expected to take; absent if it has none. */
  /** `preview`: the points the game itself counted, to show until the server's come. */
  score?(): { expectedMs: number; preview?: number; score: Promise<FinishedScore> } | null;
}

/**
 * A finished game's score: the points and where to see the game, none because it couldn't be scored, or not yet. A game
 * scored for a player not signed in is public as Anonymous until they sign in, at `signIn`.
 */
export type FinishedScore = { kind: "scored"; points?: number; address: string; signIn?: string } | { kind: "unscored" } | { kind: "later" };
