// A second core that follows a game by its recording as it's written, to catch
// a game that wouldn't replay while it's being played. See docs/recording.md.
import type { ShadowStatus } from "../protocol";
import type { NetHackModule } from "./memory";
import { type BootCore, parseLine, type RecordedSession, replay, saveFiles } from "./replayer";

// said once a session, in the recording's opening lines
const SKIPPED = new Set(["opt", "rc", "alone"]);

export class Shadow {
  private beforeText = "";
  /** Lines the core mustn't have yet: it might run past the end of them before the rest come. */
  private held: string[] = [];
  private session: RecordedSession | null = null;
  private started = false;
  private lineCount = 0;
  private sawEnd = false;
  private turn = 0;
  private core: NetHackModule | null = null;
  private wake: (() => void) | null = null;
  private finished = false;

  constructor(
    private readonly boot: BootCore,
    private readonly bones: (hash: string) => Uint8Array | undefined,
    private readonly status: (status: ShadowStatus) => void,
  ) {}

  /** It has done all it can with the lines it was let have, and is at their end or has stopped. */
  get idle(): boolean {
    return !this.started || this.finished || this.wake !== null;
  }

  /** What the recording already held, before the lines to come. */
  before(text: string): void {
    // an earlier build may have written these, and a rebuild moves the pointers they hash
    this.beforeText = text.replace(/^(\d+ lv) \S+$/gm, "$1 -");
  }

  add(lines: string[], atPrompt: boolean): void {
    this.held.push(...lines);
    if (!atPrompt) return;
    const released = this.held;
    this.held = [];
    if (!this.started) this.start(released);
    else this.release(released);
  }

  private start(first: string[]): void {
    this.started = true;
    const text = this.beforeText + first.map((l) => `${l}\n`).join("");
    this.sawEnd = first.some((l) => /^\d+ end /.test(l));
    this.lineCount = text.split("\n").length - 1;
    if (/^\d+ session (?:unrecorded|recover) /m.test(text)) {
      this.finished = true;
      this.status({ state: "unrecorded", turn: 0 });
      return;
    }
    const boot: BootCore = (session, files, host) =>
      this.boot(session, files, (m) => {
        this.core = m;
        return host(m);
      });
    replay(
      text,
      boot,
      {
        post: () => {},
        pace: ({ turn }) => {
          if (turn !== undefined) {
            this.turn = turn;
            this.status({ state: "following", turn });
          }
          return Promise.resolve();
        },
        delay: () => Promise.resolve(),
        bones: this.bones,
        sameBuild: true,
        more: () => new Promise((resolve) => (this.wake = resolve)),
      },
      (last) => (this.session = last),
    ).then(
      () => {
        this.finished = true;
        this.status(
          this.sawEnd
            ? { state: "ended", turn: this.turn }
            : { state: "mismatch", turn: this.turn, message: "the core stopped where the recording went on" },
        );
      },
      (e: unknown) => {
        this.finished = true;
        this.status({
          state: "mismatch",
          turn: this.turn,
          message: e instanceof Error ? e.message : String(e),
          files: this.core ? Object.fromEntries([...saveFiles(this.core)].filter(([f]) => !/^(record|logfile|xlogfile)$/.test(f))) : undefined,
        });
      },
    );
  }

  private release(lines: string[]): void {
    for (const raw of lines) {
      const line = parseLine(raw, ++this.lineCount);
      if (line.tag === "end") this.sawEnd = true;
      if (!SKIPPED.has(line.tag)) this.session?.lines.push(line);
    }
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}
