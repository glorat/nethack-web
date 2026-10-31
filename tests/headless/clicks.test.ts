import { expect, test } from "vitest";
import { COLNO, ROWNO } from "../../src/port/state";
import { Session } from "./harness";

const FLOOR = ".".charCodeAt(0);
const turn = (g: Session) => Number(g.state.status.BL_TIME?.text);

test("a click on the next square moves the hero there", async () => {
  const g = await (await Session.start({ options: "pettype:none" })).skipText();
  const { x, y } = g.hero;
  const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => g.cell(x + dx, y + dy)).find((c) => c?.ch === FLOOR)!;
  const before = turn(g);
  await g.click(next.x, next.y);
  expect(g.hero).toMatchObject({ x: next.x, y: next.y });
  expect(turn(g)).toBe(before + 1);
});

test("a click on unexplored ground far away does nothing", async () => {
  const g = await (await Session.start({ options: "pettype:none" })).skipText();
  const { x, y } = g.hero;
  const far = { x: x > COLNO / 2 ? 2 : COLNO - 3, y: y > ROWNO / 2 ? 1 : ROWNO - 2 };
  const unexplored = (globalThis as { nethackGlobal: { constants: { GLYPH: Record<string, number> } } }).nethackGlobal.constants.GLYPH.GLYPH_UNEXPLORED;
  expect(g.cell(far.x, far.y)?.glyph).toBe(unexplored);
  const before = turn(g);
  await g.click(far.x, far.y);
  expect(g.prompt).toBeNull();
  expect(g.hero).toMatchObject({ x, y });
  expect(turn(g)).toBe(before);
});

test("a secondary click describes the square, even unexplored ground far away", async () => {
  const g = await (await Session.start({ options: "pettype:none" })).skipText();
  const { x, y } = g.hero;
  const far = { x: x > COLNO / 2 ? 2 : COLNO - 3, y: y > ROWNO / 2 ? 1 : ROWNO - 2 };
  const before = turn(g);
  await g.click(far.x, far.y, 2);
  expect(g.messages.at(-1)).toMatch(/unexplored/);
  expect(turn(g)).toBe(before);
});

test("hovering over a nearby object learns nothing of it, where looking does", async () => {
  // seed 18 arrives on level 2 beside a scroll, which the hero sees up close only on moving
  const g = await (await Session.start({ seed: 18, wizard: true, options: "pettype:none" })).skipText();
  await g.send("\x16");
  await g.getlin("2");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  expect(g.describe(19, 3)).toMatch(/\(a scroll\)$/);
  expect(g.describe(19, 3)).toMatch(/\(a scroll\)$/);
  await g.click(19, 3, 2);
  expect(g.messages.at(-1)).toMatch(/scroll labeled/);
});

test("hovering over an object the hero hallucinates leaves the game's random numbers as they were", async () => {
  const g = await (await Session.start({ wizard: true, options: "pettype:none" })).skipText();
  await g.send("\x17");
  await g.getlin("potion of hallucination");
  const potion = g.state.inventory.find((i) => /potion/.test(i.text))!.accelerator;
  await g.send("q");
  await g.yn(potion);
  // debug mode shows what drinking it did
  for (let i = 0; i < 10 && g.prompt && g.prompt.kind !== "poskey"; i++)
    await (g.prompt.kind === "menu" ? g.answer({ kind: "menu", selection: [] }) : g.dismiss());
  const spot = { ...g.hero };
  await g.send("d");
  await g.yn("b");
  await g.send("l");
  if (g.hero.x === spot.x) await g.send("h");
  expect(g.hero.x).not.toBe(spot.x);

  // what a hallucinating hero sees there is never the dagger, so the core makes an object to describe
  const before = g.rng;
  for (let i = 0; i < 5; i++) expect(g.describe(spot.x, spot.y)).toBeTruthy();
  expect(g.rng).toBe(before);
});
