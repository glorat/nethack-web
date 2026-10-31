/// <reference lib="webworker" />
import type { Answer, GameEvent, GameRequest, StartOptions, UiMessage, WorkerMessage } from "../protocol";
import { ReplayRunner } from "./replay-runner";
import { type BootCore, never, writeSaveFiles } from "./replayer";
import { CONFIG_FILE, Game, type Input } from "./game";
import { Recorder } from "./recorder";
import { describeSquare, type NetHackModule } from "./memory";

declare const self: DedicatedWorkerGlobalScope;

const SAVE_DIR = "/save";

const inputs: Input[] = [];
let inputWaiter: ((input: Input) => void) | null = null;
const answerWaiters = new Map<number, (answer: Answer | null) => void>();
let nextRequestId = 1;
let module: NetHackModule | null = null;
let game: Game | null = null;
let recorder: Recorder | null = null;
let runner: ReplayRunner | null = null;

function send(message: WorkerMessage): void {
  self.postMessage(message);
}

function pushInput(input: Input): void {
  if (inputWaiter) {
    const resolve = inputWaiter;
    inputWaiter = null;
    resolve(input);
  } else {
    inputs.push(input);
  }
}

function syncfs(populate: boolean): Promise<void> {
  return new Promise((resolve) => {
    module!.FS.syncfs(populate, (err) => {
      if (err) console.error("syncfs failed", err);
      resolve();
    });
  });
}

let persisting: Promise<void> | null = null;
let persistAgain = false;

/** Writes /save to IndexedDB; a call made while one is running queues one more. */
function persist(): Promise<void> {
  if (persisting) {
    persistAgain = true;
    return persisting;
  }
  persisting = syncfs(false).then(() => {
    persisting = null;
    if (persistAgain) {
      persistAgain = false;
      return persist();
    }
  });
  return persisting;
}

/** Whether this is the only tab playing; if so, it stays that until this worker ends. */
function soleTab(): Promise<boolean> {
  return new Promise((resolve) => {
    // absent outside https and localhost, where the game in progress is asked about as before
    if (!navigator.locks) return resolve(false);
    void navigator.locks.request("nethack-game", { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

/** A version 4 UUID; crypto.randomUUID is missing outside https and localhost. */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type CreateModule = (config: object) => Promise<NetHackModule>;

async function loadCore(assetBase: string): Promise<CreateModule> {
  const url = new URL("nethack.js", assetBase).href;
  return ((await import(/* @vite-ignore */ url)) as { default: CreateModule }).default;
}

async function start({ assetBase, options, config }: StartOptions): Promise<void> {
  const createModule = await loadCore(assetBase);

  // taken once, so a game doesn't change zone as daylight saving starts or ends
  const utcOffset = -new Date().getTimezoneOffset() * 60;
  const host = {
    post(events: GameEvent[]) {
      send({ type: "events", events });
    },
    request(request: GameRequest): Promise<Answer | null> {
      const id = nextRequestId++;
      send({ type: "request", id, request });
      return new Promise((resolve) => answerWaiters.set(id, resolve));
    },
    nextInput(request: Extract<GameRequest, { kind: "poskey" }>): Promise<Input> {
      // the core has finished its turn: a restore has deleted its save, a checkpoint written level files
      void persist();
      const queued = inputs.shift();
      if (queued) return Promise.resolve(queued);
      send({ type: "request", id: nextRequestId++, request });
      return new Promise((resolve) => (inputWaiter = resolve));
    },
    persist,
    alone: await soleTab(),
    now: () => Math.floor(Date.now() / 1000),
    utcOffset: () => utcOffset,
    randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    uuid,
  };

  module = await createModule({
    noInitialRun: true,
    locateFile: (path: string) => new URL(path, assetBase).href,
    print: (s: string) => console.log(s),
    printErr: (s: string) => console.warn(s),
    preRun: [
      (m: NetHackModule) => {
        m.ENV.USER = "player";
        m.ENV.NETHACKOPTIONS = options;
        m.FS.writeFile(CONFIG_FILE, config);
        m.FS.mkdir(SAVE_DIR);
        m.FS.mount(m.IDBFS, {}, SAVE_DIR);
      },
    ],
  });
  await syncfs(true);

  recorder = new Recorder(host, module, {
    options,
    config,
    stream: (lines) => send({ type: "events", events: [{ type: "recorded", lines }] }),
    finished: (text) => send({ type: "events", events: [{ type: "recording", text }] }),
  });
  game = new Game(module, recorder);
  (globalThis as Record<string, unknown>).nethackCallback = (name: string, ...args: unknown[]) =>
    game!.callback(name, args);
  module.ccall("shim_graphics_set_callback", null, ["string"], ["nethackCallback"]);
  send({ type: "events", events: [{ type: "ready" }] });
  try {
    module._main(0, 0);
  } catch (e) {
    if ((e as { name?: string })?.name !== "ExitStatus") throw e;
  }
}

/** The callbacks of the replay's cores, which hold the cores; dropped to let them go. */
let replayCallbacks: string[] = [];
let replayRuns = 0;

const dropCallback = (name: string) => delete (globalThis as Record<string, unknown>)[name];

/** Boots a fresh core for each session of one playing-through of a recording. */
function replayBoot(createModule: CreateModule, assetBase: string, current: () => boolean): BootCore {
  const run = ++replayRuns;
  for (const name of replayCallbacks.splice(0)) dropCallback(name);
  let sessions = 0;
  return async (session, files, makeHost) => {
    let host: ReturnType<typeof makeHost> | null = null;
    const m = await createModule({
      noInitialRun: true,
      locateFile: (path: string) => new URL(path, assetBase).href,
      print: (s: string) => console.log(s),
      printErr: (s: string) => console.warn(s),
      onExit: () => host?.stopped("the core exited before the session's end"),
      onAbort: (what: unknown) => host?.stopped(`the core aborted: ${String(what)}`),
      preRun: [
        (core: NetHackModule) => {
          core.ENV.USER = "player";
          core.ENV.NETHACKOPTIONS = session.options;
          core.FS.writeFile(CONFIG_FILE, session.config);
          core.FS.mkdir(SAVE_DIR);
          writeSaveFiles(core, files);
        },
      ],
    });
    // a seek while this core was loading: it belongs to a playing-through no one watches
    if (!current()) return never();
    // the core before this one is left waiting in a callback for good
    const shared = (globalThis as { nethackGlobal?: { shimFunctionRunning?: unknown } }).nethackGlobal;
    if (shared) shared.shimFunctionRunning = null;
    host = makeHost(m);
    const replayed = new Game(m, host);
    host.game = replayed;
    module = m;
    game = replayed;
    const name = `nethackReplay${run}_${sessions++}`;
    replayCallbacks.push(name);
    (globalThis as Record<string, unknown>)[name] = (cb: string, ...args: unknown[]) => replayed.callback(cb, args);
    // the session's core is let go once its session is over
    void host.finished.then(() => dropCallback(name));
    m.ccall("shim_graphics_set_callback", null, ["string"], [name]);
    try {
      m._main(0, 0);
    } catch (e) {
      if ((e as { name?: string })?.name !== "ExitStatus") throw e;
    }
  };
}

async function startReplay(assetBase: string, text: string, turnsPerSecond: number): Promise<void> {
  const createModule = await loadCore(assetBase);
  send({ type: "events", events: [{ type: "ready" }] });
  runner = new ReplayRunner(
    text,
    (current) => replayBoot(createModule, assetBase, current),
    { events: (events) => send({ type: "events", events }), replay: (message) => send(message) },
    turnsPerSecond,
  );
  runner.start();
}

self.onmessage = (ev: MessageEvent<UiMessage>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "start":
      start(msg.start).catch((e) =>
        send({ type: "events", events: [{ type: "error", text: String(e?.stack ?? e) }] }),
      );
      break;
    case "replay":
      startReplay(msg.assetBase, msg.text, msg.turnsPerSecond).catch((e) =>
        send({ type: "events", events: [{ type: "error", text: String(e?.stack ?? e) }] }),
      );
      break;
    case "replay_control":
      runner?.control(msg.control);
      break;
    case "key":
      pushInput({ key: msg.code });
      break;
    case "click":
      pushInput({ click: { x: msg.x, y: msg.y, button: msg.button } });
      break;
    case "ascii_map":
      // like describe, this arrives only while the core is paused in a callback
      recorder?.asciiMap(msg.on);
      game?.setAsciiMap(msg.on);
      break;
    case "describe":
      // messages only arrive while the core is paused in a callback, so the map is settled
      send({ type: "description", id: msg.id, text: module ? describeSquare(module, msg.x, msg.y) : null });
      break;
    case "answer": {
      const resolve = answerWaiters.get(msg.id);
      answerWaiters.delete(msg.id);
      resolve?.(msg.answer);
      break;
    }
  }
};
