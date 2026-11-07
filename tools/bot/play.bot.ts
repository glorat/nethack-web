// Plays one game with a bot that runs as a separate process, exchanging JSON lines:
// an Observation out each time the game waits, and one action back, either
// {"key": <code>} when it waits for a key or {"answer": <Answer>} for any other request.
//
//   BOT_SEED=3 pnpm exec vitest run --config tools/bot/vitest.config.ts
//
// BOT_COMMAND: the bot's command line (default: AutoAscend's bridge, from ../autoascend).
// BOT_STEPS: how many actions at most. BOT_OUT: where to write the game's recording.
// BOT_CHARACTER: NETHACKOPTIONS character fields. A finished game is replayed to check its recording.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { expect, test } from "vitest";
import type { Answer } from "../../src/protocol";
import { replayRecording, Session } from "../../tests/headless/harness";
import { Observer } from "./observe";

const OPTIONS = [
  "autopickup",
  "pickup_types:$?!/",
  "pickup_burden:unencumbered",
  "mention_walls",
  "!cmdassist",
  "!legacy",
  "showexp",
  "showscore",
  "time",
  "runmode:teleport",
  // options 5.0 added or changed, set as 3.6 played: AutoAscend handles locks itself, searches beside
  // monsters, and walks into water it means to
  "autounlock:none",
  "!safe_wait",
  "paranoid_confirmation:pray",
].join(",");

type Action = { key: number } | { answer: Answer | null };

const REPLY_MS = 120_000;

test("bot plays a game", async () => {
  const seed = Number(process.env.BOT_SEED ?? 1);
  const steps = Number(process.env.BOT_STEPS ?? 5000);
  const session = await Session.start({
    name: "Bot",
    pageSeed: seed,
    seedsVary: true,
    character: process.env.BOT_CHARACTER || "role:Valkyrie,race:human,gender:female,align:neutral",
    options: OPTIONS,
  });
  const unexplored = (globalThis as { nethackGlobal?: { constants?: { GLYPH?: Record<string, number> } } }).nethackGlobal
    ?.constants?.GLYPH?.GLYPH_UNEXPLORED;
  if (unexplored === undefined) throw new Error("the core's glyph constants aren't loaded");
  const observer = new Observer(session, unexplored);

  const [command, ...args] = (process.env.BOT_COMMAND ?? "uv run --project ../autoascend python -m autoascend.bridge").split(" ");
  const bot = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  const replies = createInterface({ input: bot.stdout })[Symbol.asyncIterator]();

  let taken = 0;
  let stopped = false;
  try {
    for (; taken < steps && !session.ended; taken++) {
      bot.stdin.write(`${JSON.stringify(observer.observe())}\n`);
      // a bot that stops answering is stuck, and the recording so far is still worth keeping
      const reply = await Promise.race([
        replies.next(),
        new Promise<IteratorResult<string>>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), REPLY_MS)),
      ]);
      if (reply.done) {
        stopped = true;
        break;
      }
      const action = JSON.parse(reply.value) as Action;
      if ("key" in action) {
        if (session.prompt) throw new Error(`a key while the game asks ${JSON.stringify(session.prompt).slice(0, 200)}`);
        await session.send(String.fromCharCode(action.key));
      } else {
        await session.answer(action.answer);
      }
    }
  } finally {
    bot.stdin.end();
    bot.kill();
  }

  const out = process.env.BOT_OUT;
  if (out) writeFileSync(out, (session.recording ?? session.recorded.join("\n")) + "\n");
  process.stderr.write(
    `seed ${seed}: ${taken} actions, turn ${session.state.status.BL_TIME?.text ?? "?"}, ` +
      `${session.ended ? `ended: ${session.state.gameOver ?? ""}` : stopped ? "the bot stopped" : "still playing"}\n`,
  );
  expect(stopped, "the bot stopped before the game ended").toBe(false);

  // a finished game's recording must replay as it was played, as the server's validator would
  if (session.recording) {
    const replayed = await replayRecording(session.recording);
    expect(replayed.error).toBeNull();
    expect(replayed.state.status.BL_TIME?.text).toBe(session.state.status.BL_TIME?.text);
    process.stderr.write(`replayed to turn ${replayed.state.status.BL_TIME?.text}\n`);
  }
}, 0);
