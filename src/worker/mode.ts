// What the worker leaves to the mode being played: where answers and files come from, and where the game is kept.
import type { SeedReply } from "../protocol";
import type { Authority, Files } from "./authority";
import type { NetHackModule } from "./memory";

/** Asks for the core's next seed, or with `turn`, for one to inject at that turn. */
export type AskSeed = (turn?: number) => Promise<SeedReply>;

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
  /** The high score file a finished game left, and the game log's last line, if they're for the page to keep. */
  scores(m: NetHackModule): { record: string; last: string | null } | null;
}
