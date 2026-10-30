// Plays a recorded game again: each session runs the core afresh, answered
// from the recording instead of the player. See docs/recording.md.
import type { Answer, GameEvent, GameRequest } from "../protocol";
import type { Game, GameHost, Input } from "./game";
import type { NetHackModule } from "./memory";
import { ANSWER_TAGS, checkLine, FORMAT, zoneSeconds } from "./recorder";

export class ReplayError extends Error {}

const NEVER = new Promise<never>(() => {});

interface Line {
  seq: number;
  tag: string;
  rest: string;
}

export interface RecordedSession {
  kind: "new" | "restore" | "recover" | "unrecorded";
  /** For a recovery: the checkpoint of the session before that the game came back from. */
  checkpoint: number;
  options: string;
  config: string;
  lines: Line[];
}

export interface Recording {
  /** Seconds east of UTC, fixed when the game started. */
  utcOffset: number;
  sessions: RecordedSession[];
}

export function parseRecording(text: string): Recording {
  const sessions: RecordedSession[] = [];
  let utcOffset: number | null = null;
  let seq = 0;
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    // [\s\S], as JSON leaves U+2028 and U+2029 in strings, which . doesn't match
    const m = /^(\d+) (\S+)(?: ([\s\S]*))?$/.exec(raw.replace(/\r$/, ""));
    if (!m) throw new ReplayError(`unreadable line: ${raw}`);
    const line = { seq: Number(m[1]), tag: m[2], rest: m[3] ?? "" };
    // each session numbers its lines from 1, so a line lost from the middle shows
    if (line.seq !== (line.seq === 1 ? 1 : seq + 1)) throw new ReplayError(`line ${seq + 1} is missing`);
    seq = line.seq;
    const session = sessions[sessions.length - 1];
    if (line.tag === "nhrec") {
      if (Number(line.rest) !== FORMAT) throw new ReplayError(`recording format ${line.rest}, not ${FORMAT}`);
    } else if (line.tag === "session") {
      const [kind, ...args] = line.rest.split(" ");
      if (kind !== "new" && kind !== "restore" && kind !== "recover" && kind !== "unrecorded")
        throw new ReplayError(`unknown session: ${line.rest}`);
      const tz = /tz=(\S+)/.exec(line.rest)?.[1];
      if (tz && utcOffset === null) utcOffset = zoneSeconds(tz);
      sessions.push({ kind, checkpoint: kind === "recover" ? Number(args[0]) : 0, options: "", config: "", lines: [] });
    } else if (!session) {
      throw new ReplayError(`line ${line.seq} comes before any session`);
    } else if (line.tag === "opt") {
      session.options = JSON.parse(line.rest);
    } else if (line.tag === "rc") {
      session.config = JSON.parse(line.rest);
    } else if (line.tag !== "alone") {
      session.lines.push(line);
    }
  }
  if (!sessions.length) throw new ReplayError("no game in the recording");
  return { utcOffset: utcOffset ?? 0, sessions };
}

const JSON_TEXT = /^("(?:[^"\\]|\\.)*")(?: (-?\d+))?$/;

export function parseAnswer(kind: GameRequest["kind"], rest: string): Answer | null {
  if (rest === "-") return null;
  switch (kind) {
    case "yn": {
      const m = JSON_TEXT.exec(rest);
      if (!m) break;
      return m[2] === undefined ? { kind, key: JSON.parse(m[1]) } : { kind, key: JSON.parse(m[1]), count: Number(m[2]) };
    }
    case "getlin":
      return { kind, text: JSON.parse(rest) };
    case "menu":
      return {
        kind,
        selection: rest
          ? rest.split(" ").map((pick) => {
              const at = pick.lastIndexOf(":");
              return { identifier: Number(pick.slice(0, at)), count: Number(pick.slice(at + 1)) };
            })
          : [],
      };
    case "text":
      return { kind };
    case "ext_cmd":
      return { kind, index: Number(rest) };
    case "player": {
      const [role, race, gender, align] = rest.split(" ").map(Number);
      return { kind, role, race, gender, align };
    }
  }
  throw new ReplayError(`unreadable ${kind} answer: ${rest}`);
}

export function parseInput(line: Line): Input {
  const n = line.rest.split(" ").map(Number);
  return line.tag === "k" ? { key: n[0] } : { click: { x: n[0], y: n[1], button: n[2] } };
}

export interface ReplayHooks {
  /** The events the game shows, as it would to a player. */
  post(events: GameEvent[]): void;
  /** Waited for before each answer, to set the pace; resolves at once to go as fast as the core can. */
  pace(): Promise<void>;
  /** The core has reached checkpoint `n` of this session. */
  checkpoint(n: number): void;
}

/** How a session's replay stopped: at its recorded end, or where its recording ran out. */
export type SessionEnd = "end" | "out";

/**
 * Answers the core from one session's recording, checking as it goes that
 * the core is where the recording says it was.
 */
export class ReplayHost implements GameHost {
  // the recording says what was answered about an old game, so the question must be asked
  readonly alone = false;
  game: Game | null = null;
  private at = 0;
  private status: Record<string, string> = {};
  private finish!: (end: SessionEnd) => void;
  readonly finished = new Promise<SessionEnd>((resolve) => (this.finish = resolve));
  private failed: ((e: ReplayError) => void) | null = null;
  readonly failure = new Promise<never>((_, reject) => (this.failed = reject));
  /** Past the session's end, or stopped: the core is never answered again. */
  private done = false;

  constructor(
    private readonly session: RecordedSession,
    private readonly m: NetHackModule,
    private readonly offset: number,
    private readonly hooks: ReplayHooks,
  ) {
    void this.failure.catch(() => {});
  }

  post(events: GameEvent[]): void {
    if (this.done) return;
    for (const e of events)
      if (e.type === "status") for (const [k, v] of Object.entries(e.fields)) this.status[k] = v.text;
    this.guard(() => this.hooks.post(events));
  }

  // what goes wrong in here is the replay's to report: Game would answer the core ESC and carry on
  async request(request: GameRequest): Promise<Answer | null> {
    const line = await this.next(ANSWER_TAGS[request.kind]);
    return this.guard(() => parseAnswer(request.kind, line.rest), line) ?? NEVER;
  }

  async nextInput(): Promise<Input> {
    const line = await this.next("k", "c");
    return this.guard(() => parseInput(line), line) ?? NEVER;
  }

  async persist(exiting = false): Promise<void> {
    if (!exiting || this.done) return;
    const line = this.take("end");
    if (!line) return;
    const how = this.m._nhweb_game_over() ? "over" : "save";
    if (line.rest !== how) return this.fail(line, `the game ended by ${how}`);
    const after = this.session.lines[this.at];
    if (after) return this.fail(after, "comes after the session's end");
    this.stopWith("end");
  }

  /** The core stopped on its own: fine after the session's end, a failure before it. */
  stopped(why: string): void {
    if (this.done) return;
    this.failed?.(new ReplayError(why));
    this.stopWith("out");
  }

  /** Ends the session, leaving its core waiting for good. */
  stop(): void {
    this.stopWith("out");
  }

  now(): number {
    return Number(this.take("now")?.rest ?? 0);
  }

  randomSeed(): number {
    return Number(this.take("seed")?.rest ?? 0);
  }

  uuid(): string {
    return this.take("uuid")?.rest ?? "";
  }

  utcOffset(): number {
    return this.offset;
  }

  /** The next answer for the core, once the pace allows; never, past the session's end. */
  private async next(...tags: string[]): Promise<Line> {
    if (this.done) return NEVER;
    await this.hooks.pace();
    return this.take(...tags) ?? NEVER;
  }

  /** The next line, which must have one of `tags`, after the marks that come before it. */
  private take(...tags: string[]): Line | null {
    for (;;) {
      if (this.done) return null;
      const line = this.session.lines[this.at];
      if (!line) {
        this.stopWith("out");
        return null;
      }
      this.at++;
      if (tags.includes(line.tag)) return line;
      if (!this.mark(line)) {
        this.fail(line, `expected ${tags.join(" or ")}`);
        return null;
      }
    }
  }

  /** Checks a line that marks where the core was, rather than answering it; false if it isn't one. */
  private mark(line: Line): boolean {
    const [first] = line.rest.split(" ");
    switch (line.tag) {
      case "ckpt": {
        const count = this.m._nhweb_checkpoint_count();
        if (count !== Number(first)) this.fail(line, `the core is at checkpoint ${count}`);
        else this.guard(() => this.hooks.checkpoint(count), line);
        return true;
      }
      case "T": {
        const turn = this.m._nhweb_checkpointed();
        if (turn !== Number(first)) this.fail(line, `the core is at turn ${turn}`);
        return true;
      }
      case "=": {
        const check = checkLine(Number(first), this.status).slice(2);
        if (check !== line.rest) this.fail(line, `the core shows ${check}`);
        return true;
      }
      case "asc":
        this.game?.setAsciiMap(first === "1");
        return true;
      default:
        return false;
    }
  }

  /** Stops the session where it went differently; the core is left waiting, never answered again. */
  private fail(line: Line, why: string): void {
    if (this.done) return;
    this.failed?.(new ReplayError(`line ${line.seq} (${line.tag} ${line.rest}): ${why}`));
    this.stopWith("out");
  }

  private stopWith(end: SessionEnd): void {
    this.done = true;
    this.finish(end);
  }

  /** `f`'s result, or null once it has thrown and failed the session. */
  private guard<T>(f: () => T, line?: Line): T | null {
    try {
      return f();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (line) this.fail(line, why);
      else this.stopped(why);
      return null;
    }
  }
}

/** /save, by path under it. */
export function saveFiles(m: NetHackModule): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (dir: string) => {
    for (const f of m.FS.readdir(`/save${dir}`)) {
      if (f === "." || f === "..") continue;
      const path = `${dir}/${f}`;
      if (m.FS.isDir(m.FS.stat(`/save${path}`).mode)) walk(path);
      else files.set(path.slice(1), m.FS.readFile(`/save${path}`));
    }
  };
  walk("");
  return files;
}

/** Puts files from saveFiles() into a new core's /save. */
export function writeSaveFiles(m: NetHackModule, files: Map<string, Uint8Array>): void {
  for (const [file, data] of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = `/save/${parts.slice(0, i).join("/")}`;
      if (!m.FS.analyzePath(dir).exists) m.FS.mkdir(dir);
    }
    m.FS.writeFile(`/save/${file}`, data);
  }
}

/**
 * Starts a core for a session, with the session's options and config and
 * these /save files, its window calls answered by the host `host` makes.
 */
export type BootCore = (
  session: RecordedSession,
  files: Map<string, Uint8Array>,
  host: (m: NetHackModule) => ReplayHost,
) => Promise<void>;

/**
 * Plays the whole recording, session by session. Rejects with a ReplayError
 * where the game goes differently from how it was recorded.
 */
export async function replay(text: string, boot: BootCore, hooks: ReplayHooks): Promise<void> {
  const { utcOffset, sessions } = parseRecording(text);
  let files = new Map<string, Uint8Array>();
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const next = sessions[i + 1];
    if (session.kind === "unrecorded") throw new ReplayError("the game's start wasn't recorded");
    if (session.kind === "new") files = new Map();
    let kept: Map<string, Uint8Array> | null = null;
    let core!: NetHackModule;
    let host!: ReplayHost;
    await boot(session, files, (m) => {
      core = m;
      host = new ReplayHost(session, m, utcOffset, {
        ...hooks,
        checkpoint(n) {
          hooks.checkpoint(n);
          // as the closed page left /save, for the recovery that follows
          if (next?.kind === "recover" && next.checkpoint === n) kept = saveFiles(m);
        },
      });
      return host;
    });
    // a failure also finishes the session, so it must win when both are settled
    const end = await Promise.race([host.failure, host.finished]).finally(() => host.stop());
    if (!next) return;
    if (next.kind === "restore") {
      if (end !== "end") throw new ReplayError(`session ${i + 1} wasn't saved, yet the next restores it`);
      files = saveFiles(core);
    } else if (next.kind === "recover") {
      if (!kept) throw new ReplayError(`session ${i + 1} never reached checkpoint ${next.checkpoint}`);
      files = kept;
    }
  }
}
