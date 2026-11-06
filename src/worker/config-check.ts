// Asks the core what's wrong with an options file, without a game: a core of its own reads the file as a game
// would, and is dropped at its first question, by when the file has been read.
import type { ConfigProblem } from "../protocol";
import { CONFIG_FILE, Game, type GameHost } from "./game";
import type { NetHackModule } from "./memory";
import { never } from "./replayer";

export type CreateModule = (config: object) => Promise<NetHackModule>;

/** The problems in what the core said while reading the file, such as " * Line 3: Unknown option 'x'." */
export function configProblems(said: string[]): ConfigProblem[] {
  return said.flatMap((text) => {
    const m = /^ \* (?:Line (\d+): )?(.*?)\.?$/.exec(text);
    return m ? [{ line: m[1] ? Number(m[1]) : null, message: m[2] }] : [];
  });
}

export async function checkConfig(createModule: CreateModule, moduleOptions: object, config: string): Promise<ConfigProblem[]> {
  const said: string[] = [];
  let read!: () => void;
  const done = new Promise<void>((resolve) => (read = resolve));
  const m = await createModule({
    ...moduleOptions,
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
    onExit: () => read(),
    onAbort: () => read(),
    preRun: [
      (core: NetHackModule) => {
        core.ENV.USER = "player";
        // a name the sysconf takes as no one's, such as "player", would have the core ask for one
        core.ENV.NETHACKOPTIONS = "name:Checker";
        core.FS.writeFile(CONFIG_FILE, config);
        core.FS.mkdir("/save");
      },
    ],
  });
  const stop = <T>(): Promise<T> => {
    read();
    return never();
  };
  const host: GameHost = {
    alone: true,
    now: () => 0,
    utcOffset: () => 0,
    randomSeed: () => 1,
    uuid: () => "00000000-0000-4000-8000-000000000000",
    bonesWanted: () => Promise.resolve(null),
    bonesLeft: () => {},
    post: (events) => {
      for (const e of events) if (e.type === "message") said.push(e.text);
    },
    request: stop,
    nextInput: stop,
    persist: () => Promise.resolve(),
  };
  // a core before this one, in the same worker, is left waiting in a callback for good
  const shared = (globalThis as { nethackGlobal?: { shimFunctionRunning?: unknown } }).nethackGlobal;
  if (shared) shared.shimFunctionRunning = null;
  const game = new Game(m, host);
  const callback = `nethackConfigCheck${Date.now()}`;
  (globalThis as Record<string, unknown>)[callback] = (name: string, ...args: unknown[]) => game.callback(name, args);
  m.ccall("shim_graphics_set_callback", null, ["string"], [callback]);
  try {
    m._main(0, 0);
  } catch (e) {
    if ((e as { name?: string })?.name !== "ExitStatus") throw e;
  }
  await done;
  game.flush();
  delete (globalThis as Record<string, unknown>)[callback];
  return configProblems(said);
}
