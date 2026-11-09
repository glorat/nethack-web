import { expect, test } from "vitest";
import { Session } from "./harness";

test("once the game is over, the lines up to the first question after it go to the page marked to send at once", async () => {
  const g = await (await Session.start({ seed: 7, options: "time" })).skipText();
  await g.send("ss");
  expect(g.batches.some((b) => b.over)).toBe(false);
  await g.send("#quit\n");
  if (g.prompt?.kind === "ext_cmd") await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  await g.yn("y");
  expect(g.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/possessions/) });
  const at = g.batches.findIndex((b) => b.over);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(g.batches[at]!.atPrompt).toBe(true);
  // everything before the question the dying player answers first is in it or before it
  expect(g.batches.slice(0, at + 1).flatMap((b) => b.lines)).toEqual(g.recorded);
});
