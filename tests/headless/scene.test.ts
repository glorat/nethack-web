import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ROOM, TILE_NAMES, TILES, type TileName } from "../../src/port/scene";

/** Every tile's name in tile2bmp's order, as the sheets are drawn. */
function sheetOrder(): string[] {
  return ["monsters", "objects", "other"].flatMap((file) =>
    [...readFileSync(new URL(`../../nethack/win/share/${file}.txt`, import.meta.url), "utf8").matchAll(/^# tile \d+ \((.*)\)$/gm)].map((m) => m[1]),
  );
}

test("each of the room's tiles is the one its name says, on the game's sheets", () => {
  const order = sheetOrder();
  for (const [name, index] of Object.entries(TILES)) expect([name, order[index]]).toEqual([name, TILE_NAMES[name as TileName]]);
});

test("the room is a closed rectangle", () => {
  expect(new Set(ROOM.map((row) => row.length))).toEqual(new Set([10]));
});
