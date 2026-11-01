// Sends an online game's recording to the server as it's written, one batch of lines at a time. The server's
// copy is the only one, and the client can't change what's there, so it starts from what the server says it holds.

const DEBOUNCE_MS = 1000;
const RETRY_MS = 5000;
/** The server's limit on a batch's text. */
export const MAX_BATCH = 256 * 1024;

export type WriteResult = "stored" | "exists" | "failed";

/** What the player should know: lines aren't getting through for now, or another tab has taken the game on. */
export type UploadNotice = "unsent" | "elsewhere";

export interface LogPosition {
  /** Goes up when the recording is cut back, so that lines numbered again get new IDs. */
  generation: number;
  /** Lines the server holds. */
  sent: number;
}

export interface UploadDeps {
  /** "exists" for a batch already there, which keeps what it first held. */
  write(game: string, id: string, lines: string, sentAt: number): Promise<WriteResult>;
  now(): number;
  notice(notice: UploadNotice | null): void;
}

export function batchId(generation: number, firstLine: number): string {
  return `${String(generation).padStart(4, "0")}-${String(firstLine).padStart(10, "0")}`;
}

function linesOf(text: string): string[] {
  return text.split("\n").filter((line, i, all) => line !== "" || i < all.length - 1);
}

export class LogUploader {
  private lines: string[] = [];
  /** Lines since the core last stopped to wait: a recording must end at a wait, for a replay to hand over there. */
  private held: string[] = [];
  private generation: number;
  private sent: number;
  /** Lines in the batch on its way, which go again exactly as they were if its answer doesn't come. */
  private inflight = 0;
  private retrying = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = false;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly deps: UploadDeps,
    private readonly game: string,
    position: LogPosition,
  ) {
    this.generation = position.generation;
    this.sent = position.sent;
  }

  /** What the recording held when the game came back, which may be less than the server's if it was cut back. */
  before(text: string): void {
    this.lines = linesOf(text);
    if (this.lines.length < this.sent) {
      this.generation++;
      this.sent = this.lines.length;
    }
    this.wait(0);
  }

  add(lines: string[], atPrompt: boolean): void {
    this.held.push(...lines);
    if (!atPrompt || !this.held.length) return;
    this.lines.push(...this.held);
    this.held = [];
    // a session's last lines, with the page about to go
    if (/^\d+ end /.test(this.lines.at(-1)!)) this.wait(0);
    // left running if it is, or steady play would never send
    else if (!this.timer) this.wait(DEBOUNCE_MS);
  }

  /** Tries now, for a page that's closing. */
  flushNow(): void {
    void this.flush();
  }

  /** When everything so far has reached the server, or never will. */
  settled(): Promise<void> {
    if (this.done()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private done(): boolean {
    return this.stopped || this.sent >= this.lines.length;
  }

  /** The whole recording, when the game ends. */
  finished(text: string): void {
    this.lines = linesOf(text);
    this.held = [];
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
    for (let i = this.sent; i < this.lines.length; i++) {
      size += this.lines[i].length + (count ? 1 : 0);
      if (size > MAX_BATCH) break;
      count++;
    }
    return count;
  }

  private async flush(): Promise<void> {
    if (this.busy || this.stopped || this.sent >= this.lines.length) return;
    const count = this.inflight || this.fit();
    if (!count) {
      this.stopped = true;
      console.warn(`upload stopped: line ${this.sent + 1} is longer than a batch can hold`);
      this.waiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    this.inflight = count;
    this.busy = true;
    const text = this.lines.slice(this.sent, this.sent + count).join("\n");
    const result = await this.deps.write(this.game, batchId(this.generation, this.sent + 1), text, this.deps.now());
    this.busy = false;
    if (result === "failed") {
      this.retrying = true;
      this.deps.notice("unsent");
      this.wait(RETRY_MS);
      return;
    }
    // sent again, it's the answer that was lost; sent for the first time, someone else wrote these lines
    if (result === "exists" && !this.retrying) {
      this.stopped = true;
      this.deps.notice("elsewhere");
      this.waiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    this.retrying = false;
    this.sent += count;
    this.inflight = 0;
    this.deps.notice(null);
    if (this.done()) this.waiters.splice(0).forEach((resolve) => resolve());
    else if (!this.timer) void this.flush();
  }
}
