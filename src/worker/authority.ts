// What decides a game's outcome from outside the core. Who answers can change
// while the rest of the host, the page and its storage, stays the same.
import type { AuthorityChoice, FixedInputs } from "../protocol";
import { BonesDb } from "./bones";
import type { NetHackModule } from "./memory";

export interface Authority {
  /** No other tab is playing, so a game left unfinished can't be one still going on there. */
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

type Files = () => NetHackModule["FS"];

/** Whether this is the only tab playing; if so, it stays that until this worker ends. */
function soleTab(): Promise<boolean> {
  return new Promise((resolve) => {
    // absent outside https and localhost, where the game in progress is asked about as before
    if (!navigator.locks) return resolve(false);
    void navigator.locks.request("nethack-game", { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

/** A version 4 UUID; crypto.randomUUID is missing outside https and localhost. */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function browserAuthority(files: Files): Promise<Authority> {
  // taken once, so a game doesn't change zone as daylight saving starts or ends
  const utcOffset = -new Date().getTimezoneOffset() * 60;
  return {
    alone: await soleTab(),
    now: () => Math.floor(Date.now() / 1000),
    utcOffset: () => utcOffset,
    randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    uuid,
    bonesWanted: async (name) => new BonesDb(files()).take(name),
    bonesLeft(name, data, wizard) {
      if (!wizard) new BonesDb(files()).keep(name, data);
    },
  };
}

/** Each seed is one more than the last, as different as real ones, not all the same. */
async function fixedAuthority(inputs: FixedInputs, files: Files): Promise<Authority> {
  let seed = inputs.seed;
  return {
    ...(await browserAuthority(files)),
    now: () => inputs.now,
    utcOffset: () => inputs.utcOffset,
    randomSeed: () => seed++,
    uuid: () => inputs.uuid,
  };
}

export type AskSeed = () => Promise<{ seed: number; now: number }>;

/** Everything comes from the server. Bones stay out until the server has its own, so none cross over from offline games. */
async function onlineAuthority(game: string, utcOffset: number, firstNow: number, askSeed: AskSeed): Promise<Authority> {
  let now = firstNow;
  return {
    alone: await soleTab(),
    now: () => now,
    utcOffset: () => utcOffset,
    async randomSeed() {
      const reply = await askSeed();
      now = reply.now;
      return reply.seed;
    },
    uuid: () => game,
    bonesWanted: async () => null,
    bonesLeft() {},
  };
}

export function createAuthority(choice: AuthorityChoice, files: Files, askSeed: AskSeed): Promise<Authority> {
  if (import.meta.env.DEV && choice.kind === "online") return onlineAuthority(choice.game, choice.utcOffset, choice.now, askSeed);
  return import.meta.env.DEV && choice.kind === "fixed" ? fixedAuthority(choice.inputs, files) : browserAuthority(files);
}
