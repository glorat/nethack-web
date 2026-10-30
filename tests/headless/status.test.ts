import { expect, test } from "vitest";
import { encumbranceSeverity } from "../../src/port/badges";
import { Session } from "./harness";

async function polyself(g: Session, form: string) {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "polyself")!.index });
  await g.getlin(form);
  while (g.prompt) await (g.prompt.kind === "yn" ? g.yn("y") : g.dismiss());
}

test("while polymorphed the status shows the form's hit dice instead of Xp, and not after", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await polyself(g, "stone golem");
  expect(g.state.status.BL_TITLE?.text).toMatch(/Stone Golem/);
  expect(g.state.status.BL_HD?.text).toBe("14");
  expect(g.state.status.BL_XP).toBeUndefined();

  await polyself(g, "human");
  expect(g.state.status.BL_HD).toBeUndefined();
  expect(g.state.status.BL_XP?.text).toBeTruthy();
});

test("riding shows as a status condition", async () => {
  const g = await (await Session.start({ wizard: true, character: "role:Knight,race:human,gender:female,align:lawful" })).skipText();
  const { x, y } = g.hero;
  const dirs: Record<string, [number, number]> = { h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] };
  const toward = Object.entries(dirs).find(([, [dx, dy]]) => g.cell(x + dx, y + dy)?.ch === "u".charCodeAt(0))![0];
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "ride")!.index });
  await g.yn(toward);
  // debug mode offers to skip the chance of slipping
  while (g.prompt?.kind === "yn") await g.yn("y");
  expect(g.messages.join(" ")).toMatch(/mount/i);
  expect(g.state.status.BL_CONDITION?.text).toMatch(/RIDE/);
});

const changed = (g: Session) => Object.entries(g.state.status).filter(([, v]) => v.change).map(([k, v]) => [k, v.change]);

test("a stat that changes shows which way for three turns, but starting gear doesn't", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  expect(changed(g)).toEqual([]);

  await g.send("\x17");
  await g.getlin("uncursed +0 elven cloak");
  await g.send("W");
  await g.yn(g.state.inventory.find((i) => /pall|cloak/.test(i.text))!.accelerator);
  // a lower AC is better
  expect(changed(g)).toEqual([["BL_AC", { direction: -1, improved: true }]]);
  await g.send("s");
  await g.send("s");
  expect(changed(g)).toEqual([["BL_AC", { direction: -1, improved: true }]]);
  await g.send("s");
  expect(changed(g)).toEqual([]);

  await g.send("T");
  if (g.prompt?.kind === "yn") await g.yn(g.state.inventory.find((i) => /pall|cloak/.test(i.text))!.accelerator);
  expect(changed(g)).toEqual([["BL_AC", { direction: 1, improved: false }]]);
});

test("a stat going up is better", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("blessed potion of gain level");
  await g.send("q");
  await g.yn(g.state.inventory.find((i) => /potion/.test(i.text))!.accelerator);
  await g.skipText();
  expect(changed(g)).toContainEqual(["BL_XP", { direction: 1, improved: true }]);
});

test("a level gained shows as up even with a hilite rule on experience level", async () => {
  // with a rule, the core's change direction follows the percentage to the next level, which drops back to 0
  const g = await (await Session.start({ wizard: true, options: "showexp,statushilites:3,hilite_status:experience-level/<50%/red" })).skipText();
  await g.send("\x17");
  await g.getlin("blessed potion of gain level");
  await g.send("\x17");
  await g.getlin("blessed potion of gain level");
  for (const _ of [0, 1]) {
    await g.send("q");
    await g.yn(g.state.inventory.find((i) => /potion/.test(i.text))!.accelerator);
    await g.skipText();
    expect(changed(g)).toContainEqual(["BL_XP", { direction: 1, improved: true }]);
  }
});

async function wish(g: Session, item: string) {
  await g.send("\x17");
  await g.getlin(item);
  await g.skipText();
}

test("the conditions come most serious first, as the core ranks them", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await wish(g, "blindfold");
  await wish(g, "cursed amulet of strangulation");
  await g.send("P");
  await g.yn(g.state.inventory.find((i) => /blindfold/.test(i.text))!.accelerator);
  await g.send("P");
  await g.yn(g.state.inventory.find((i) => /amulet/.test(i.text))!.accelerator);
  expect(g.state.status.BL_CONDITION?.text).toBe("STRNGL BLIND");
});

test("encumbrance is graded from the text the core sends", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await wish(g, "loadstone");
  await wish(g, "loadstone");
  expect(encumbranceSeverity(g.state.status.BL_CAP!.text)).toBe("caution");
});
