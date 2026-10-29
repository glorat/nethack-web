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
