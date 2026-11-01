/// <reference lib="webworker" />
import { HeldEvents } from "../port/held-events";
import type { Answer, GameEvent, GameRequest, StartOptions, UiMessage, WorkerMessage } from "../protocol";
import { createAuthority } from "./authority";
import { ReplayRunner } from "./replay-runner";
import { type BootCore, never, saveFiles, writeSaveFiles } from "./replayer";
import { Shadow } from "./shadow";
import { CONFIG_FILE, Game, type Input } from "./game";
import { BonesDb } from "./bones";
import { Recorder } from "./recorder";
import { placeGameFiles, resumedHost, resumeGame, resumeToLastGood } from "./resume";
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
let shadow: Shadow | null = null;

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

/** The files of the game being played, of all the games /save may hold. */
function gameFiles(m: NetHackModule): Record<string, Uint8Array> {
  const name = m.UTF8ToString(m._nhweb_game_name()).replace(/\.\d+$/, "");
  return Object.fromEntries([...saveFiles(m)].filter(([f]) => f === name || f.startsWith(`${name}.`)));
}

type CreateModule = (config: object) => Promise<NetHackModule>;

async function loadCore(assetBase: string): Promise<CreateModule> {
  const url = new URL("nethack.js", assetBase).href;
  return ((await import(/* @vite-ignore */ url)) as { default: CreateModule }).default;
}

async function start({ assetBase, options, config, shadowed, authority }: StartOptions): Promise<void> {
  const createModule = await loadCore(assetBase);

  const host = {
    ...(await createAuthority(authority, () => module!.FS)),
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
  };

  const loadSaved = async (coreOptions: string, coreConfig: string, stopped?: (why: string) => void) => {
    module = await createModule({
      noInitialRun: true,
      locateFile: (path: string) => new URL(path, assetBase).href,
      print: (s: string) => console.log(s),
      printErr: (s: string) => console.warn(s),
      onExit: () => stopped?.("the core exited before the session's end"),
      onAbort: (what: unknown) => stopped?.(`the core aborted: ${String(what)}`),
      preRun: [
        (m: NetHackModule) => {
          m.ENV.USER = "player";
          m.ENV.NETHACKOPTIONS = coreOptions;
          m.FS.writeFile(CONFIG_FILE, coreConfig);
          m.FS.mkdir(SAVE_DIR);
          m.FS.mount(m.IDBFS, {}, SAVE_DIR);
        },
      ],
    });
    await syncfs(true);
    // a core before this one is left waiting in a callback for good
    const shared = (globalThis as { nethackGlobal?: { shimFunctionRunning?: unknown } }).nethackGlobal;
    if (shared) shared.shimFunctionRunning = null;
    return module;
  };

  const startRecorder = (m: NetHackModule, coreOptions: string, coreConfig: string) =>
    new Recorder(host, m, {
      options: coreOptions,
      config: coreConfig,
      stream: (lines, atPrompt) => send({ type: "events", events: [{ type: "recorded", lines, atPrompt }] }),
      shadowed,
      before: shadowed ? (text) => send({ type: "events", events: [{ type: "recorded_before", text }] }) : undefined,
      finished: (text) => send({ type: "events", events: [{ type: "recording", text }] }),
      resume: replayFailed ? undefined : resume,
    });

  let cores = 0;
  const runCore = (m: NetHackModule, playing: Game) => {
    game = playing;
    const callback = `nethackCallback${cores++}`;
    (globalThis as Record<string, unknown>)[callback] = (name: string, ...args: unknown[]) => playing.callback(name, args);
    m.ccall("shim_graphics_set_callback", null, ["string"], [callback]);
    try {
      m._main(0, 0);
    } catch (e) {
      if ((e as { name?: string })?.name !== "ExitStatus") throw e;
    }
  };

  const playLive = async () => {
    const m = await loadSaved(options, config);
    recorder = startRecorder(m, options, config);
    runCore(m, new Game(m, recorder));
  };

  let replayFailed = false;

  async function resume(text: string, name: string): Promise<boolean> {
    let held = new HeldEvents();
    const db = new BonesDb(module!.FS);
    try {
      await resumeToLastGood(text, (text) => resumeGame(
        text,
        {
          bones: (hash) => db.get(hash),
          boot: replayBoot(createModule, assetBase, () => true),
          bootLast: async (session, files, makeHost) => {
            held = new HeldEvents();
            let replayed: ReturnType<typeof makeHost> | null = null;
            const m = await loadSaved(session.options, session.config, (why) => replayed?.stopped(why));
            placeGameFiles(m, name, files);
            replayed = makeHost(m);
            recorder = startRecorder(m, session.options, session.config);
            const carrying = new Game(
              m,
              resumedHost(replayed, text, recorder, () => {
                // typed without seeing the map
                inputs.length = 0;
                send({ type: "events", events: held.all() });
              }),
            );
            replayed.game = carrying;
            runCore(m, carrying);
          },
        },
        (events) => held.add(events),
      ));
    } catch (e) {
      // the core after this has no resume, so it asks the player
      console.warn("couldn't replay the game", e);
      replayFailed = true;
      await playLive();
    }
    return true;
  }

  send({ type: "events", events: [{ type: "ready" }] });
  await playLive();
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
  // only for reading the bones this browser keeps; it never runs
  module = await createModule({
    noInitialRun: true,
    locateFile: (path: string) => new URL(path, assetBase).href,
    preRun: [
      (m: NetHackModule) => {
        m.FS.mkdir(SAVE_DIR);
        m.FS.mount(m.IDBFS, {}, SAVE_DIR);
      },
    ],
  });
  await syncfs(true);
  const db = new BonesDb(module.FS);
  send({ type: "events", events: [{ type: "ready" }] });
  runner = new ReplayRunner(
    text,
    (current) => replayBoot(createModule, assetBase, current),
    { events: (events) => send({ type: "events", events }), replay: (message) => send(message) },
    turnsPerSecond,
    (hash) => db.get(hash),
  );
  runner.start();
}

/** A core of its own, reading this browser's bones, that follows the game by its recording. */
async function startShadow(assetBase: string): Promise<void> {
  const createModule = await loadCore(assetBase);
  module = await createModule({
    noInitialRun: true,
    locateFile: (path: string) => new URL(path, assetBase).href,
    preRun: [
      (m: NetHackModule) => {
        m.FS.mkdir(SAVE_DIR);
        m.FS.mount(m.IDBFS, {}, SAVE_DIR);
      },
    ],
  });
  await syncfs(true);
  const db = new BonesDb(module.FS);
  shadow = new Shadow(
    replayBoot(createModule, assetBase, () => true),
    (hash) => db.get(hash),
    (status) => send({ type: "shadow_status", status }),
  );
  for (const message of shadowWaiting.splice(0)) followShadow(message);
}

const shadowWaiting: Extract<UiMessage, { type: "shadow_before" | "shadow_lines" }>[] = [];

function followShadow(message: Extract<UiMessage, { type: "shadow_before" | "shadow_lines" }>): void {
  if (!shadow) shadowWaiting.push(message);
  else if (message.type === "shadow_before") shadow.before(message.text);
  else shadow.add(message.lines, message.atPrompt);
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
    case "shadow":
      startShadow(msg.assetBase).catch((e) =>
        send({ type: "shadow_status", status: { state: "mismatch", turn: 0, message: String(e?.stack ?? e) } }),
      );
      break;
    case "shadow_before":
    case "shadow_lines":
      followShadow(msg);
      break;
    case "debug_files": {
      const db = module && new BonesDb(module.FS);
      const bones = Object.fromEntries(msg.hashes.flatMap((h) => {
        const data = db?.get(h);
        return data ? [[h, data]] : [];
      }));
      send({ type: "debug_files", id: msg.id, files: module ? gameFiles(module) : {}, bones });
      break;
    }
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
