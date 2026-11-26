import { expect, test } from "vitest";
import type { NetHackModule } from "../../src/worker/memory";
import { replay, ReplayError } from "../../src/worker/replayer";
import { headlessBoot, Session } from "./harness";

/** Quits a game, answering the questions after it as `answer` says, and gives its recording whole and up to the first question. */
async function quitGame(answer: (query: string) => string) {
  const g = await (await Session.start({ pageSeed: 7 })).skipText();
  await g.send("ss#");
  await g.answer({ kind: "ext_cmd", index: (g.prompt as Extract<typeof g.prompt, { kind: "ext_cmd" }>).commands.find((c) => c.name === "quit")!.index });
  await g.yn("y");
  const over = g.batches.findIndex((b) => b.over);
  const toFirstQuestion = `${g.batches
    .slice(0, over + 1)
    .flatMap((b) => b.lines)
    .join("\n")}\n`;
  while (!g.ended) {
    if (g.prompt?.kind === "yn") await g.yn(answer(g.prompt.query));
    else if (g.prompt?.kind === "text") await g.dismiss();
    else if (g.prompt?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else throw new Error(`unexpected ${JSON.stringify(g.prompt)}`);
  }
  return { whole: g.recording!, toFirstQuestion };
}

/** The xlog entry a replay leaves, if the game reached its end. */
async function xlogOf(text: string, endAtGameOver: boolean): Promise<{ xlog?: string; error?: ReplayError }> {
  const boot = (await headlessBoot())(() => true);
  let core!: NetHackModule;
  try {
    await replay(
      text,
      (session, files, makeHost) =>
        boot(session, files, (m) => {
          core = m;
          return makeHost(m);
        }),
      { post: () => {}, pace: () => Promise.resolve(), delay: () => Promise.resolve(), endAtGameOver },
    );
  } catch (e) {
    if (!(e instanceof ReplayError)) throw e;
    return { error: e };
  }
  const xlog = core.FS.analyzePath("/save/xlogfile").exists ? (core.FS.readFile("/save/xlogfile", { encoding: "utf8" }) as string).trim() : "";
  return xlog ? { xlog } : {};
}

test("ending at the first question after a death gives the game's own end, whatever the player answered after it", async () => {
  const declined = await quitGame(() => "n");
  const looked = await quitGame(() => "y");
  const asPlayed = await xlogOf(declined.whole, false);
  expect(asPlayed.xlog).toMatch(/death=quit/);
  // the answers after the death are in the recording, and differ
  expect(looked.whole).not.toBe(declined.whole);
  for (const text of [declined.whole, looked.whole, declined.toFirstQuestion]) expect(await xlogOf(text, true)).toEqual(asPlayed);
});

test("a recording that stops at the first question has no end unless the replay ends the game there", async () => {
  const { toFirstQuestion } = await quitGame(() => "n");
  expect(await xlogOf(toFirstQuestion, false)).toEqual({});
});
