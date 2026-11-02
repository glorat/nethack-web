// What the worker leaves to the mode being played: where answers and files come from, and where the game is kept.
import type { Authority, Files } from "./authority";
import type { NetHackModule } from "./memory";

export type AskSeed = () => Promise<{ seed: number; now: number }>;

export interface WorkerMode {
  authority(files: Files, askSeed: AskSeed): Promise<Authority>;
  /**
   * The browser keeps the game: /save lasts in IndexedDB, a game left there unfinished comes back by replay,
   * and one that can't be replayed is the player's to decide about.
   */
  readonly keptHere: boolean;
  /** The recording so far when it's kept elsewhere, as nothing here holds it; empty for a new game. */
  readonly recording: string;
  /** The page has a use for what the recording already held when the game comes back. */
  readonly wantsRecordingSoFar: boolean;
  /** The bones a replay can read, by hash, from the files given; they're only read once one is wanted. */
  bones(files: Files): (hash: string) => Uint8Array | undefined;
  /** Puts what a replay left of the game named in the /save of the core that carries on. */
  place(m: NetHackModule, name: string, files: Map<string, Uint8Array>): void;
  /** The high score file a finished game left, if it's for the page to keep. */
  scores(m: NetHackModule): string | null;
}
