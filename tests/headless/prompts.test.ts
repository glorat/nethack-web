import { expect, test } from "vitest";
import { Session } from "./harness";

async function extended(g: Session, name: string) {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === name)!.index });
}

test("a typed answer is logged after its question", async () => {
  const g = await (await Session.start()).skipText();
  await extended(g, "annotate");
  await g.getlin("a note");
  expect(g.messages).toContain("What do you want to call this dungeon level? a note");
});

test("an answer ending in you is logged like any other", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x07");
  await g.getlin("you");
  if (g.prompt) await g.dismiss();
  expect(g.messages.some((t) => t.endsWith("monster? you"))).toBe(true);
  expect(g.ended).toBe(false);
});

test("Escape answers a yes/no question with no, and the log shows it", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("S");
  await g.answer(null);
  expect(g.ended).toBe(false);
  expect(g.messages).toContain("Really save? [yn] (n) n");
});

test("a list shown in the middle of a move holds the move until it is closed", async () => {
  const g = await (await Session.start({ options: "pettype:none" })).skipText();
  const turn = () => Number(g.state.status.BL_TIME?.text);
  const loose = g.state.inventory.filter((i) => i.identifier !== 0 && !/worn|weapon in/.test(i.text)).slice(0, 2);
  for (const item of loose) {
    await g.send("d");
    await g.yn(item.accelerator);
  }
  const { x, y } = g.hero;
  const away = [["l", "h"], ["h", "l"], ["j", "k"], ["k", "j"]].find(([step]) => {
    const [dx, dy] = { l: [1, 0], h: [-1, 0], j: [0, 1], k: [0, -1] }[step as "l" | "h" | "j" | "k"];
    return g.cell(x + dx, y + dy)?.ch === ".".charCodeAt(0);
  })!;
  await g.send(away[0]);
  const before = turn();
  await g.send(away[1]);
  expect(g.prompt).toMatchObject({ kind: "text", lines: expect.arrayContaining([expect.objectContaining({ text: expect.stringMatching(/things that are here/i) })]) });
  expect(turn()).toBe(before);
  await g.dismiss();
  expect(turn()).toBe(before + 1);
});

test("the version history and help files open in a text window", async () => {
  const g = await (await Session.start()).skipText();
  await extended(g, "history");
  expect(g.prompt).toMatchObject({ kind: "text" });
  expect(g.prompt?.kind === "text" && g.prompt.lines.length).toBeGreaterThan(20);
});
