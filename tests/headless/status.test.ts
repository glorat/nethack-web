import { expect, test } from "vitest";
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
