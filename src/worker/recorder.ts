// Records everything a game takes from the page, one line at a time, so the
// game can be played again exactly. See docs/recording.md for the format.
import type { Answer, GameEvent, GameRequest } from "../protocol";
import { type GameHost, type Input, OLD_GAME } from "./game";
import type { NetHackModule } from "./memory";

export const RECORDING_DIR = "/save/replay";
// what nhweb_resumed() says of a game brought back from the files a closed page left
const RECOVERED = 2;
export const FORMAT = 1;
// a chunk is rewritten whole each time it grows, so keep each one small
const CHUNK_SIZE = 64 * 1024;
const CHECK_EVERY = 20;

type FS = NetHackModule["FS"];

/** "+11:00" for 39600 seconds east of UTC. */
export function zoneText(seconds: number): string {
  const minutes = Math.abs(Math.round(seconds / 60));
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${seconds < 0 ? "-" : "+"}${hh}:${mm}`;
}

export function zoneSeconds(text: string): number | null {
  const m = /^([+-])(\d\d):(\d\d)$/.exec(text);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
}

/** The line, without its sequence number, that records an answer to `request`. */
export function answerLine(request: GameRequest, answer: Answer | null): string {
  const tag = ANSWER_TAGS[request.kind];
  if (!answer) return `${tag} -`;
  switch (answer.kind) {
    case "yn":
      return `${tag} ${JSON.stringify(answer.key)}${answer.count !== undefined ? ` ${answer.count}` : ""}`;
    case "getlin":
      return `${tag} ${answer.text === null ? "-" : JSON.stringify(answer.text)}`;
    case "menu":
      return answer.selection === null
        ? `${tag} -`
        : [tag, ...answer.selection.map((s) => `${s.identifier}:${s.count}`)].join(" ");
    case "text":
      return tag;
    case "ext_cmd":
      return `${tag} ${answer.index}`;
    case "player":
      return `${tag} ${answer.role} ${answer.race} ${answer.gender} ${answer.align}`;
  }
}

export const ANSWER_TAGS: Record<GameRequest["kind"], string> = {
  key: "k",
  poskey: "k",
  yn: "y",
  getlin: "l",
  menu: "m",
  text: "w",
  ext_cmd: "x",
  player: "p",
};

export function inputLine(input: Input): string {
  return "key" in input ? `k ${input.key}` : `c ${input.click.x} ${input.click.y} ${input.click.button}`;
}

/** The files a game's recording is kept in, in order. */
export function chunkNames(fs: FS, dir: string): string[] {
  if (!fs.analyzePath(dir).exists) return [];
  return fs.readdir(dir).filter((f) => /^\d+$/.test(f)).sort();
}

export function readRecording(fs: FS, dir: string): string {
  return chunkNames(fs, dir)
    .map((f) => fs.readFile(`${dir}/${f}`, { encoding: "utf8" }))
    .join("");
}

export interface RecorderStart {
  /** NETHACKOPTIONS. */
  options: string;
  /** The .nethackrc. */
  config: string;
  /** Gets each line as it's written, to send on as the game is played. */
  stream(lines: string[]): void;
  /** Gets the whole recording when the game ends. */
  finished(text: string): void;
  /** The wall clock for turn times; the core's own clock comes from the page's host. */
  wallClock?: () => number;
}

/**
 * A GameHost that passes everything through to another and writes down what
 * came back, in /save next to the game so it lasts as long as the game does.
 */
export class Recorder implements GameHost {
  private readonly fs: FS;
  private readonly wallClock: () => number;
  /** Lines from before the game is in play, when it isn't yet known which game they belong to. */
  private early: string[] = [];
  /** Answers in `early` about an old game left unfinished, which a new game has no use for. */
  private oldGame = new Set<number>();
  private dir: string | null = null;
  private seq = 0;
  private chunk = 1;
  private chunkText = "";
  private dirty = false;
  private unsent: string[] = [];
  private offset: number | null = null;
  private lastTurn = -1;
  private lastCheckpoint = 0;
  private lastCheck = -Infinity;
  private status: Record<string, string> = {};
  private ended = false;

  constructor(
    private readonly inner: GameHost,
    private readonly m: NetHackModule,
    private readonly start: RecorderStart,
  ) {
    this.fs = m.FS as FS;
    this.wallClock = start.wallClock ?? (() => Date.now());
  }

  get alone(): boolean {
    return this.inner.alone;
  }

  post(events: GameEvent[]): void {
    for (const e of events)
      if (e.type === "status") for (const [k, v] of Object.entries(e.fields)) this.status[k] = v.text;
    this.send();
    this.inner.post(events);
  }

  async request(request: GameRequest): Promise<Answer | null> {
    this.begin();
    this.send();
    const answer = await this.inner.request(request);
    this.decided(request, answer);
    return answer;
  }

  decided(request: GameRequest, answer: Answer | null): void {
    if (request.kind === "yn" && request.query === OLD_GAME && !this.dir) this.oldGame.add(this.early.length);
    this.write(answerLine(request, answer));
  }

  async nextInput(request: Extract<GameRequest, { kind: "poskey" }>): Promise<Input> {
    this.begin();
    this.turn();
    this.save();
    this.send();
    const input = await this.inner.nextInput(request);
    this.write(inputLine(input));
    return input;
  }

  persist(exiting = false): Promise<void> {
    // ahead of the final persist, as the page may be gone straight after it
    if (exiting) this.end();
    this.save();
    return this.inner.persist(exiting);
  }

  now(): number {
    const now = this.inner.now();
    this.write(`now ${now}`);
    return now;
  }

  randomSeed(): number {
    const seed = this.inner.randomSeed();
    this.write(`seed ${seed}`);
    return seed;
  }

  uuid(): string {
    const uuid = this.inner.uuid();
    this.write(`uuid ${uuid}`);
    return uuid;
  }

  /** A game keeps the time zone it started in, which its recording holds. */
  utcOffset(): number {
    if (this.offset !== null) return this.offset;
    if (this.m._nhweb_restoring()) return (this.offset = this.savedOffset() ?? this.inner.utcOffset());
    // fixed once the game is under way; nothing before that is kept
    if (this.m._nhweb_in_play()) return (this.offset = this.inner.utcOffset());
    return this.inner.utcOffset();
  }

  /** The ascii_map option, switched from outside the core. */
  asciiMap(on: boolean): void {
    this.write(`asc ${on ? 1 : 0}`);
  }

  private gameDir(): string | null {
    // the lock file's name, which carries the number of the level file last named
    const name = this.m.UTF8ToString(this.m._nhweb_game_name()).replace(/\.\d+$/, "");
    return name ? `${RECORDING_DIR}/${name}` : null;
  }

  private savedOffset(): number | null {
    const dir = this.gameDir();
    if (!dir) return null;
    const first = this.firstChunk(dir);
    const tz = / session (?:new|unrecorded) \S+ tz=(\S+)/.exec(first ?? "")?.[1];
    return tz ? zoneSeconds(tz) : null;
  }

  private firstChunk(dir: string): string | null {
    const [first] = chunkNames(this.fs, dir);
    return first ? this.fs.readFile(`${dir}/${first}`, { encoding: "utf8" }) : null;
  }

  /** Once the game is in play, which game the recording belongs to is known. */
  private begin(): void {
    if (this.dir || !this.m._nhweb_in_play()) return;
    const dir = this.gameDir();
    if (!dir) return;
    if (!this.fs.analyzePath(RECORDING_DIR).exists) this.fs.mkdir(RECORDING_DIR);
    const chunks = chunkNames(this.fs, dir);
    const time = new Date(this.wallClock()).toISOString();
    const resumed = this.m._nhweb_resumed();
    const lines: string[] = [];
    if (resumed && chunks.length) {
      const last = chunks[chunks.length - 1];
      this.chunk = Number(last);
      this.chunkText = this.fs.readFile(`${dir}/${last}`, { encoding: "utf8" });
      lines.push(
        resumed === RECOVERED
          ? `session recover ${this.lastCheckpointIn(dir, chunks)} ${this.m._nhweb_moves()} ${time}`
          : `session restore ${time}`,
      );
    } else {
      this.early = this.early.filter((_, i) => !this.oldGame.has(i));
      // left by a game that was given up on, or never recorded
      for (const f of chunks) this.fs.unlink(`${dir}/${f}`);
      if (!this.fs.analyzePath(dir).exists) this.fs.mkdir(dir);
      lines.push(
        `nhrec ${FORMAT}`,
        `session ${resumed ? "unrecorded" : "new"} ${time} tz=${zoneText(this.utcOffset())}`,
      );
    }
    // read again at every start, so they can change between sessions
    lines.push(`opt ${JSON.stringify(this.start.options)}`, `rc ${JSON.stringify(this.start.config)}`);
    lines.push(`alone ${this.inner.alone ? 1 : 0}`);
    this.dir = dir;
    for (const line of [...lines, ...this.early]) this.append(line);
    this.early = [];
  }

  /** The number of the last checkpoint the session before marked, which a recovery comes back to. */
  private lastCheckpointIn(dir: string, chunks: string[]): number {
    for (const f of [...chunks].reverse()) {
      const marks = [...this.fs.readFile(`${dir}/${f}`, { encoding: "utf8" }).matchAll(/^\d+ ckpt (\d+)$/gm)];
      if (marks.length) return Number(marks[marks.length - 1][1]);
    }
    return 0;
  }

  /**
   * Before each command: a mark for each checkpoint written since the last
   * one, and when the core has just checkpointed a new turn, that turn and
   * when it was reached.
   */
  private turn(): void {
    if (!this.dir) return;
    const count = this.m._nhweb_checkpoint_count();
    if (count !== this.lastCheckpoint) {
      this.lastCheckpoint = count;
      this.write(`ckpt ${count}`);
    }
    const turn = this.m._nhweb_checkpointed();
    if (turn < 0 || turn === this.lastTurn) return;
    this.lastTurn = turn;
    this.write(`T ${turn} ${new Date(this.wallClock()).toISOString()}`);
    if (turn - this.lastCheck >= CHECK_EVERY) {
      this.lastCheck = turn;
      this.write(checkLine(turn, this.m, this.status));
    }
  }

  private write(line: string): void {
    if (this.ended) return;
    if (this.dir) this.append(line);
    else this.early.push(line);
  }

  private append(line: string): void {
    const text = `${++this.seq} ${line}`;
    this.chunkText += `${text}\n`;
    this.dirty = true;
    this.unsent.push(text);
  }

  private send(): void {
    if (!this.unsent.length) return;
    const lines = this.unsent;
    this.unsent = [];
    this.start.stream(lines);
  }

  /** Writes the chunk being added to into the file system, for the next persist to keep. */
  private save(): void {
    if (!this.dir || !this.dirty) return;
    this.fs.writeFile(`${this.dir}/${String(this.chunk).padStart(6, "0")}`, this.chunkText);
    this.dirty = false;
    if (this.chunkText.length >= CHUNK_SIZE) {
      this.chunk++;
      this.chunkText = "";
    }
  }

  private end(): void {
    if (this.ended || !this.dir) return;
    const over = !!this.m._nhweb_game_over();
    this.write(`end ${over ? "over" : "save"}`);
    this.ended = true;
    this.save();
    if (over) {
      this.start.finished(readRecording(this.fs, this.dir));
      for (const f of chunkNames(this.fs, this.dir)) this.fs.unlink(`${this.dir}/${f}`);
      this.fs.rmdir(this.dir);
    }
  }
}

/** Where the hero is and everything the status line shows, which a replay must match. */
export function checkLine(turn: number, m: NetHackModule, status: Record<string, string>): string {
  const fields = Object.fromEntries(
    Object.keys(status)
      .sort()
      .map((k) => [k.replace(/^BL_/, ""), status[k].trim()]),
  );
  return `= ${turn} @${m._nhweb_hero_x()},${m._nhweb_hero_y()} ${JSON.stringify(fields)}`;
}
