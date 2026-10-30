// Plays the real WASM core in Node, one step at a time, for tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, vi } from "vitest";
import type { Answer, GameEvent, GameRequest, MapCell } from "../../src/protocol";
import { applyEvents, cellAt, initialState, type GameState } from "../../src/port/state";
import { Game, type Input } from "../../src/worker/game";
import type { EmscriptenFS, NetHackModule } from "../../src/worker/memory";

const ROOT = resolve(__dirname, "../..");

// a Monday at first quarter, so no full or new moon and no Friday the 13th change luck
const DEFAULT_DATE = "2026-01-26T12:00:00Z";

export interface SessionOptions {
  name?: string;
  /** NETHACKOPTIONS character fields. */
  character?: string;
  seed?: number;
  date?: string;
  /** Debug mode, for ^W wishes, ^F maps and the like. */
  wizard?: boolean;
  /** Extra NETHACKOPTIONS, appended. */
  options?: string;
  /** Files to put in /save first, e.g. from an earlier session. */
  saves?: Map<string, Uint8Array>;
}

type Module = NetHackModule & {
  FS: EmscriptenFS & {
    readdir(path: string): string[];
    readFile(path: string): Uint8Array;
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

afterEach(() => {
  vi.useRealTimers();
});

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
  /** What the core printed outside its windows, such as errors before the game starts. */
  output: string[] = [];

  private queue: Input[] = [];
  private giveInput: ((input: Input) => void) | null = null;
  private giveAnswer: ((answer: Answer | null) => void) | null = null;
  private settled: { resolve(): void; reject(e: unknown): void } | null = null;

  private game!: Game;

  private constructor(private readonly m: Module) {}

  static async start(options: SessionOptions = {}): Promise<Session> {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(options.date ?? DEFAULT_DATE) });
    const { default: createModule } = await import(pathToFileURL(resolve(ROOT, "public/nethack.js")).href);
    const nethackOptions = [
      `name:${options.name ?? "Tester"}`,
      options.character ?? "role:Valkyrie,race:human,gender:female,align:neutral",
      "!autopickup,!tutorial,!tips,perm_invent",
      options.wizard ? "playmode:debug" : "",
      options.options ?? "",
    ].filter(Boolean).join(",");
    let session!: Session;
    const m: Module = await createModule({
      noInitialRun: true,
      wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")),
      print: (line: string) => session?.output.push(line),
      printErr: (line: string) => session?.output.push(line),
      onExit: () => session?.end(),
      onAbort: (what: unknown) => session?.settled?.reject(new Error(`core aborted: ${String(what)}`)),
      preRun: [
        (mod: Module) => {
          mod.ENV.USER = "player";
          mod.ENV.NETHACKOPTIONS = nethackOptions;
          mod.ENV.NETHACK_SEED = String(options.seed ?? 1);
          mod.FS.mkdir("/save");
          for (const [file, data] of options.saves ?? []) mod.FS.writeFile(`/save/${file}`, data);
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
    session = new Session(m);
    const game = new Game(m, session.host());
    session.game = game;
    // one callback name per session, so sessions don't share one global
    const callback = `nethackCallback${++sessions}`;
    (globalThis as Record<string, unknown>)[callback] = (name: string, ...args: unknown[]) => game.callback(name, args);
    m.ccall("shim_graphics_set_callback", null, ["string"], [callback]);
    const ready = session.untilSettled();
    try {
      m._main(0, 0);
    } catch (e) {
      if ((e as { name?: string }).name !== "ExitStatus") throw e;
    }
    await ready;
    return session;
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

  /** The hero's square: the core puts the cursor there before asking for a command. */
  get hero(): MapCell {
    const cursor = this.state.cursor;
    const cell = cursor && this.cell(cursor.x, cursor.y);
    if (!cell) throw new Error("no hero on the map");
    return cell;
  }

  /** The files in /save, to start a later session from. */
  saves(): Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>();
    for (const f of this.m.FS.readdir("/save")) if (!f.startsWith(".")) files.set(f, this.m.FS.readFile(`/save/${f}`));
    return files;
  }

  private expect<K extends GameRequest["kind"]>(kind: K): Extract<GameRequest, { kind: K }> {
    if (this.prompt?.kind !== kind) throw new Error(`expected a ${kind} prompt, have ${this.prompt ? JSON.stringify(this.prompt).slice(0, 200) : "none"}`);
    return this.prompt as Extract<GameRequest, { kind: K }>;
  }

  private host() {
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
      nextInput: (request: { inventoryKey: number }) =>
        new Promise<Input>((give) => {
          this.inventoryKey = request.inventoryKey;
          this.giveInput = give;
          if (this.queue.length) this.feed();
          else this.settle();
        }),
      persist: async () => {},
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
