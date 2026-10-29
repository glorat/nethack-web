import { expect, test } from "vitest";
import { Session } from "./harness";

const CORRIDOR = "#".charCodeAt(0);

test("a redraw at a direction prompt keeps the corridor under the hero", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x06");
  const corridor = g.state.map.find((c) => c?.ch === CORRIDOR)!;
  await g.teleport(corridor.x, corridor.y);
  expect(g.hero.bgTile).toBe(corridor.tile);

  await g.send("\x04");
  // ^R here goes through redraw_map(), which leaves the background's tile index unset
  await g.yn("\x12");
  expect(g.hero.bgTile).toBe(corridor.tile);
});

test("a zapped beam is drawn over the floor it crosses", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("wand of sleep");
  await g.send("z");
  await g.yn(g.state.inventory.find((i) => /wand/.test(i.text))!.accelerator);
  const from = g.drawn.length;
  await g.yn("l");

  const glyphs = (globalThis as { nethackGlobal: { constants: { GLYPH: Record<string, number> } } }).nethackGlobal.constants.GLYPH;
  const beam = g.drawn.slice(from).filter((c) => c.glyph >= glyphs.GLYPH_ZAP_OFF && c.glyph < glyphs.GLYPH_SWALLOW_OFF);
  expect(beam.length).toBeGreaterThan(0);
  expect(beam.every((c) => c.bgTile >= 0)).toBe(true);
});
