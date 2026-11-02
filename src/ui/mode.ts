// What the game page leaves to the mode being played. A replay has none.
import type { GameEvent, StartOptions } from "../protocol";

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
  /** A finished game's recording; true if it's kept for replaying. */
  finished(text: string): boolean;
  /** A seed for the core, or null if there won't be one, which the mode has shown. */
  seed(): Promise<{ seed: number; now: number } | null>;
  /** Whatever has to happen before Save & Quit leaves the page. */
  leaving(): Promise<void>;
  /** The page is going, with no time to wait for anything. */
  closing(): void;
  /** Where a game that can't come back can start again instead. */
  newGameAddress(): string;
}
