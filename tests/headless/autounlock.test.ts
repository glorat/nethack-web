import { expect, test } from "vitest";
import { BASE_OPTIONS } from "../../src/port/options";
import { Session } from "./harness";

test("looting a locked box offers to force its lock with the wielded weapon", async () => {
  const g = await (await Session.start({ wizard: true, character: "role:Valkyrie,race:human,gender:female,align:neutral", options: BASE_OPTIONS })).skipText();
  await g.send("\x17");
  await g.getlin("locked large box");
  await g.skipText();
  if (g.state.inventory.some((i) => /large box/.test(i.text))) {
    await g.send("d");
    await g.pick("large box");
  }
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "loot")!.index });
  expect(g.prompt).toMatchObject({ kind: "yn", query: "There is a locked large box here; force its lock?" });
  await g.yn("y");
  expect(g.messages).toContain("You succeed in forcing the lock.");
});
