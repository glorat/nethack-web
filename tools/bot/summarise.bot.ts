// Replays bot games' recordings and prints how each ended, from the xlogfile line the core wrote, as JSON lines.
//
//   BOT_RECORDINGS="a.rec b.rec" BOT_SUMMARY=out.jsonl pnpm exec vitest run --config tools/bot/vitest.config.ts summarise
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { test } from "vitest";
import { replayCore } from "../../tests/headless/harness";

const recordings = (process.env.BOT_RECORDINGS ?? "").split(/\s+/).filter(Boolean);

test.skipIf(!recordings.length)("summarise bot games", async () => {
  for (const file of recordings) {
    const text = readFileSync(file, "utf8");
    const turns = [...text.matchAll(/^\d+ T (\d+) /gm)];
    const summary: Record<string, string | number | null> = {
      recording: basename(file),
      lastTurn: turns.length ? Number(turns.at(-1)![1]) : null,
      finished: /^\d+ end over$/m.test(text) ? 1 : 0,
    };
    const { files, error } = await replayCore(text);
    if (error) summary.replayError = error.message;
    const xlog = files.get("xlogfile");
    const line = xlog && new TextDecoder().decode(xlog).trimEnd().split("\n").pop();
    if (line) for (const field of line.split("\t")) summary[field.slice(0, field.indexOf("="))] = field.slice(field.indexOf("=") + 1);
    const out = `${JSON.stringify(summary)}\n`;
    if (process.env.BOT_SUMMARY) appendFileSync(process.env.BOT_SUMMARY, out);
    else process.stderr.write(out);
  }
}, 0);
