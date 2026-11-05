import { expect, test } from "vitest";
import { toolbarActions } from "../../src/port/here-actions";
import { replayRecording, Session } from "./harness";

const labels = (g: Session) => toolbarActions(g.hereActions).map((a) => a.label);
const nameOf = (g: Session, label: string) => toolbarActions(g.hereActions).find((a) => a.label === label)?.name;

async function hereAction(g: Session, name: string) {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "hereaction")!.index });
  await g.getlin(name);
}

test("on the stairs the game starts on, the toolbar offers going up, then Search and Rest", async () => {
  const g = await (await Session.start({ options: "time" })).skipText();
  expect(labels(g)).toEqual(["Go up", "Search", "Rest"]);
});

test("an action runs as picking it from the here-menu does, and is replayed", async () => {
  const g = await (await Session.start({ wizard: true, pageSeed: 3, options: "time" })).skipText();
  await g.send("\x17");
  await g.getlin("apple");
  const apple = g.state.inventory.find((i) => /apple/.test(i.text))!;
  await g.send("d");
  await g.yn(apple.accelerator);
  expect(labels(g)).toEqual(expect.arrayContaining(["Pick up", "Eat"]));

  // clicking the hero still shows the here-menu, with its own wording
  await g.click(g.hero.x, g.hero.y);
  if (g.prompt?.kind !== "menu") throw new Error(`no menu: ${JSON.stringify(g.prompt)}`);
  expect(g.prompt.items.map((i) => i.text).filter(Boolean)).toEqual([
    "Go up the stairs",
    "Pick up an apple",
    "Eat an apple",
    "Inventory",
    "Drop items",
    "Rest one turn",
    "Search around you",
    "Look at what is here",
  ]);
  await g.dismiss();

  await hereAction(g, nameOf(g, "Eat")!);
  expect(g.messages.join(" ")).toMatch(/apple/i);
  expect(labels(g)).not.toContain("Eat");

  const turn = Number(g.state.status.BL_TIME?.text);
  await hereAction(g, nameOf(g, "Search")!);
  expect(Number(g.state.status.BL_TIME?.text)).toBeGreaterThan(turn);

  // an action this square doesn't allow does nothing
  const before = Number(g.state.status.BL_TIME?.text);
  await hereAction(g, "eat");
  expect(Number(g.state.status.BL_TIME?.text)).toBe(before);

  await g.send("#");
  await g.answer({ kind: "ext_cmd", index: (g.prompt as { commands: { name: string; index: number }[] }).commands.find((c) => c.name === "quit")!.index });
  while (!g.ended) await (g.prompt?.kind === "yn" ? g.yn(/really quit/i.test(g.prompt.query) ? "y" : "n") : g.dismiss());
  const replayed = await replayRecording(g.recording!);
  expect(replayed.error).toBeNull();
  expect(replayed.state.status).toEqual(g.state.status);
  // recorded by name, as extended commands are
  expect(g.recording).toMatch(/^\d+ l "eat"$/m);
});

/** Wishes for an apple, drops it, eats it and searches from the toolbar's actions, then taps one and cancels it. */
async function useToolbar(g: Session) {
  await g.send("\x17");
  await g.getlin("apple");
  const apple = g.state.inventory.find((i) => /apple/.test(i.text))!;
  await g.send("d");
  await g.yn(apple.accelerator);
  await hereAction(g, "eat");
  await hereAction(g, "search");
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "hereaction")!.index });
  await g.answer({ kind: "getlin", text: null });
  await g.send("s");
}

test("a cancelled action is recorded as cancelled, and does nothing", async () => {
  const g = await (await Session.start({ options: "time" })).skipText();
  const turn = g.state.status.BL_TIME?.text;
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "hereaction")!.index });
  await g.answer({ kind: "getlin", text: null });
  expect(g.state.status.BL_TIME?.text).toBe(turn);
  expect(g.recorded.slice(-2)).toEqual([expect.stringMatching(/ x "hereaction"$/), expect.stringMatching(/ l -$/)]);
});

test("a game left unfinished after using the toolbar comes back as it was", async () => {
  const left = await (await Session.start({ wizard: true, pageSeed: 3, options: "time" })).skipText();
  await useToolbar(left);

  const next = await (await Session.start({ wizard: true, pageSeed: 3, options: "time", saves: left.persisted })).skipText();
  expect(next.recorded.some((l) => / back /.test(l))).toBe(true);
  expect(next.state.status).toEqual(left.state.status);
  expect(next.hero).toEqual(left.hero);
  expect(next.state.inventory.map((i) => i.text)).toEqual(left.state.inventory.map((i) => i.text));
});
