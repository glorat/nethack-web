import { lastInjectionIn } from "../port/recording";
import type { SeedReply } from "../protocol";
import { type Authority, type Injection, soleTab } from "../worker/authority";
import type { AskSeed } from "../worker/mode";

/** The turn the first injected seed goes in at; each one's reply says where the next goes. */
export const FIRST_INJECTION = 1;

/** Everything comes from the server. Bones stay out until the server has its own, so none cross over from offline games. */
export async function onlineAuthority(game: string, utcOffset: number, firstNow: number, recording: string, askSeed: AskSeed): Promise<Authority> {
  return {
    alone: await soleTab("nethack-online-game"),
    utcOffset: () => utcOffset,
    ...serverSeeds(firstNow, recording, askSeed),
    uuid: () => game,
    bonesWanted: async () => null,
    bonesLeft() {},
  };
}

/** Where the next injected seed goes in, and how many turns before that to ask for it, as the last `reseed` line says. */
function nextInjection(last: string | null): { at: number; ahead: number } {
  const [at, ahead] = (last ?? "").split(" ").map(Number);
  return Number.isInteger(at) && Number.isInteger(ahead) ? { at, ahead } : { at: FIRST_INJECTION, ahead: 0 };
}

/**
 * The core's seeds and the server's clock, and seeds to inject on the server's timetable, which the recording holds.
 * Each is asked for without stopping play, and goes in at the first turn at or after its point, where play waits only
 * if it hasn't come.
 */
export function serverSeeds(firstNow: number, recording: string, askSeed: AskSeed): Pick<Authority, "now" | "randomSeed" | "injectedSeed"> {
  let now = firstNow;
  let asked: { at: number; reply: Promise<SeedReply> } | null = null;

  const ask = (at: number) => (asked = { at, reply: askSeed(at) });
  const took = (reply: SeedReply) => {
    now = Math.max(now, reply.now);
    return reply;
  };

  // the first is due at once, so it's on its way while the core makes the first level
  if (lastInjectionIn(recording) === null) ask(FIRST_INJECTION);

  return {
    now: () => now,
    async randomSeed() {
      return took(await askSeed()).seed;
    },
    injectedSeed(turn, last) {
      const next = nextInjection(last);
      if (turn < next.at - next.ahead) return null;
      const pending = asked?.at === next.at ? asked : ask(next.at);
      if (turn < next.at) return null;
      asked = null;
      return pending.reply.then((reply): Injection => ({ seed: took(reply).seed, schedule: `${next.at + reply.validTurns} ${reply.askAheadTurns}` }));
    },
  };
}
