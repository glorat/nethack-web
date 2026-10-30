/// <reference lib="webworker" />
import type { Answer, GameEvent, GameRequest, StartOptions, UiMessage, WorkerMessage } from "../protocol";
import { CONFIG_FILE, Game, type Input } from "./game";
import { describeSquare, type NetHackModule } from "./memory";

declare const self: DedicatedWorkerGlobalScope;

const SAVE_DIR = "/save";

const inputs: Input[] = [];
let inputWaiter: ((input: Input) => void) | null = null;
const answerWaiters = new Map<number, (answer: Answer | null) => void>();
let nextRequestId = 1;
let module: NetHackModule | null = null;
let game: Game | null = null;

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

async function start({ assetBase, options, config }: StartOptions): Promise<void> {
  const url = new URL("nethack.js", assetBase).href;
  const { default: createModule } = (await import(/* @vite-ignore */ url)) as {
    default: (config: object) => Promise<NetHackModule>;
  };

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
      const queued = inputs.shift();
      if (queued) return Promise.resolve(queued);
      // the core has finished its turn: a restore has deleted its save, a level change written level files
      void persist();
      send({ type: "request", id: nextRequestId++, request });
      return new Promise((resolve) => (inputWaiter = resolve));
    },
    persist,
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

  game = new Game(module, host);
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

self.onmessage = (ev: MessageEvent<UiMessage>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "start":
      start(msg.start).catch((e) =>
        send({ type: "events", events: [{ type: "error", text: String(e?.stack ?? e) }] }),
      );
      break;
    case "key":
      pushInput({ key: msg.code });
      break;
    case "click":
      pushInput({ click: { x: msg.x, y: msg.y, button: msg.button } });
      break;
    case "ascii_map":
      // like describe, this arrives only while the core is paused in a callback
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
