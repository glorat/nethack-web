import { expect, test } from "vitest";
import { Session } from "./harness";

test("the status says when the hero is on the Rogue level, which the map draws as text", async () => {
  const g = await (await Session.start({ wizard: true, options: "pettype:none" })).skipText();
  expect(g.state.status.rogue_level).toBeUndefined();
  expect(g.state.status.dungeon_name?.text).toBe("The Dungeons of Doom");
  await g.send("\x16");
  await g.getlin("rogue");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  expect(g.state.status.rogue_level?.text).toBe("1");
  expect(g.messages.join(" ")).toMatch(/primitive world/);
  await g.send("\x16");
  await g.getlin("1");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  expect(g.state.status.dungeon_level?.text).toBe("1");
  expect(g.state.status.rogue_level).toBeUndefined();
});
