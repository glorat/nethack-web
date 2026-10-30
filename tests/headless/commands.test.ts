import { expect, test } from "vitest";
import { COMMAND_MENUS, GAME_MENU, HELP_MENU } from "../../src/ui/commands";
import { Session } from "./harness";

test("every menu bar command is one the game offers", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  const names = g.prompt.commands.map((c) => c.name);
  for (const item of [...GAME_MENU, ...COMMAND_MENUS.flatMap((m) => m.items), ...HELP_MENU]) if (item) expect(names).toContain(item.command);
});
