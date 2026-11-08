// The loop between a game and a bot in another process, over JSON lines on its stdin and stdout.
//
// BOT_INTERFACE=web (the default): an Observation out each time the game waits, and one action back, either
// {"key": <code>} when it waits for a key or {"answer": <Answer>} for any other request.
// BOT_INTERFACE=nle: NLE's observation (nle.ts) out, and {"key": <code>} back, one keystroke at a time, as NLE's
// step() takes them; the last observation has "done": true, and the runner answers the questions after the end.
// BOT_NLE_EXTRAS: a comma-separated list of extras for the NLE observation, as NLE.md says.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Answer } from "../../src/protocol";
import type { Session } from "../../tests/headless/harness";
import { EXTRAS, NleTerminal, loadNhData, type Extra } from "./nle";
import { Observer, type Seen } from "./observe";

const REPLY_MS = 120_000;
const ESC = 27;

/** A game a bot can play: a headless Session, or a page. */
export interface Playable extends Seen {
  ended: boolean;
  key(code: number): Promise<void>;
  answer(answer: Answer | null): Promise<void>;
  /** Until the game asks for something it hasn't been given, or ends; `first` for the game's first question. */
  waiting(first: boolean): Promise<void>;
  /** What farlook says of each square, the core's [x, y], without changing the game. */
  describe(squares: [number, number][]): Promise<(string | null)[]>;
}

export function sessionGame(session: Session): Playable {
  return {
    get state() {
      return session.state;
    },
    get prompt() {
      return session.prompt;
    },
    get ended() {
      return session.ended;
    },
    key: async (code) => void (await session.send(String.fromCharCode(code))),
    answer: async (answer) => void (await session.answer(answer)),
    waiting: async () => {},
    describe: async (squares) => squares.map(([x, y]) => session.describe(x, y)),
  };
}

type Action = { key: number } | { answer: Answer | null };

/** Plays the game with the bot in BOT_COMMAND for at most `steps` of its replies. */
export async function drive(game: Playable, steps: number): Promise<{ taken: number; stopped: boolean }> {
  const core = (globalThis as { nethackGlobal?: { constants?: Record<string, Record<string, number>> } }).nethackGlobal?.constants;
  const unexplored = core?.GLYPH?.GLYPH_UNEXPLORED;
  if (!core || unexplored === undefined) throw new Error("the core's constants aren't loaded");
  const observer = new Observer(game, unexplored);
  const nle = process.env.BOT_INTERFACE === "nle" ? new NleTerminal(loadNhData(), { MG: core.MG, BL_MASK: core.BL_MASK }) : null;
  const extras = (process.env.BOT_NLE_EXTRAS ?? "").split(",").filter(Boolean);
  for (const e of extras) if (!(EXTRAS as readonly string[]).includes(e)) throw new Error(`no NLE extra ${e}; there are ${EXTRAS.join(", ")}`);
  const wanted = (e: Extra) => extras.includes(e);
  if (nle && wanted("peaceful")) nle.extras.add("peaceful");
  const load = async () => {
    nle!.load(observer.observe());
    if (wanted("screen_descriptions")) {
      const squares = nle!.describable();
      nle!.describe(squares, await game.describe(squares));
    }
  };

  if (!process.env.BOT_COMMAND) throw new Error("set BOT_COMMAND to the bot's command line");
  const [command, ...args] = process.env.BOT_COMMAND.split(" ");
  const bot = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  const replies = createInterface({ input: bot.stdout })[Symbol.asyncIterator]();
  const reply = async (observation: unknown): Promise<Action | null> => {
    bot.stdin.write(`${JSON.stringify(observation)}\n`);
    let timer: NodeJS.Timeout | undefined;
    const line = await Promise.race([
      replies.next(),
      new Promise<IteratorResult<string>>((resolve) => (timer = setTimeout(() => resolve({ done: true, value: undefined }), REPLY_MS))),
    ]);
    clearTimeout(timer);
    return line.done ? null : (JSON.parse(line.value) as Action);
  };

  let taken = 0;
  let stopped = false;
  try {
    play: while (taken < steps) {
      // an online game's first question waits on the server, which may be starting up
      await game.waiting(taken === 0);
      if (game.ended) {
        // ended without the questions after the end, as by saving: the bot still hears that it's over
        if (nle) {
          await load();
          nle.done = true;
          bot.stdin.write(`${JSON.stringify(nle.observation())}\n`);
        }
        break;
      }
      if (!nle) {
        const action = await reply(observer.observe());
        taken++;
        if (!action) {
          stopped = true;
          break;
        }
        if ("key" in action) {
          if (game.prompt) throw new Error(`a key while the game asks ${JSON.stringify(game.prompt).slice(0, 200)}`);
          await game.key(action.key);
        } else {
          await game.answer(action.answer);
        }
        continue;
      }
      await load();
      if (nle.done) {
        bot.stdin.write(`${JSON.stringify(nle.observation())}\n`);
        await finish(game);
        break;
      }
      for (;;) {
        const action = await reply(nle.observation());
        taken++;
        if (!action || !("key" in action)) {
          stopped = true;
          break play;
        }
        const given = nle.key(action.key);
        if (given) {
          if ("key" in given) await game.key(given.key);
          else await game.answer(given.answer);
          break;
        }
        if (taken >= steps) break play;
      }
    }
    if (stopped) {
      // a bot that registers SIGUSR1 (as AutoAscend's Python bridge does) says where it was stuck
      bot.kill("SIGUSR1");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    bot.stdin.end();
    bot.kill();
  }
  return { taken, stopped };
}

/** Answers the questions after the end as a player keen to see it would, until the game is over. */
async function finish(game: Playable): Promise<void> {
  while (!game.ended) {
    const p = game.prompt;
    if (!p) await game.key(ESC);
    else if (p.kind === "yn") await game.answer({ kind: "yn", key: p.choices.includes("q") ? "q" : p.choices.includes("n") ? "n" : p.defaultChoice || "n" });
    else if (p.kind === "text") await game.answer({ kind: "text" });
    else await game.answer(null);
    await game.waiting(false);
  }
}
