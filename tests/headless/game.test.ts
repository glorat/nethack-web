import { expect, test } from "vitest";
import { Session } from "./harness";

test("a new game shows the map, status, inventory and equipment", async () => {
  const g = await (await Session.start()).skipText();

  const cells = g.state.map.filter((c) => c !== null);
  expect(cells.length).toBeGreaterThan(100);
  expect(cells.every((c) => c.tile >= 0 && c.tile < 2320)).toBe(true);
  expect(g.state.status.BL_TITLE?.text).toContain("Tester");
  expect(Number(g.state.status.BL_HP?.text)).toBeGreaterThan(0);

  expect(g.state.inventory.find((i) => /spear/.test(i.text))?.accelerator).toBe("a");
  expect(g.state.equipment[3]).toMatchObject({ letter: "a" });
  expect(g.state.equipment[5]).toMatchObject({ letter: "c" });
  expect(g.state.equipment[0]).toEqual({ letter: "", tile: -1 });
});

test("picking an inventory item offers its actions", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("i");
  await g.pick(/spear/);
  expect(g.prompt).toMatchObject({ kind: "menu", prompt: expect.stringMatching(/do what with.*spear/i) });
});

test("a saved game restores", async () => {
  const g = await (await Session.start()).skipText();
  await g.send("S");
  await g.yn("y");
  expect(g.ended).toBe(true);
  expect([...g.saves().keys()]).toContain("0Tester");

  const restored = await (await Session.start({ saves: g.saves() })).skipText();
  expect(restored.messages.some((t) => /welcome back/i.test(t))).toBe(true);
});

test("an item's actions are offered only while the core waits for a command", async () => {
  const g = await (await Session.start()).skipText();
  expect(g.inventoryKey).toBe("i".charCodeAt(0));
  // _ travels, and its position picker reads keys too
  await g.send("_");
  expect(g.prompt).toBeNull();
  expect(g.inventoryKey).toBe(0);
});

test("a character left open in the options is picked through the player request", async () => {
  const g = await Session.start({ character: "" });
  if (g.prompt?.kind !== "player") throw new Error(`expected the character picker, have ${JSON.stringify(g.prompt)}`);
  const { roles, races } = g.prompt.choices;
  const wizard = roles.findIndex((r) => r.name === "Wizard");
  const elf = races.findIndex((r) => r.name === "elf");
  expect(g.prompt.choices.validRace[wizard][elf]).toBe(true);

  await (await g.answer({ kind: "player", role: wizard, race: elf, gender: 1, align: 2 })).skipText();
  expect(g.messages.join(" ")).toMatch(/chaotic female elven Wizard/);
});
