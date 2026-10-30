import { expect, test } from "vitest";
import { Session } from "./harness";

const PRIEST = "role:Priest,race:human,gender:female,align:neutral";

async function quaffMenu(g: Session) {
  await g.send("q");
  if (g.prompt?.kind !== "menu") throw new Error(`expected a menu, have ${JSON.stringify(g.prompt)}`);
  return g.prompt;
}

test("with force_invmenu an item prompt is a menu, and takes a letter it doesn't list", async () => {
  const g = await (await Session.start({ character: PRIEST, options: "force_invmenu" })).skipText();
  const menu = await quaffMenu(g);
  // each item's identifier is its letter
  for (const item of menu.items) if (item.identifier) expect(item.identifier).toBe(item.accelerator.charCodeAt(0));

  const mace = g.state.inventory.find((i) => /mace/.test(i.text))!.accelerator;
  expect(menu.unlisted).toContain(mace);
  await g.answer({ kind: "menu", selection: [{ identifier: mace.charCodeAt(0), count: -1 }] });
  expect(g.messages.at(-1)).toMatch(/silly thing to drink/);
});

test("the letters it takes are what is carried now, gold included, whatever the sidebar shows", async () => {
  const g = await (await Session.start({ wizard: true, character: PRIEST, options: "force_invmenu,!perm_invent" })).skipText();
  await g.send("\x17");
  await g.getlin("10 gold pieces");
  const menu = await quaffMenu(g);
  expect(menu.unlisted).toContain("$");
  expect(menu.unlisted).not.toContain("-");
  await g.answer({ kind: "menu", selection: [{ identifier: "$".charCodeAt(0), count: -1 }] });
  expect(g.messages.at(-1)).toMatch(/cannot drink gold/i);
});
