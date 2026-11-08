// The NLE interface on a headless game: what it shows, and how it takes keys.
//
//   pnpm exec vitest run --config tools/bot/vitest.config.ts nle
import { beforeEach, expect, test } from "vitest";
import { Session } from "../../tests/headless/harness";
import { sessionGame, type Playable } from "./drive";
import { BL, COLNO, NleTerminal, loadNhData, type NleObservation } from "./nle";
import { Observer } from "./observe";
import { BOT_OPTIONS } from "./options";

const WIDTH = COLNO - 1;
let game: Playable;
let observer: Observer;
let term: NleTerminal;
const data = loadNhData();

beforeEach(async () => {
  game = sessionGame(
    await Session.start({ name: "Bot", seed: 7, character: "role:Valkyrie,race:human,gender:female,align:neutral", options: BOT_OPTIONS }),
  );
  const core = (globalThis as unknown as { nethackGlobal: { constants: Record<string, Record<string, number>> } }).nethackGlobal.constants;
  observer = new Observer(game, core.GLYPH.GLYPH_UNEXPLORED);
  term = new NleTerminal(data, { MG: core.MG, BL_MASK: core.BL_MASK });
  term.load(observer.observe());
  // past the welcome
  while (game.prompt || term.observation().misc[2]) await press("\x1b");
});

/** Types keys as an NLE bot would, one step each. */
async function press(keys: string): Promise<NleObservation> {
  for (const k of keys) {
    const given = term.key(k.charCodeAt(0));
    if (!given) continue;
    if ("key" in given) await game.key(given.key);
    else await game.answer(given.answer);
    term.load(observer.observe());
  }
  return term.observation();
}

const screen = (o: NleObservation) =>
  Array.from({ length: 24 }, (_, row) => String.fromCharCode(...o.tty_chars.slice(row * COLNO, (row + 1) * COLNO)));
const text = (bytes: number[]) => new TextDecoder().decode(new Uint8Array(bytes.filter((b) => b))).trim();

test("the hero is where blstats says, as NetHack 3.6 shows a Valkyrie, on the map and the terminal", async () => {
  const o = term.observation();
  const x = o.blstats[BL.X];
  const y = o.blstats[BL.Y];
  const glyph = o.glyphs[y * WIDTH + x - 1];
  const valkyrie = (data as unknown as { monsters: { names: string[] }[] }).monsters.findIndex((m) => m.names.includes("valkyrie"));
  expect(glyph).toBe(valkyrie);
  expect(String.fromCharCode(o.chars[y * WIDTH + x - 1])).toBe("@");
  expect(screen(o)[y + 1][x - 1]).toBe("@");
  expect(o.blstats[BL.HP]).toBeGreaterThan(0);
  expect(o.blstats[BL.TIME]).toBe(1);
  expect(o.blstats[BL.ALIGN]).toBe(0);
  expect(o.done).toBe(false);
});

test("the inventory shows over the map, ending (end), and Escape closes it", async () => {
  let o = await press("i");
  const shown = screen(o).join("\n");
  expect(shown).toMatch(/a - .*\(weapon in right hand\)/);
  expect(shown).toContain("(end)");
  o = await press("\x1b");
  expect(screen(o).join("\n")).not.toContain("(end)");
  expect(game.prompt).toBeNull();
});

test("a question shows its choices, and a typed line builds up until Enter", async () => {
  let o = await press("E");
  expect(text(o.message)).toMatch(/^What do you want to write with\? \[.*\]/);
  expect(o.misc).toEqual([1, 0, 0]);
  o = await press("-");
  while (!o.misc[1]) o = await press(" ");
  o = await press("Elbe");
  expect(text(o.message)).toBe("What do you want to write in the dust here? Elbe");
  await press("reth\r");
  expect(game.state.messages.map((m) => m.text).join("\n")).toContain("What do you want to write in the dust here? Elbereth");
  expect(game.prompt).toBeNull();
});

test("picking from a menu marks each choice before it's sent", async () => {
  let o = await press("D");
  expect(screen(o).join("\n")).toContain("Drop what type of items?");
  const all = screen(o).find((l) => /\b([a-zA-Z]) - All types/.test(l))!;
  const letter = /\b([a-zA-Z]) - All types/.exec(all)![1];
  o = await press(letter);
  expect(screen(o).join("\n")).toContain(`${letter} + All types`);
  expect(game.prompt?.kind).toBe("menu");
  await press("\x1b");
});

test("quitting ends the episode once the game asks about what's left", async () => {
  let o = await press("#quit\r");
  expect(text(o.message)).toMatch(/^Really quit/);
  o = await press("y");
  while (!o.done && game.prompt?.kind !== "yn") o = await press(" ");
  expect(term.done).toBe(true);
  expect(term.observation().done).toBe(true);
});
