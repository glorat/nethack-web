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
