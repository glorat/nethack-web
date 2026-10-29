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
