// An online game, from the page's side: the server holds it, and answers for what the core can't decide.
// Offline games never come here. Asking waits as long as it takes, and never makes up an answer.

const RETRY_MS = 5000;
/** The server has answered, and asking again won't change that. */
const FINAL = /^functions\/(?:not-found|invalid-argument|permission-denied|unauthenticated)$/;

export interface Build {
  version: string;
  core: string;
}

export interface GameStart {
  name: string;
  utcOffset: number;
  options: string;
  config: string;
  build: Build;
}

export interface OnlineGame {
  game: string;
  utcOffset: number;
  options: string;
  config: string;
  /** The recording so far, and where to carry on writing it. */
  recording: string;
  generation: number;
  /** The server's time, for the clock until the next seed. */
  now: number;
}

export interface GameSummary {
  game: string;
  name: string;
  startedAt: number;
  lastPlayedAt: number;
}

export interface OnlineDeps {
  listGames(input: { sentAt: number }): Promise<{ games: GameSummary[] }>;
  startGame(input: GameStart & { sentAt: number }): Promise<{ game: string; utcOffset: number; options: string; config: string; now: number }>;
  /** The game named, or the player's latest unfinished one under this name; null if there isn't one. */
  resumeGame(input: { game?: string; name: string; build: Build; sentAt: number }): Promise<OnlineGame | null>;
  seed(input: { game: string; turn: number; sentAt: number }): Promise<{ seed: number; now: number; validTurns: number }>;
  now(): number;
  /** Whether play is held up waiting for the server. */
  waiting(on: boolean): void;
}

export function lastTurnIn(text: string): number | null {
  // not ^ with the m flag, which also matches after a U+2028 in typed text
  const found = [...text.matchAll(/(?:^|\n)\d+ T (\d+)/g)].at(-1);
  return found ? Number(found[1]) : null;
}

export function linesIn(text: string): number {
  return text ? text.split("\n").length - 1 : 0;
}

export class OnlineSession {
  private game = "";
  /** The last turn in the recording, or 0 before the first: what a seed is asked for. */
  private turn = 0;
  /** The answer for the turn, which the rest of the turn's seeds count up from. */
  private base: { turn: number; seed: number; now: number; used: number } | null = null;

  constructor(private readonly deps: OnlineDeps) {}

  /** The game asked for, or the player's latest unfinished one, or if there's none or `fresh` is set, a new one. */
  async open(start: GameStart, want: { game?: string; fresh?: boolean }): Promise<OnlineGame> {
    const { name, build } = start;
    const found = want.fresh ? null : await this.untilAnswered(() => this.deps.resumeGame({ ...(want.game ? { game: want.game } : {}), name, build, sentAt: this.deps.now() }));
    const game = found ?? { ...(await this.untilAnswered(() => this.deps.startGame({ ...start, sentAt: this.deps.now() }))), recording: "", generation: 1 };
    this.game = game.game;
    this.turn = lastTurnIn(game.recording) ?? 0;
    return game;
  }

  async seed(): Promise<{ seed: number; now: number }> {
    const { game, turn } = this;
    if (this.base?.turn !== turn) {
      const { seed, now } = await this.untilAnswered(() => this.deps.seed({ game, turn, sentAt: this.deps.now() }));
      this.base = { turn, seed, now, used: 0 };
    }
    return { seed: (this.base.seed + this.base.used++) >>> 0, now: this.base.now };
  }

  /** More of the recording, or all of it when it was cut back, which says what turn it is. */
  recorded(text: string): void {
    this.turn = lastTurnIn(text) ?? this.turn;
  }

  private async untilAnswered<T>(ask: () => Promise<T>): Promise<T> {
    for (let held = false; ; held = true) {
      try {
        const answer = await ask();
        if (held) this.deps.waiting(false);
        return answer;
      } catch (e) {
        if (FINAL.test((e as { code?: string }).code ?? "")) throw e;
        console.warn("the server didn't answer", e);
        if (!held) this.deps.waiting(true);
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }
  }
}

/** Whether the address asks for an online game. */
export function onlineWanted(search: string): boolean {
  return new URLSearchParams(search).has("online");
}

/** An address for the game page: an online game with the player's choices, or `game` to go back to one. */
export function onlineAddress(path: string, name: string, choice: { game: string } | { utcOffset: number }): string {
  const params = new URLSearchParams({ online: "", name });
  if ("game" in choice) params.set("game", choice.game);
  else {
    params.set("new", "");
    params.set("tz", String(choice.utcOffset));
  }
  return `${path}?${params}`;
}

export function chosenZone(search: string, browser: number): number {
  const tz = new URLSearchParams(search).get("tz");
  return tz !== null && Number.isInteger(Number(tz)) && tz !== "" ? Number(tz) : browser;
}

export function zoneLabel(seconds: number): string {
  const minutes = Math.abs(seconds) / 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `UTC${seconds < 0 ? "−" : "+"}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Every whole hour, and the browser's own zone among them, in order. */
export function zoneChoices(browser: number): number[] {
  const hours = Array.from({ length: 27 }, (_, i) => (i - 12) * 3600);
  return [...new Set([...hours, browser])].sort((a, b) => a - b);
}

/** The games a player can go back to; asking waits for no one, as the page can offer to try again. */
export function loadGames(deps: Pick<OnlineDeps, "listGames" | "now">): Promise<GameSummary[]> {
  return deps.listGames({ sentAt: deps.now() }).then((answer) => answer.games);
}
