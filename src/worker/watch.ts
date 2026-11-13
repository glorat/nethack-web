// Plays a recording again and stops before each answer for a watcher to see the game as it stands, as replay
// metrics (src/metrics) and investigations do; replay() itself goes straight through.
import type { GameRequest } from "../protocol";
import { applyEvents, initialState, type GameState } from "../port/state";
import { knownTerrain, type NetHackModule } from "./memory";
import { type BootCore, parseLine, replay, ReplayError, type ReplayedEvent } from "./replayer";

/** The game as a replay stands before each answer. */
export interface Watched {
  state: GameState;
  /** What the game waits for, other than a key; null while it waits for a key. */
  prompt: GameRequest | null;
  /** The recorded answer about to be given, as its tag and the rest of its line ("k", "27"); null if none. */
  answer: { tag: string; rest: string } | null;
  /** What the core reported since the last stop, as achievements and chronicle entries. */
  events: ReplayedEvent[];
  /** #terrain's known map, as Session.terrain gives it. */
  terrain(): number[];
  /** The core itself. */
  core(): NetHackModule;
}

/** Replays `text` on cores from `boot`, calling `watch` before each answer; the error it stopped on, or null. */
export async function replayWatched(text: string, boot: BootCore, watch: (seen: Watched) => Promise<void> | void): Promise<ReplayError | null> {
  let state = initialState();
  let core: NetHackModule | null = null;
  let events: ReplayedEvent[] = [];
  const lines = text.split("\n");
  const answerAt = (at: number | undefined) => {
    const raw = at === undefined ? undefined : lines[at - 1];
    if (raw === undefined) return null;
    const { tag, rest } = parseLine(raw, at!);
    return { tag, rest };
  };
  // a watcher's own error, which the replay would otherwise report as the recording's, or not at all past its end
  let thrown = null as { error: unknown } | null;
  try {
    await replay(
      text,
      (session, files, makeHost) =>
        boot(session, files, (m) => {
          core = m;
          return makeHost(m);
        }),
      {
        post: (posted) => (state = applyEvents(state, posted)),
        pace: async ({ request, line }) => {
          const seen = events;
          events = [];
          try {
            await watch({ state, prompt: request ?? null, answer: answerAt(line), events: seen, terrain: () => knownTerrain(core!), core: () => core! });
          } catch (error) {
            thrown ??= { error };
            throw error;
          }
        },
        delay: () => Promise.resolve(),
        event: (e) => void events.push(e),
      },
    );
  } catch (e) {
    if (thrown) throw thrown.error;
    if (e instanceof ReplayError) return e;
    throw e;
  }
  if (thrown) throw thrown.error;
  return null;
}
