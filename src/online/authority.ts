import { type Authority, soleTab } from "../worker/authority";

export type AskSeed = () => Promise<{ seed: number; now: number }>;

/** Everything comes from the server. Bones stay out until the server has its own, so none cross over from offline games. */
export async function onlineAuthority(game: string, utcOffset: number, firstNow: number, askSeed: AskSeed): Promise<Authority> {
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
