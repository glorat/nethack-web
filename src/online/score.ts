// Scoring an online game as soon as it ends, rather than waiting for the server's schedule to reach it.
import type { FinishedScore } from "../ui/mode";
import type { GameResult } from "./results";
import { shareAddress } from "./share";

/**
 * How long the server takes to score a game of this many recording lines, from its replays: about a second, 0.8 ms a
 * line, and a few seconds more if it has to start up.
 */
export const expectedScoringMs = (lines: number) => 5000 + 0.8 * lines;

const RETRY_MS = 2000;

export interface ScoreDeps {
  ask(): Promise<{ result?: GameResult }>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/**
 * Asks the server to score a game, asking again while its end is still on the way or the server is busy with it, until
 * `giveUpMs` has passed. Anything else, or running out of time, leaves it to the server's schedule.
 */
export async function scoreGame(game: string, origin: string, giveUpMs: number, deps: ScoreDeps): Promise<FinishedScore> {
  const until = deps.now() + giveUpMs;
  for (;;) {
    try {
      const { result } = await deps.ask();
      return result ? { kind: "scored", points: result.points, address: shareAddress(origin, game) } : { kind: "unscored" };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code !== "functions/aborted" && code !== "functions/failed-precondition") || deps.now() + RETRY_MS > until) {
        console.warn("couldn't score the game now", e);
        return { kind: "later" };
      }
      await deps.sleep(RETRY_MS);
    }
  }
}
