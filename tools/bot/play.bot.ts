// Plays one headless game with a bot that runs as a separate process, exchanging JSON lines as drive.ts says.
//
//   BOT_SEED=3 pnpm exec vitest run --config tools/bot/vitest.config.ts
//
// BOT_COMMAND: the bot's command line (default: the TypeScript AutoAscend in ../autoascend-ts).
// BOT_INTERFACE: web (default) or nle, as drive.ts says.
// BOT_STEPS: how many actions at most. BOT_OUT: where to write the game's recording.
// BOT_CHARACTER: NETHACKOPTIONS character fields. A finished game is replayed to check its recording.
import { writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { replayRecording, Session } from "../../tests/headless/harness";
import { drive, sessionGame } from "./drive";
import { BOT_OPTIONS } from "./options";

test("bot plays a game", async () => {
  const seed = Number(process.env.BOT_SEED ?? 1);
  const steps = Number(process.env.BOT_STEPS ?? 5000);
  const session = await Session.start({
    name: "Bot",
    pageSeed: seed,
    seedsVary: true,
    character: process.env.BOT_CHARACTER || "role:Valkyrie,race:human,gender:female,align:neutral",
    options: BOT_OPTIONS,
  });
  let taken = 0;
  let stopped = false;
  try {
    ({ taken, stopped } = await drive(sessionGame(session), steps));
  } finally {
    // a bot that stops answering is stuck, and the recording so far is still worth keeping
    const out = process.env.BOT_OUT;
    if (out) writeFileSync(out, (session.recording ?? session.recorded.join("\n")) + "\n");
  }
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
