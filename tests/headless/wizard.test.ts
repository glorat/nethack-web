import { expect, test } from "vitest";
import { WIZARD_MENU } from "../../src/ui/commands";
import { Session } from "./harness";

test("a debug-mode game says so, for the Wizard Mode menu, and has each of its commands", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  expect(g.wizard).toBe(true);
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  const names = g.prompt.commands.map((c) => c.name);
  for (const item of WIZARD_MENU.items) if (item) expect(names).toContain(item.command);
});

test("a normal game has no wizard mode", async () => {
  const g = await (await Session.start()).skipText();
  expect(g.wizard).toBe(false);
});
