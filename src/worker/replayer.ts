// Plays a recorded game again: each session runs the core afresh, answered
// from the recording instead of the player. See docs/recording.md.
import type { Answer, GameEvent, GameRequest, MenuItem, MenuSelection } from "../protocol";
import type { Game, GameHost, Input } from "./game";
import type { NetHackModule } from "./memory";
import { ALIGNS, ANSWER_TAGS, checkLine, FORMAT, GENDERS, zoneSeconds } from "./recorder";

export class ReplayError extends Error {}

/** A promise that never settles; a fresh one each time, as one shared would keep every core waiting on it alive. */
export const never = <T>() => new Promise<T>(() => {});
const MARKS = new Set(["ckpt", "T", "=", "asc", "back"]);
// as long as Game pauses for the core's delay_output
const DELAY_MS = 50;

export interface Line {
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

/** A line's parts; throws if it can't be read. */
export function parseLine(raw: string): Line {
  // [\s\S], as JSON leaves U+2028 and U+2029 in strings, which . doesn't match
  const m = /^(\d+) (\S+)(?: ([\s\S]*))?$/.exec(raw.replace(/\r$/, ""));
  if (!m) throw new ReplayError(`unreadable line: ${raw}`);
  return { seq: Number(m[1]), tag: m[2], rest: m[3] ?? "" };
}

export function parseRecording(text: string): Recording {
  const sessions: RecordedSession[] = [];
  let utcOffset: number | null = null;
  let seq = 0;
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    const line = parseLine(raw);
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

/** The answer a line records, in the numbers `request` goes by; throws if what it names isn't there. */
export function parseAnswer(request: GameRequest, rest: string): Answer | null {
  if (rest === "-") return null;
  switch (request.kind) {
    case "yn": {
      const m = JSON_TEXT.exec(rest);
      if (!m) break;
      return m[2] === undefined ? { kind: "yn", key: JSON.parse(m[1]) } : { kind: "yn", key: JSON.parse(m[1]), count: Number(m[2]) };
    }
    case "getlin":
      return { kind: "getlin", text: JSON.parse(rest) };
    case "menu":
      return { kind: "menu", selection: (JSON.parse(rest) as MenuPick[]).map((pick) => menuSelection(request.items, pick)) };
    case "text":
      return { kind: "text" };
    case "ext_cmd": {
      const name: string = JSON.parse(rest);
      const command = request.commands.find((c) => c.name === name);
      if (!command) throw new ReplayError(`there's no command ${name}`);
      return { kind: "ext_cmd", index: command.index };
    }
    case "player": {
      const [role, race, gender, align] = JSON.parse(rest) as (string | null)[];
      const { roles, races } = request.choices;
      return {
        kind: "player",
        role: pickNumber(roles.map((r) => r.name), role),
        race: pickNumber(races.map((r) => r.name), race),
        gender: pickNumber(GENDERS, gender),
        align: pickNumber(ALIGNS, align),
      };
    }
  }
  throw new ReplayError(`unreadable ${request.kind} answer: ${rest}`);
}

type MenuPick = [string, number, number] | [number, number];

function menuSelection(items: MenuItem[], pick: MenuPick): MenuSelection {
  if (typeof pick[0] === "number") return { identifier: pick[0], count: pick[1] as number };
  const [text, which, count] = pick as [string, number, number];
  const item = items.filter((i) => i.identifier !== 0 && i.text === text)[which];
  if (!item) throw new ReplayError(`the menu has no item ${JSON.stringify(text)}`);
  return { identifier: item.identifier, count };
}

// a pick left open, for the core to choose
function pickNumber(names: string[], name: string | null): number {
  if (name === null) return -1;
  const at = names.indexOf(name);
  if (at < 0) throw new ReplayError(`there's no choice ${name}`);
  return at;
}

export function parseInput(line: Line): Input {
  const n = line.rest.split(" ").map(Number);
  return line.tag === "k" ? { key: n[0] } : { click: { x: n[0], y: n[1], button: n[2] } };
}

export interface ReplayHooks {
  /** The events the game shows, as it would to a player. */
  post(events: GameEvent[]): void;
  /**
   * Waited for before each answer, to set the pace; resolves at once to go as
   * fast as the core can. `turn` if a turn has begun since the last answer,
   * `request` if this answer is to a prompt rather than a key for a command.
   */
  pace(at: { turn?: number; request?: GameRequest }): Promise<void>;
  /** The core's pause in an animation, such as a zap; it plays at its own pace without this. */
  delay?(): Promise<void>;
  /** The core has reached checkpoint `n` of this session. */
  checkpoint(n: number): void;
  /** The bones with this hash, which a recording names rather than holds. */
  bones?(hash: string): Uint8Array | undefined;
  /** For a recording still being written: resolves when there are more lines, in place of ending where they run out. */
  more?(): Promise<void>;
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
  /** What the status line shows, as far as the replay has gone. */
  status: Record<string, string> = {};
  private finish!: (end: SessionEnd) => void;
  readonly finished = new Promise<SessionEnd>((resolve) => (this.finish = resolve));
  private failed: ((e: ReplayError) => void) | null = null;
  readonly failure = new Promise<never>((_, reject) => (this.failed = reject));
  /** Past the session's end, or stopped: the core is never answered again. */
  private done = false;
  /** Went differently from the recording, or the core stopped before its end. */
  diverged = false;

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
    const line = await this.next([ANSWER_TAGS[request.kind]], request);
    // a null inside the array is a cancelled prompt; guard's own null means it couldn't be read
    const parsed = this.guard(() => [parseAnswer(request, line.rest)], line);
    return parsed ? parsed[0] : never();
  }

  async nextInput(): Promise<Input> {
    const line = await this.next(["k", "c"]);
    return this.guard(() => parseInput(line), line) ?? never();
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
    this.diverged = true;
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

  async bonesWanted(name: string): Promise<Uint8Array | null> {
    const line = this.take("bones");
    if (!line) return never();
    const [recorded, hash] = line.rest.split(" ");
    if (recorded !== name) {
      this.fail(line, `the core wants bones for ${name}`);
      return never();
    }
    if (hash === "-") return null;
    const data = this.hooks.bones?.(hash);
    if (!data) {
      this.fail(line, "these bones aren't kept here");
      return never();
    }
    return data;
  }

  bonesLeft(): void {}

  delayOutput(): Promise<void> {
    return this.hooks.delay?.() ?? new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  /**
   * The next answer for the core, once the pace allows; never, past the
   * session's end. The marks before it are checked first, so a pause at a
   * new turn comes before that turn's first command.
   */
  private async next(tags: string[], request?: GameRequest): Promise<Line> {
    let turn: number | undefined;
    for (;;) {
      for (let line = this.session.lines[this.at]; line && MARKS.has(line.tag); line = this.session.lines[this.at]) {
        this.at++;
        if (line.tag === "T") turn = Number(line.rest.split(" ")[0]);
        if (this.guard(() => this.mark(line), line) === null) break;
      }
      if (this.done) return never();
      if (this.session.lines[this.at] || !this.hooks.more) break;
      await this.hooks.more();
    }
    try {
      await this.hooks.pace({ turn, request });
    } catch (e) {
      this.stopped(e instanceof Error ? e.message : String(e));
    }
    return this.take(...tags) ?? never();
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
      const marked = this.guard(() => this.mark(line), line);
      if (marked === null) return null;
      if (!marked) {
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
        const check = checkLine(Number(first), this.m, this.status).slice(2);
        if (check !== line.rest) this.fail(line, `the core shows ${check}`);
        return true;
      }
      case "asc":
        this.game?.setAsciiMap(first === "1");
        return true;
      case "back":
        return true;
      default:
        return false;
    }
  }

  /** Stops the session where it went differently; the core is left waiting, never answered again. */
  private fail(line: Line, why: string): void {
    if (this.done) return;
    this.diverged = true;
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
export async function replay(
  text: string,
  boot: BootCore,
  hooks: ReplayHooks,
  /** Is given the last session, for adding lines to as they come. */
  follow?: (last: RecordedSession) => void,
): Promise<void> {
  const { utcOffset, sessions } = parseRecording(text);
  follow?.(sessions[sessions.length - 1]);
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
        // an earlier session is as long as it will ever be
        more: next ? undefined : hooks.more,
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
