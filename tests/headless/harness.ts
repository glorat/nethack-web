// Plays the real WASM core in Node, one step at a time, for tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Answer, GameEvent, GameRequest, MapCell } from "../../src/protocol";
import { applyEvents, cellAt, initialState, type GameState } from "../../src/port/state";
import { CONFIG_FILE, Game, type Input } from "../../src/worker/game";
import { BonesDb } from "../../src/worker/bones";
import { Recorder } from "../../src/worker/recorder";
import { type BootCore, never, replay, ReplayError, saveFiles, writeSaveFiles } from "../../src/worker/replayer";
import { placeGameFiles, resumedHost, resumeGame } from "../../src/worker/resume";
import { describeSquare, type EmscriptenFS, type NetHackModule } from "../../src/worker/memory";

const ROOT = resolve(__dirname, "../..");

// a Monday at first quarter, so no full or new moon and no Friday the 13th change luck
const DEFAULT_DATE = "2026-01-26T12:00:00Z";
export const PAGE_UUID = "00000000-0000-4000-8000-000000000001";

export interface SessionOptions {
  name?: string;
  /** NETHACKOPTIONS character fields. */
  character?: string;
  seed?: number;
  /** Seeds the page gives the core instead, which then reseeds at each level change as in play. */
  pageSeed?: number;
  /** With pageSeed: each seed one more than the last, as different as real ones, not all the same. */
  seedsVary?: boolean;
  /** The page's clock, which stands still. */
  date?: string;
  /** The page's time zone, in seconds east of UTC; UTC if not given. */
  utcOffset?: number;
  /** Debug mode, for ^W wishes, ^F maps and the like. */
  wizard?: boolean;
  /** Extra NETHACKOPTIONS, appended. */
  options?: string;
  /** A .nethackrc, for what only a config file sets, such as MENUCOLOR. */
  config?: string;
  /** Files to put in /save first, e.g. from an earlier session. */
  saves?: Map<string, Uint8Array>;
  /** Another tab is playing too. */
  otherTab?: boolean;
  /** How many days ago the files in `saves` were last written. */
  savesAge?: number;
  /** Bring a game left unfinished back by replaying its recording, as the page does. */
  resume?: boolean;
  /** Keep bones a debug-mode game leaves, which the page doesn't, as dying there is the easy way to get some. */
  keepWizardBones?: boolean;
}

type Module = NetHackModule & {
  FS: EmscriptenFS & {
    readFile(path: string): Uint8Array;
    stat(path: string): { mode: number };
    isDir(mode: number): boolean;
    utime(path: string, atime: number, mtime: number): void;
    writeFile(path: string, data: Uint8Array): void;
  };
};

let sessions = 0;

/** Position-picker keys for a move of `d`: capitals step 8 squares. */
function cursorKeys(d: number, back: string, forward: string): string {
  const key = d < 0 ? back : forward;
  const n = Math.abs(d);
  return key.toUpperCase().repeat(Math.floor(n / 8)) + key.repeat(n % 8);
}

/**
 * A game the test drives. Each step resolves once the core is waiting again:
 * for a key with nothing left to type, for an answer to `prompt`, or because
 * the game ended.
 */
export class Session {
  state: GameState = initialState();
  prompt: GameRequest | null = null;
  ended = false;
  /** When it returns true for a batch of events, posting that batch throws once, as a bug in the UI side would. */
  failPost: ((events: GameEvent[]) => boolean) | null = null;
  /** Every cell drawn, in order, including ones drawn and erased within a turn, like a zap's beam. */
  drawn: MapCell[] = [];
  /** While the core waits for a key: what the UI would type to open an item's actions, 0 inside a prompt. */
  inventoryKey = 0;
  /** While the core waits for a key: whether the game is in debug mode, for the Wizard Mode menu. */
  wizard = false;
  /** What the core printed outside its windows, such as errors before the game starts. */
  output: string[] = [];
  /** The recording's lines, as the recorder streamed them out. */
  recorded: string[] = [];
  /** The whole recording, once the game has ended. */
  recording: string | null = null;
  /** /save as it was at the last persist, which is all a closed page would have kept. */
  persisted: Map<string, Uint8Array> = new Map();

  /** Why the replay of a game left unfinished failed, if it did and the game came back from its checkpoint. */
  resumeFailure: string | null = null;

  private liveHost: ReturnType<Session["host"]> | null = null;
  private queue: Input[] = [];
  private giveInput: ((input: Input) => void) | null = null;
  private giveAnswer: ((answer: Answer | null) => void) | null = null;
  private settled: { resolve(): void; reject(e: unknown): void } | null = null;

  private game!: Game;

  private m!: Module;

  private constructor() {}

  static async start(options: SessionOptions = {}): Promise<Session> {
    const session = new Session();
    const ready = session.untilSettled();
    await session.playLive(options);
    await ready;
    return session;
  }

  private nethackOptions(options: SessionOptions): string {
    return [
      `name:${options.name ?? "Tester"}`,
      options.character ?? "role:Valkyrie,race:human,gender:female,align:neutral",
      "!autopickup,!tutorial,!tips,perm_invent",
      options.wizard ? "playmode:debug" : "",
      options.options ?? "",
    ].filter(Boolean).join(",");
  }

  /** A core with `saves` in /save, ready to run. */
  private async load(
    options: SessionOptions,
    nethackOptions: string,
    config: string | undefined,
    saves: Map<string, Uint8Array> | undefined,
    stopped?: (why: string) => void,
  ): Promise<Module> {
    const { default: createModule } = await import(pathToFileURL(resolve(ROOT, "public/nethack.js")).href);
    const m: Module = await createModule({
      noInitialRun: true,
      wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")),
      print: (line: string) => this.output.push(line),
      printErr: (line: string) => this.output.push(line),
      onExit: () => (stopped ? stopped("the core exited before the session's end") : this.end()),
      onAbort: (what: unknown) => (stopped ? stopped(`the core aborted: ${String(what)}`) : this.settled?.reject(new Error(`core aborted: ${String(what)}`))),
      preRun: [
        (mod: Module) => {
          mod.ENV.USER = "player";
          mod.ENV.NETHACKOPTIONS = nethackOptions;
          if (options.pageSeed === undefined) mod.ENV.NETHACK_SEED = String(options.seed ?? 1);
          // Emscripten's HOME, which it creates
          mod.FS.writeFile(CONFIG_FILE, new TextEncoder().encode(config ?? ""));
          mod.FS.mkdir("/save");
          for (const [file, data] of saves ?? []) {
            const parts = file.split("/");
            for (let i = 1; i < parts.length; i++) {
              const dir = `/save/${parts.slice(0, i).join("/")}`;
              if (!mod.FS.analyzePath(dir).exists) mod.FS.mkdir(dir);
            }
            mod.FS.writeFile(`/save/${file}`, data);
            if (options.savesAge) {
              const then = Date.now() - options.savesAge * 24 * 3600 * 1000;
              mod.FS.utime(`/save/${file}`, then, then);
            }
          }
        },
      ],
    });
    if (options.wizard) {
      // getpwuid() is always "web_user" here, which sysconf's WIZARDS doesn't list
      const sysconf = new TextDecoder().decode(m.FS.readFile("/sysconf"));
      m.FS.writeFile("/sysconf", new TextEncoder().encode(sysconf.replace(/^WIZARDS=.*$/m, "WIZARDS=*")));
    }
    // a session from an earlier test is left suspended inside a callback, and the shim's reentry check is global
    const shared = (globalThis as { nethackGlobal?: { shimFunctionRunning?: unknown } }).nethackGlobal;
    if (shared) shared.shimFunctionRunning = null;
    this.m = m;
    return m;
  }

  private recorder(options: SessionOptions, m: Module, nethackOptions: string, config: string): Recorder {
    return new Recorder(this.liveHost ??= this.host(options), m, {
      options: nethackOptions,
      config,
      stream: (lines) => this.recorded.push(...lines),
      finished: (text) => (this.recording = text),
      resume: options.resume ? (text, name) => this.resume(options, text, name) : undefined,
    });
  }

  private run(m: Module, game: Game): void {
    this.game = game;
    // one callback name per session, so sessions don't share one global
    const callback = `nethackCallback${++sessions}`;
    (globalThis as Record<string, unknown>)[callback] = (name: string, ...args: unknown[]) => game.callback(name, args);
    m.ccall("shim_graphics_set_callback", null, ["string"], [callback]);
    try {
      m._main(0, 0);
    } catch (e) {
      if ((e as { name?: string }).name !== "ExitStatus") throw e;
    }
  }

  /** `saves`: where to start from, if not what the options say. */
  private async playLive(options: SessionOptions, saves = options.saves): Promise<void> {
    const nethackOptions = this.nethackOptions(options);
    const m = await this.load(options, nethackOptions, options.config, saves);
    this.run(m, new Game(m, this.recorder(options, m, nethackOptions, options.config ?? "")));
  }

  private async resume(options: SessionOptions, text: string, name: string): Promise<boolean> {
    let shown: GameEvent[] = [];
    const db = new BonesDb(this.m.FS);
    try {
      await resumeGame(
        text,
        {
          bones: (hash) => db.get(hash),
          boot: (await headlessBoot())(() => true),
          bootLast: async (session, files, makeHost) => {
            shown = [];
            let replayed: ReturnType<typeof makeHost> | null = null;
            const m = await this.load(options, session.options, session.config, this.persisted, (why) => replayed?.stopped(why));
            placeGameFiles(m, name, files);
            replayed = makeHost(m);
            const host = resumedHost(replayed, text, this.recorder(options, m, session.options, session.config), () => this.liveHost!.post(shown));
            const game = new Game(m, host);
            replayed.game = game;
            this.run(m, game);
          },
        },
        (events) => shown.push(...events),
      );
    } catch (e) {
      this.resumeFailure = e instanceof Error ? e.message : String(e);
      await this.playLive(options, this.persisted);
    }
    return true;
  }

  /** Switches ascii_map as the map's ASCII button does. */
  setAsciiMap(on: boolean): void {
    this.game.setAsciiMap(on);
  }

  /** Types keys as the player would; arrows and the like as their vi-key letters. */
  send(keys: string): Promise<this> {
    this.queue.push(...[...keys].map((c) => ({ key: c.charCodeAt(0) })));
    const settled = this.untilSettled();
    this.feed();
    return settled.then(() => this);
  }

  /** Clicks a map square; button 1 is the primary button. */
  click(x: number, y: number, button = 1): Promise<this> {
    this.queue.push({ click: { x, y, button } });
    const settled = this.untilSettled();
    this.feed();
    return settled.then(() => this);
  }

  answer(answer: Answer | null): Promise<this> {
    const give = this.giveAnswer;
    if (!give) throw new Error(`no prompt to answer; waiting for ${this.ended ? "nothing, the game ended" : "a key"}`);
    this.giveAnswer = null;
    this.prompt = null;
    const settled = this.untilSettled();
    give(answer);
    return settled.then(() => this);
  }

  yn(key: string): Promise<this> {
    this.expect("yn");
    return this.answer({ kind: "yn", key });
  }

  getlin(text: string): Promise<this> {
    this.expect("getlin");
    return this.answer({ kind: "getlin", text });
  }

  /** Picks the menu item whose text matches. */
  pick(match: RegExp | string): Promise<this> {
    const prompt = this.expect("menu");
    const item = prompt.items.find((i) => i.identifier !== 0 && (typeof match === "string" ? i.text.includes(match) : match.test(i.text)));
    if (!item) throw new Error(`no menu item matches ${match}: ${prompt.items.map((i) => i.text).join(" | ")}`);
    return this.answer({ kind: "menu", selection: [{ identifier: item.identifier, count: -1 }] });
  }

  /** Dismisses a text window, or cancels any other prompt. */
  dismiss(): Promise<this> {
    return this.answer(this.prompt?.kind === "text" ? { kind: "text" } : null);
  }

  /** Dismisses text windows until the core wants something else. */
  async skipText(): Promise<this> {
    while (this.prompt?.kind === "text") await this.dismiss();
    return this;
  }

  /** Debug mode only: moves the hero to a square, by ^T and the position picker. */
  async teleport(x: number, y: number): Promise<this> {
    const from = this.state.cursor;
    if (!from) throw new Error("no hero on the map");
    await this.send("\x14");
    await this.send(cursorKeys(x - from.x, "h", "l") + cursorKeys(y - from.y, "k", "j") + ".");
    if (this.state.cursor?.x !== x || this.state.cursor?.y !== y)
      throw new Error(`teleport to ${x},${y} ended at ${JSON.stringify(this.state.cursor)}: ${this.messages.slice(-2).join(" ")}`);
    return this;
  }

  get messages(): string[] {
    return this.state.messages.map((m) => m.text);
  }

  cell(x: number, y: number): MapCell | null {
    return cellAt(this.state, x, y);
  }

  /** What hovering over a square says, as the map's tooltip asks while the core waits. */
  describe(x: number, y: number): string | null {
    return describeSquare(this.m, x, y);
  }

  /** A hash of the core's main random generator, which any use of it changes. */
  get rng(): number {
    return this.m._nhweb_rng_fingerprint();
  }

  /** The hero's square: the core puts the cursor there before asking for a command. */
  get hero(): MapCell {
    const cursor = this.state.cursor;
    const cell = cursor && this.cell(cursor.x, cursor.y);
    if (!cell) throw new Error("no hero on the map");
    return cell;
  }

  /** The files in /save, by their paths under it, to start a later session from. */
  saves(): Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>();
    const walk = (dir: string) => {
      for (const f of this.m.FS.readdir(`/save${dir}`)) {
        if (f.startsWith(".")) continue;
        const path = `${dir}/${f}`;
        if (this.m.FS.isDir(this.m.FS.stat(`/save${path}`).mode)) walk(path);
        else files.set(path.slice(1), this.m.FS.readFile(`/save${path}`));
      }
    };
    walk("");
    return files;
  }

  private expect<K extends GameRequest["kind"]>(kind: K): Extract<GameRequest, { kind: K }> {
    if (this.prompt?.kind !== kind) throw new Error(`expected a ${kind} prompt, have ${this.prompt ? JSON.stringify(this.prompt).slice(0, 200) : "none"}`);
    return this.prompt as Extract<GameRequest, { kind: K }>;
  }

  private host(options: SessionOptions) {
    const now = Math.floor(new Date(options.date ?? DEFAULT_DATE).getTime() / 1000);
    let seeds = 0;
    return {
      post: (events: GameEvent[]) => {
        if (this.failPost?.(events)) {
          this.failPost = null;
          throw new Error("failPost");
        }
        this.state = applyEvents(this.state, events);
        for (const e of events) if (e.type === "map") this.drawn.push(...e.cells);
        if (events.some((e) => e.type === "game_over")) this.end();
      },
      request: (request: GameRequest) =>
        new Promise<Answer | null>((give) => {
          this.prompt = request;
          this.giveAnswer = give;
          this.settle();
        }),
      nextInput: (request: { inventoryKey: number; wizard: boolean }) =>
        new Promise<Input>((give) => {
          // as the worker persists while waiting for each key
          this.persisted = this.saves();
          this.inventoryKey = request.inventoryKey;
          this.wizard = request.wizard;
          this.giveInput = give;
          if (this.queue.length) this.feed();
          else this.settle();
        }),
      persist: async () => {
        this.persisted = this.saves();
      },
      alone: !options.otherTab,
      now: () => now,
      utcOffset: () => options.utcOffset ?? 0,
      randomSeed: () => (options.pageSeed ?? 0) + (options.seedsVary ? seeds++ : 0),
      uuid: () => PAGE_UUID,
      bonesWanted: async (name: string) => new BonesDb(this.m.FS).take(name),
      bonesLeft: (name: string, data: Uint8Array, wizard: boolean) => {
        if (!wizard || options.keepWizardBones) new BonesDb(this.m.FS).keep(name, data);
      },
    };
  }

  private end(): void {
    this.ended = true;
    this.settle();
  }

  private feed(): void {
    const give = this.giveInput;
    if (!give || !this.queue.length) return;
    this.giveInput = null;
    const input = this.queue.shift()!;
    // a macrotask, or a core that only ever waits on resolved promises starves timers
    setTimeout(() => give(input), 0);
  }

  private untilSettled(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.settled = { resolve, reject };
    });
  }

  private settle(): void {
    const settled = this.settled;
    this.settled = null;
    settled?.resolve();
  }
}

/** What a headless replay showed: the game's state as a player would have seen it. */
export interface Replayed {
  state: GameState;
  /** Whether it ended where the recording did, or where it went differently. */
  error: ReplayError | null;
}

/** Boots a fresh real core for each session of a replay, in Node. */
export async function headlessBoot(): Promise<(current: () => boolean) => BootCore> {
  const { default: createModule } = await import(pathToFileURL(resolve(ROOT, "public/nethack.js")).href);
  return (current) => {
    return async (session, files, makeHost) => {
      let host: ReturnType<typeof makeHost> | null = null;
      const printed: string[] = [];
      const m: Module = await createModule({
        noInitialRun: true,
        wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")),
        print: (line: string) => printed.push(line),
        printErr: (line: string) => printed.push(line),
        onExit: () => host?.stopped(`the core exited before the session's end: ${printed.join(" / ")}`),
        onAbort: (what: unknown) => host?.stopped(`the core aborted: ${String(what)}`),
        preRun: [
          (mod: Module) => {
            mod.ENV.USER = "player";
            mod.ENV.NETHACKOPTIONS = session.options;
            mod.FS.writeFile(CONFIG_FILE, new TextEncoder().encode(session.config));
            mod.FS.mkdir("/save");
            writeSaveFiles(mod, files);
          },
        ],
      });
      // as the worker does: a core for a playing-through a seek or stop has replaced must not start, or it takes over the shim's helpers
      if (!current()) return never();
      const shared = (globalThis as { nethackGlobal?: { shimFunctionRunning?: unknown } }).nethackGlobal;
      if (shared) shared.shimFunctionRunning = null;
      host = makeHost(m);
      const game = new Game(m, host);
      host.game = game;
      const callback = `nethackCallback${++sessions}`;
      (globalThis as Record<string, unknown>)[callback] = (name: string, ...args: unknown[]) => game.callback(name, args);
      void host.finished.then(() => delete (globalThis as Record<string, unknown>)[callback]);
      m.ccall("shim_graphics_set_callback", null, ["string"], [callback]);
      try {
        m._main(0, 0);
      } catch (e) {
        if ((e as { name?: string }).name !== "ExitStatus") throw e;
      }
    };
  };
}

/** Plays a recording that stops mid-game to its end, and gives back the last core's /save. */
export async function replayCore(text: string): Promise<{ files: Map<string, Uint8Array>; error: ReplayError | null }> {
  let core!: NetHackModule;
  const boot = (await headlessBoot())(() => true);
  let error: ReplayError | null = null;
  try {
    await replay(
      text,
      (session, files, makeHost) =>
        boot(session, files, (m) => {
          core = m;
          return makeHost(m);
        }),
      { post: () => {}, pace: () => Promise.resolve(), delay: () => Promise.resolve(), checkpoint: () => {} },
    );
  } catch (e) {
    if (!(e instanceof ReplayError)) throw e;
    error = e;
  }
  return { files: saveFiles(core), error };
}

/** Plays a recording again on the real core, as fast as it goes. */
export async function replayRecording(text: string, saves?: Map<string, Uint8Array>): Promise<Replayed> {
  let state = initialState();
  const boot = (await headlessBoot())(() => true);
  try {
    await replay(text, boot, {
      post: (events) => (state = applyEvents(state, events)),
      pace: () => Promise.resolve(),
      delay: () => Promise.resolve(),
      checkpoint: () => {},
      bones: (hash) => saves?.get(`bones/${hash}`),
    });
    return { state, error: null };
  } catch (e) {
    if (e instanceof ReplayError) return { state, error: e };
    throw e;
  }
}
