// Long recorded games that must replay exactly on every build: a change that
// alters how the game plays fails here. GOLDEN=write pnpm test golden
// records them afresh.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { replayRecording, Session, type SessionOptions } from "./harness";

const DIR = resolve(__dirname, "golden");

/** Moves, searches, looks at the inventory and heads for the stairs down, from a fixed list of choices. */
async function explore(g: Session, steps: number, state: { n: number }): Promise<void> {
  const moves = "hjklyubn";
  for (let i = 0; i < steps && !g.ended; i++) {
    const r = (state.n = (state.n * 1103515245 + 12345) % 2147483648);
    // the high bits: a generator like this one cycles in its low ones
    const pick = (r >> 16) % 20;
    if (pick < 10) await g.send(moves[(r >> 8) % moves.length].repeat(1 + ((r >> 12) % 4)));
    else if (pick < 13) await g.send("s".repeat(1 + ((r >> 8) % 5)));
    else if (pick < 15) await g.send("_>.");
    else if (pick < 17) await g.send(">");
    else if (pick < 18) await g.send("i");
    else if (pick === 19 && g.state.inventory.some((item) => /pick-axe/.test(item.text))) await digDown(g);
    else await g.send(`${moves[(r >> 8) % moves.length]}`);
    await settle(g);
  }
}

/** Digs through the floor with the pick-axe, to the level below. */
async function digDown(g: Session): Promise<void> {
  const pick = g.state.inventory.find((item) => /pick-axe/.test(item.text))!.accelerator;
  await g.send("a");
  if (g.prompt?.kind === "yn") await g.yn(pick);
  if (g.prompt?.kind === "yn" && /direction/.test(g.prompt.query)) await g.yn(">");
}

/** Gets past whatever the game asks, declining anything with a choice. */
async function settle(g: Session): Promise<void> {
  for (let k = 0; k < 30 && g.prompt && g.prompt.kind !== "poskey" && !g.ended; k++) {
    const p = g.prompt;
    if (p.kind === "text") await g.dismiss();
    else if (p.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else if (p.kind === "yn") await g.yn(p.choices.includes("n") ? "n" : p.choices.includes("q") ? "q" : "\x1b");
    else if (p.kind === "getlin") await g.getlin(null);
    else if (p.kind === "ext_cmd") await g.answer({ kind: "ext_cmd", index: -1 });
    else break;
  }
}

async function quit(g: Session): Promise<void> {
  if (g.ended) return;
  await g.send("#");
  if (g.prompt?.kind === "ext_cmd") await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  for (let k = 0; k < 40 && !g.ended; k++) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else if (p?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else break;
  }
}

/**
 * A game played over three sessions, saved, restored, left open, recovered
 * and quit; or as far as it got, if the hero died on the way.
 */
async function record(options: SessionOptions, seed: number): Promise<string> {
  const state = { n: seed };
  const first = await (await Session.start(options)).skipText();
  await explore(first, 150, state);
  if (first.recording) return first.recording;
  await first.send("S");
  if (first.prompt?.kind === "yn") await first.yn("y");
  const second = await (await Session.start({ ...options, saves: first.saves() })).skipText();
  await explore(second, 150, state);
  if (second.recording) return second.recording;
  const third = await (await Session.start({ ...options, saves: second.persisted })).skipText();
  await explore(third, 150, state);
  await quit(third);
  return third.recording!;
}

const GAMES: { file: string; options: SessionOptions; seed: number }[] = [
  { file: "valkyrie.txt", options: { pageSeed: 1000, seedsVary: true, options: "time" }, seed: 1 },
  {
    file: "archeologist.txt",
    options: { pageSeed: 2000, seedsVary: true, character: "role:Archeologist,race:dwarf,gender:male,align:lawful", options: "time" },
    seed: 7,
  },
];

if (process.env.GOLDEN === "write")
  test("record the golden games", async () => {
    for (const game of GAMES) writeFileSync(resolve(DIR, game.file), await record(game.options, game.seed));
  }, 120000);

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".txt")))
  test(`the golden game ${file} replays exactly`, async () => {
    const replayed = await replayRecording(readFileSync(resolve(DIR, file), "utf8"));
    expect(replayed.error).toBeNull();
  }, 60000);
