import { expect, test } from "vitest";
import { TILES_NEEDED } from "../../src/port/tilesets";
import { Session } from "./harness";

test("an imported sheet is checked for as many tiles as the core draws with", async () => {
  const g = await (await Session.start()).skipText();
  let most = -1;
  for (let glyph = 0; g.glyphTile(glyph) !== -1; glyph++) most = Math.max(most, g.glyphTile(glyph));
  expect(most + 1).toBe(TILES_NEEDED);
});
