// Asks the core what's wrong with an options file, from a core of its own that reads the file as a new game
// would and is then dropped, so the game in play isn't touched.
import { CONFIG_FILE } from "./worker/game";
import type { NetHackModule } from "./worker/memory";

/** What the core says is wrong with a line of an options file; line is null if it doesn't say which. */
export interface ConfigProblem {
  line: number | null;
  message: string;
}

export type CreateModule = (config: object) => Promise<NetHackModule>;

/** The core's "line<TAB>message" lines, line 0 when it doesn't know. */
export function configProblems(text: string): ConfigProblem[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf("\t");
      const line = Number(row.slice(0, tab));
      return { line: line > 0 ? line : null, message: row.slice(tab + 1) };
    });
}

export async function checkConfig(createModule: CreateModule, moduleOptions: object, config: string): Promise<ConfigProblem[]> {
  const m = await createModule({
    ...moduleOptions,
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
    preRun: [(core: NetHackModule) => core.FS.writeFile(CONFIG_FILE, config)],
  });
  return configProblems(m.ccall("nhweb_check_config", "string", [], []) as string);
}

/** As checkConfig, with the core the page plays. */
export async function checkOptionsFile(assetBase: string, config: string): Promise<ConfigProblem[]> {
  const url = new URL("nethack.js", assetBase).href;
  const { default: createModule } = (await import(/* @vite-ignore */ url)) as { default: CreateModule };
  return checkConfig(createModule, { locateFile: (path: string) => new URL(path, assetBase).href }, config);
}
