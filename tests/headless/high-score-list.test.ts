import { expect, test } from "vitest";
import { isHighScoreList } from "../../src/port/high-score-list";
import { Session } from "./harness";

test("of the text windows at a game's end, only the core's high-score list is taken for it", async () => {
  const g = await (await Session.start({ seed: 7 })).skipText();
  await g.send("#quit\n");
  if (g.prompt?.kind === "ext_cmd") await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  await g.yn("y");
  while (g.prompt?.kind === "yn") await g.yn("n");
  const windows: { text: string }[][] = [];
  while (g.prompt?.kind === "text") {
    windows.push(g.prompt.lines);
    await g.dismiss();
  }
  expect(windows.map(isHighScoreList)).toEqual([false, true]);
  expect(windows[0]!.map((l) => l.text).join("\n")).toMatch(/You quit in/);
});

test("the list is known by its header or by what it says of the game's place", () => {
  const window = (...texts: string[]) => texts.map((text) => ({ text }));
  expect(isHighScoreList(window("You made the top ten list!", ""))).toBe(true);
  expect(isHighScoreList(window("You reached the 12th place on the top 100 list.", ""))).toBe(true);
  expect(isHighScoreList(window("Goodbye Bot the Stripling...", "", "You quit with 0 points."))).toBe(false);
});
