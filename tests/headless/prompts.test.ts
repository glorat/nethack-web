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

test("a menu's items the core gave no letter get one", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "herecmdmenu")!.index });
  if (g.prompt?.kind !== "menu") throw new Error(`expected a menu, have ${JSON.stringify(g.prompt)}`);
  const items = g.prompt.items.filter((i) => i.identifier !== 0);
  expect(items.length).toBeGreaterThan(1);
  expect(items.map((i) => i.accelerator)).toEqual([..."abcdefghijklmnopqrstuvwxyz"].slice(0, items.length));
});

test("a direction prompt brings the core's direction keys, which number_pad changes", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("\x04");
  expect(g.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/direction/), directions: "hykulnjb><" });
  await g.yn("\x1b");

  const pad = await (await Session.start({ options: "number_pad:1" })).skipText();
  await pad.send("\x04");
  expect(pad.prompt).toMatchObject({ kind: "yn", directions: "47896321><" });
});

test("a question with its own answers brings no direction keys", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "pray")!.index });
  expect(g.prompt).toMatchObject({ kind: "yn", choices: expect.stringMatching(/y/) });
  expect((g.prompt as { directions?: string }).directions).toBeUndefined();
});

test("a counted answer to a question that allows one takes only that many", async () => {
  const g = await (await Session.start({ character: "role:Priest,race:human,gender:female,align:neutral", options: "menustyle:traditional" })).skipText();
  // with two things here, the pickup asks which kinds, then about each
  for (const thing of [/holy water/, /garlic/]) {
    await g.send("d");
    await g.yn(g.state.inventory.find((i) => thing.test(i.text))!.accelerator);
  }
  await g.send(",");
  await g.getlin("!");
  expect(g.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/Pick up 4 potions/), choices: "yn#aq" });
  await g.answer({ kind: "yn", key: "#", count: 3 });
  expect(g.state.inventory.find((i) => /holy water/.test(i.text))?.text).toMatch(/^3 potions/);
  expect(g.messages).toContain("Pick up 4 potions of holy water? [yn#aq] (y) #3");
});
