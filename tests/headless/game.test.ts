// Drives the worker's Game against the real WASM core in Node.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import type { Answer, GameEvent, GameRequest } from "../../src/protocol";
import { Game, type Input } from "../../src/worker/game";
import type { NetHackModule } from "../../src/worker/memory";

const ROOT = resolve(__dirname, "../..");

interface Run {
  events: GameEvent[];
  requests: GameRequest[];
  files: Map<string, Uint8Array>;
}

async function play(
  keys: string,
  answer: (r: GameRequest) => Answer | null,
  restoreFiles?: Map<string, Uint8Array>,
): Promise<Run> {
  const { default: createModule } = await import(pathToFileURL(resolve(ROOT, "public/nethack.js")).href);
  const run: Run = { events: [], requests: [], files: new Map() };
  const queue = [...keys].map((c) => c.charCodeAt(0));
  let m!: NetHackModule & { FS: { readdir(p: string): string[]; readFile(p: string): Uint8Array; writeFile(p: string, d: Uint8Array): void } };

  return new Promise((done) => {
    const finish = () => {
      for (const f of m.FS.readdir("/save")) if (!f.startsWith(".")) run.files.set(f, m.FS.readFile(`/save/${f}`));
      done(run);
    };
    createModule({
      noInitialRun: true,
      wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")),
      print: () => {},
      printErr: () => {},
      preRun: [
        (mod: typeof m) => {
          mod.ENV.USER = "player";
          mod.ENV.NETHACKOPTIONS = "name:Tester,role:Valkyrie,race:human,gender:female,align:neutral,!autopickup,!tutorial";
          mod.FS.mkdir("/save");
          for (const [f, data] of restoreFiles ?? []) mod.FS.writeFile(`/save/${f}`, data);
        },
      ],
    }).then((mod: typeof m) => {
      m = mod;
      const game = new Game(mod, {
        post: (events) => run.events.push(...events),
        request: async (r) => {
          run.requests.push(r);
          return answer(r);
        },
        nextInput: async (): Promise<Input> => {
          await new Promise((r) => setTimeout(r, 0));
          return { key: queue.shift() ?? 27 };
        },
        persist: async () => {},
      });
      (globalThis as Record<string, unknown>).nethackCallback = async (name: string, ...args: unknown[]) => {
        const result = await game.callback(name, args);
        if (name === "shim_exit_nhwindows") setTimeout(finish, 0);
        return result;
      };
      mod.ccall("shim_graphics_set_callback", null, ["string"], ["nethackCallback"]);
      try {
        mod._main(0, 0);
      } catch (e) {
        if ((e as { name?: string }).name !== "ExitStatus") throw e;
      }
    });
  });
}

const yesToEverything = (r: GameRequest): Answer | null => {
  switch (r.kind) {
    case "yn":
      return { kind: "yn", key: "y" };
    case "text":
      return { kind: "text" };
    case "menu":
      return { kind: "menu", selection: null };
    default:
      return null;
  }
};

test("new game reaches play, then saves and restores", async () => {
  const first = await play("llllhhhhS", yesToEverything);

  const map = first.events.filter((e) => e.type === "map").flatMap((e) => e.cells);
  expect(map.length).toBeGreaterThan(100);
  expect(map.every((c) => c.tile >= 0 && c.tile < 2320)).toBe(true);

  const status = first.events.filter((e) => e.type === "status").at(-1);
  expect(status?.fields.BL_TITLE?.text).toContain("Tester");
  expect(Number(status?.fields.BL_HP?.text)).toBeGreaterThan(0);

  const inventory = first.events.filter((e) => e.type === "inventory").at(-1);
  expect(inventory?.items.some((i) => /spear/.test(i.text))).toBe(true);
  expect(inventory?.items.find((i) => /spear/.test(i.text))?.accelerator).toBe("a");
  expect(inventory?.equipment[3]).toMatchObject({ letter: "a" });
  expect(inventory?.equipment[5]).toMatchObject({ letter: "c" });
  expect(inventory?.equipment[0]).toEqual({ letter: "", tile: -1 });

  expect(first.requests.some((r) => r.kind === "yn" && /save/i.test(r.query))).toBe(true);
  expect(first.events.at(-1)?.type).toBe("game_over");
  expect([...first.files.keys()]).toContain("0Tester");

  const second = await play("S", yesToEverything, first.files);
  const messages = second.events.filter((e) => e.type === "message").map((e) => e.text);
  expect(messages.some((t) => /welcome back/i.test(t))).toBe(true);
}, 60_000);

test("picking an inventory item reaches its actions", async () => {
  let picked = false;
  const run = await play("iS", (r) => {
    if (r.kind === "menu" && !picked) {
      const spear = r.items.find((i) => /spear/.test(i.text));
      if (spear) {
        picked = true;
        return { kind: "menu", selection: [{ identifier: spear.identifier, count: -1 }] };
      }
    }
    return yesToEverything(r);
  });

  const menus = run.requests.filter((r) => r.kind === "menu");
  const inventory = menus.find((r) => r.items.some((i) => /spear/.test(i.text)));
  const ids = inventory!.items.map((i) => i.identifier).filter((id) => id !== 0);
  expect(new Set(ids).size).toBe(ids.length);
  expect(inventory!.items.some((i) => i.identifier === 0)).toBe(true);
  expect(menus.some((r) => /do what with.*spear/i.test(r.prompt))).toBe(true);
}, 60_000);
