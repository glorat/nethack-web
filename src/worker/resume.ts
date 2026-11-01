// Brings back a game whose page closed, by replaying its recording and letting
// the player carry on from the end of it. See docs/recording.md.
import type { Answer, GameEvent, GameRequest } from "../protocol";
import { type GameHost, type Input, RESUMING } from "./game";
import type { NetHackModule } from "./memory";
import type { Recorder } from "./recorder";
import { type BootCore, never, parseRecording, type RecordedSession, replay, ReplayError, type ReplayHost, writeSaveFiles } from "./replayer";

const OUT: unique symbol = Symbol("out");
// as long as Game pauses for the core's delay_output
const DELAY_MS = 50;

/** Answers from the recording until it runs out, then from the player through `handOver`. */
export class ResumedHost implements GameHost {
  private live: GameHost | null = null;

  constructor(
    private readonly replayed: ReplayHost,
    private readonly handOver: () => GameHost,
  ) {}

  get alone(): boolean {
    return (this.live ?? this.replayed).alone;
  }

  post(events: GameEvent[]): void {
    (this.live ?? this.replayed).post(events);
  }

  async request(request: GameRequest): Promise<Answer | null> {
    if (!this.live) {
      const answer = await this.untilOut(this.replayed.request(request));
      if (answer !== OUT) return answer;
    }
    return this.liveHost().request(request);
  }

  async nextInput(request: Extract<GameRequest, { kind: "poskey" }>): Promise<Input> {
    if (!this.live) {
      const input = await this.untilOut(this.replayed.nextInput());
      if (input !== OUT) return input;
    }
    return this.liveHost().nextInput(request);
  }

  persist(exiting?: boolean): Promise<void> {
    return (this.live ?? this.replayed).persist(exiting);
  }

  async bonesWanted(name: string): Promise<Uint8Array | null> {
    if (!this.live) {
      const data = await this.untilOut(this.replayed.bonesWanted(name));
      if (data !== OUT) return data;
    }
    return this.liveHost().bonesWanted(name);
  }

  bonesLeft(name: string, data: Uint8Array, wizard: boolean): void {
    (this.live ?? this.replayed).bonesLeft(name, data, wizard);
  }

  delayOutput(): Promise<void> {
    return this.live ? new Promise((resolve) => setTimeout(resolve, DELAY_MS)) : this.replayed.delayOutput();
  }

  now(): number {
    return (this.live ?? this.replayed).now();
  }

  utcOffset(): number {
    return (this.live ?? this.replayed).utcOffset();
  }

  randomSeed(): number | Promise<number> {
    return (this.live ?? this.replayed).randomSeed();
  }

  uuid(): string {
    return (this.live ?? this.replayed).uuid();
  }

  // a failed replay's core must wait for good: Game would answer a rejection and let it run on
  private untilOut<T>(answer: Promise<T>): Promise<T | typeof OUT> {
    const out: Promise<typeof OUT> = this.replayed.finished.then(() => (this.replayed.diverged ? never() : OUT));
    return Promise.race<T | typeof OUT>([answer, out]);
  }

  private liveHost(): GameHost {
    return (this.live ??= this.handOver());
  }
}

/**
 * Makes a core's /save, read from where it's kept, what the replay left of this
 * game; nothing lasts until the player has taken over and the next persist.
 */
export function placeGameFiles(m: NetHackModule, name: string, files: Map<string, Uint8Array>): void {
  const isGame = (f: string) => f === name || f.startsWith(`${name}.`);
  for (const f of m.FS.readdir("/save")) if (isGame(f)) m.FS.unlink(`/save/${f}`);
  if (m.FS.analyzePath(RESUMING).exists) m.FS.unlink(RESUMING);
  // the rest of /save is shared with other games, and the replay has only its own idea of it
  writeSaveFiles(m, new Map([...files].filter(([f]) => isGame(f))));
}

export interface ResumeCores {
  /** Boots a core with nothing kept, for each session before the last. */
  boot: BootCore;
  /** Boots the core the player will carry on with, on the real /save. */
  bootLast: BootCore;
  /** The bones with this hash. */
  bones(hash: string): Uint8Array | undefined;
}

/**
 * Replays `text` up to its end. Rejects, with /save untouched, if the game
 * goes differently; the core for the last session is then to be abandoned.
 */
export async function resumeGame(text: string, cores: ResumeCores, post: (events: GameEvent[]) => void): Promise<void> {
  const { sessions } = parseRecording(text);
  const last = sessions.length - 1;
  let at = 0;
  const boot: BootCore = (session: RecordedSession, files, host) => (at++ === last ? cores.bootLast : cores.boot)(session, files, host);
  await replay(text, boot, { post, pace: () => Promise.resolve(), delay: () => Promise.resolve(), bones: cores.bones });
}

/**
 * Plays `text` through `play`, and if it goes differently, once more up to the
 * last line known good. Rejects if there's no such line or that fails too.
 */
export async function resumeToLastGood(text: string, play: (text: string) => Promise<void>): Promise<void> {
  try {
    await play(text);
  } catch (e) {
    if (!(e instanceof ReplayError) || !e.lastGood) throw e;
    console.warn("went back to the last good point of the game", e);
    await play(`${text.split("\n").slice(0, e.lastGood).join("\n")}\n`);
  }
}

/** The host for the core that carries on: hides the replay, then shows the player where it got to. */
export function resumedHost(
  replayed: ReplayHost,
  text: string,
  recorder: Recorder,
  flush: () => void,
): ResumedHost {
  return new ResumedHost(replayed, () => {
    const cut = recorder.carryOn(text, replayed.status);
    flush();
    if (cut) recorder.post([{ type: "message", text: "Your latest moves couldn't be brought back, so your game has gone back a little.", attr: 0 }]);
    return recorder;
  });
}
