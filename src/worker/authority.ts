// What decides a game's outcome from outside the core. Who answers can change
// while the rest of the host, the page and its storage, stays the same.
import type { NetHackModule } from "./memory";

export interface Authority {
  /** No other tab is playing in this mode, so a game left unfinished can't be one still going on there. */
  readonly alone: boolean;
  /** Seconds since 1970, for every time the core reads. */
  now(): number;
  /** Seconds east of UTC, for the game's local time. */
  utcOffset(): number;
  /** An unguessable 32-bit seed, asked for at the start and at each level change. */
  randomSeed(): number | Promise<number>;
  /** A new game's id, kept in its save and in any bones it leaves. */
  uuid(): string;
  /** The bones the core may load for a level it's making, if any; `name` says which level. */
  bonesWanted(name: string): Promise<Uint8Array | null>;
  /** Bones the core has left for a level, for the host to keep or not. */
  bonesLeft(name: string, data: Uint8Array, wizard: boolean): void;
}

export type Files = () => NetHackModule["FS"];

/** Whether this is the only tab holding `lock`, one for each mode; if so, it stays that until this worker ends. */
export function soleTab(lock: string): Promise<boolean> {
  return new Promise((resolve) => {
    // absent outside https and localhost, where the game in progress is asked about as before
    if (!navigator.locks) return resolve(false);
    void navigator.locks.request(lock, { ifAvailable: true }, (held) => {
      resolve(held !== null);
      return held ? new Promise<void>(() => {}) : undefined;
    });
  });
}
