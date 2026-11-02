// Everything comes from this browser: its clock, its randomness and the bones it keeps.
import type { FixedInputs } from "../protocol";
import { type Authority, type Files, soleTab } from "../worker/authority";
import { BonesDb } from "./bones";

/** A version 4 UUID; crypto.randomUUID is missing outside https and localhost. */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function browserAuthority(files: Files): Promise<Authority> {
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
export async function fixedAuthority(inputs: FixedInputs, files: Files): Promise<Authority> {
  let seed = inputs.seed;
  return {
    ...(await browserAuthority(files)),
    now: () => inputs.now,
    utcOffset: () => inputs.utcOffset,
    randomSeed: () => seed++,
    uuid: () => inputs.uuid,
  };
}
