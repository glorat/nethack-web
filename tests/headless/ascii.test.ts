import { expect, test } from "vitest";
import { Session } from "./harness";

async function fullOptions(g: Session) {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "optionsfull")!.index });
  if (g.prompt?.kind !== "menu") throw new Error("no options menu");
  return g.prompt.items;
}

test("the map is tiled unless ascii_map is asked for", async () => {
  const tiled = await (await Session.start()).skipText();
  expect((await fullOptions(tiled)).find((i) => i.text.startsWith("ascii_map"))?.text).toBe("ascii_map\t[false]");

  const ascii = await (await Session.start({ options: "ascii_map" })).skipText();
  expect((await fullOptions(ascii)).find((i) => i.text.startsWith("ascii_map"))?.text).toBe("ascii_map\t[true]");
});

test("the map's ASCII button switches the core's ascii_map", async () => {
  const g = await (await Session.start()).skipText();
  g.setAsciiMap(true);
  expect((await fullOptions(g)).find((i) => i.text.startsWith("ascii_map"))?.text).toBe("ascii_map\t[true]");
});

test("switching ascii_map or tiled_map in the options menu tells the map", async () => {
  const g = await (await Session.start()).skipText();
  expect(g.state.asciiMap).toBeNull();
  await fullOptions(g);
  await g.pick(/^ascii_map/);
  expect(g.state.asciiMap).toBe(true);
  await fullOptions(g);
  await g.pick(/^tiled_map/);
  expect(g.state.asciiMap).toBe(false);
});
