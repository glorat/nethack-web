// Sends a game's recording to the server as it's written, one batch of lines at a time. The server's copy
// is append-only and the client can't read it, so what has been sent is all kept here.

const STATE_PREFIX = "nethack.upload.game.";
const WANTED_KEY = "nethack.upload";
const DEBOUNCE_MS = 1000;
const RETRY_MS = 5000;
/** The server's limit on a batch's text. */
export const MAX_BATCH = 256 * 1024;

export type WriteResult = "stored" | "exists" | "failed";

export interface UploadState {
  /** Goes up when the recording is cut back, so that lines numbered again get new IDs. */
  generation: number;
  /** Lines the server is known to hold. */
  sent: number;
  /** Lines after those in a batch that may or may not have arrived, which has to be sent again exactly as it was. */
  inflight: number;
  /** The whole recording of a game that has ended, which nothing else will give back once the page has gone. */
  finished?: string;
}

export interface UploadStore {
  load(game: string): UploadState | null;
  save(game: string, state: UploadState | null): void;
  /** Games that ended before all of their recording had been sent. */
  finishedGames(): string[];
}

export interface UploadDeps {
  store: UploadStore;
  /** "exists" for a batch already there, which keeps what it first held. */
  write(game: string, id: string, lines: string, sentAt: number): Promise<WriteResult>;
  now(): number;
}

export function batchId(generation: number, firstLine: number): string {
  return `${String(generation).padStart(4, "0")}-${String(firstLine).padStart(10, "0")}`;
}

/** The recording a game's batches make, sorted by ID: each starts at its line number, replacing anything already from there on. */
export function rebuildRecording(batches: { id: string; lines: string }[]): string {
  const lines: string[] = [];
  for (const { id, lines: text } of batches) {
    lines.length = Math.min(lines.length, Number(id.split("-")[1]) - 1);
    lines.push(...text.split("\n"));
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function linesOf(text: string): string[] {
  return text.split("\n").filter((line, i, all) => line !== "" || i < all.length - 1);
}

function gameOf(lines: string[]): string | null | undefined {
  for (const line of lines) {
    // never replays, so isn't worth having
    if (/^\d+ session (?:unrecorded|recover) /.test(line)) return null;
    const uuid = /^\d+ uuid (\S+)$/.exec(line)?.[1];
    if (uuid) return uuid;
  }
  return undefined;
}

class GameLog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = false;

  constructor(
    private readonly deps: UploadDeps,
    private readonly game: string,
    private lines: string[],
    private state: UploadState,
  ) {}

  /** Opens a game's log from its recording so far, starting a new generation if that holds less than has been sent. */
  static open(deps: UploadDeps, game: string, lines: string[]): GameLog {
    const state = deps.store.load(game) ?? { generation: 1, sent: 0, inflight: 0 };
    if (lines.length < state.sent + state.inflight) {
      state.generation++;
      state.sent = Math.min(state.sent, lines.length);
      state.inflight = 0;
    }
    return new GameLog(deps, game, lines, state);
  }

  add(lines: string[]): void {
    this.lines.push(...lines);
    this.wait(DEBOUNCE_MS);
  }

  finish(text: string): void {
    this.lines = linesOf(text);
    this.state.finished = text;
    this.deps.store.save(this.game, this.state);
    void this.flush();
  }

  flushSoon(): void {
    this.wait(0);
  }

  private wait(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** How many lines from `sent` fit in a batch. */
  private fit(): number {
    let size = 0;
    let count = 0;
    for (let i = this.state.sent; i < this.lines.length; i++) {
      size += this.lines[i].length + (count ? 1 : 0);
      if (size > MAX_BATCH) break;
      count++;
    }
    return count;
  }

  private async flush(): Promise<void> {
    if (this.busy || this.stopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const { state } = this;
    if (state.sent >= this.lines.length) {
      if (state.finished !== undefined) this.deps.store.save(this.game, null);
      return;
    }
    const count = state.inflight || this.fit();
    if (!count) {
      this.stopped = true;
      console.warn(`upload stopped: line ${state.sent + 1} is longer than a batch can hold`);
      return;
    }
    state.inflight = count;
    // before it goes: a page that closes now mustn't later send these lines in a different batch of the same ID
    this.deps.store.save(this.game, state);
    this.busy = true;
    const text = this.lines.slice(state.sent, state.sent + count).join("\n");
    const result = await this.deps.write(this.game, batchId(state.generation, state.sent + 1), text, this.deps.now());
    this.busy = false;
    if (result === "failed") {
      this.wait(RETRY_MS);
      return;
    }
    state.sent += count;
    state.inflight = 0;
    this.deps.store.save(this.game, state);
    if (!this.timer) void this.flush();
  }
}

/** The page's end of the upload: gets the recording's lines, in order, and sends them on. */
export class LogUploader {
  private log: GameLog | null = null;
  /** Lines from before the recording has named its game. */
  private held: string[] = [];
  private off = false;

  constructor(private readonly deps: UploadDeps) {
    for (const game of deps.store.finishedGames()) {
      const text = deps.store.load(game)?.finished;
      if (text !== undefined) GameLog.open(deps, game, linesOf(text)).flushSoon();
    }
  }

  /** What the recording already held, for a game that has come back. */
  before(text: string): void {
    this.held = linesOf(text);
    this.open()?.flushSoon();
  }

  add(lines: string[]): void {
    if (this.off || !lines.length) return;
    if (this.log) return this.log.add(lines);
    this.held.push(...lines);
    this.open()?.add([]);
  }

  /** The whole recording, when the game ends. */
  finished(text: string): void {
    if (this.off) return;
    if (!this.log) {
      this.held = linesOf(text);
      this.open();
    }
    this.log?.finish(text);
  }

  private open(): GameLog | null {
    const game = gameOf(this.held);
    if (game === undefined) return null;
    if (game === null) this.off = true;
    else this.log = GameLog.open(this.deps, game, this.held);
    this.held = [];
    return this.log;
  }
}

/** Whether a developer has asked for the game to be uploaded, by /play/?upload; ?upload=0 stops it. Never in a production build, until there's a server to send to. */
export function uploadWanted(): boolean {
  if (!import.meta.env.DEV) return false;
  const asked = new URLSearchParams(location.search).get("upload");
  try {
    if (asked === "0") localStorage.removeItem(WANTED_KEY);
    else if (asked !== null) localStorage.setItem(WANTED_KEY, "1");
    return localStorage.getItem(WANTED_KEY) === "1";
  } catch {
    return asked !== null && asked !== "0";
  }
}

export const localUploadStore: UploadStore = {
  load(game) {
    try {
      const saved = localStorage.getItem(STATE_PREFIX + game);
      return saved ? (JSON.parse(saved) as UploadState) : null;
    } catch {
      return null;
    }
  },
  save(game, state) {
    try {
      if (state) localStorage.setItem(STATE_PREFIX + game, JSON.stringify(state));
      else localStorage.removeItem(STATE_PREFIX + game);
    } catch {}
  },
  finishedGames() {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(STATE_PREFIX))
        .map((k) => k.slice(STATE_PREFIX.length))
        .filter((game) => localUploadStore.load(game)?.finished !== undefined);
    } catch {
      return [];
    }
  },
};
