import { expect, test } from "vitest";
import { TILES_NEEDED, tileSetNamed, tileSheetProblem, tileSizeOfSheet } from "../../src/port/tilesets";

test("tile_file names a set by its file, with or without a path", () => {
  expect(tileSetNamed("tiles16.bmp")?.title).toBe("Classic");
  expect(tileSetNamed("~/nethack/Tiles64.PNG")?.title).toBe("Painted");
  expect(tileSetNamed("mytiles.png")).toBeUndefined();
});

test("tile_file names an imported set by its file, but a shipped one wins", () => {
  expect(tileSetNamed("~/x/Mine32.png", ["mine32.png"])).toEqual({ file: "mine32.png", title: "mine32.png", size: 0, imported: true });
  expect(tileSetNamed("tiles16.bmp", ["tiles16.bmp"])?.imported).toBeUndefined();
});

test("a sheet's tile size comes from its name, or else 40 tiles to a row", () => {
  expect(tileSizeOfSheet("DawnHack.png", 1280)).toEqual({ width: 32, height: 32 });
  expect(tileSizeOfSheet("tiles24.png", 960)).toEqual({ width: 24, height: 24 });
  expect(tileSizeOfSheet("Nethack Modern 24.bmp", 960)).toEqual({ width: 24, height: 24 });
  expect(tileSizeOfSheet("/a/b/tiles10x20.bmp", 400)).toEqual({ width: 10, height: 20 });
  // a version number isn't a size, nor is a number that disagrees with a sheet 40 tiles wide
  expect(tileSizeOfSheet("DawnHack 3.6.png", 1280)).toEqual({ width: 32, height: 32 });
  expect(tileSizeOfSheet("tiles64 copy 2.png", 2560)).toEqual({ width: 64, height: 64 });
  expect(tileSizeOfSheet("sheet7.png", 1280)).toEqual({ width: 32, height: 32 });
  // a sheet that isn't 40 wide trusts its name
  expect(tileSizeOfSheet("tiles32.png", 1312)).toEqual({ width: 32, height: 32 });
  expect(tileSizeOfSheet("sheet.png", 1001)).toBeNull();
});

test("a sheet that can't be read, has no size, or has too few tiles says why", () => {
  expect(tileSheetProblem(0, 0, null)).toMatch(/isn't an image/);
  expect(tileSheetProblem(1000, 1000, null)).toMatch(/tiles32\.png/);
  expect(tileSheetProblem(640, 640, { width: 16, height: 16 })).toBe(
    `It has 1600 tiles of 16x16 pixels, but this version of NetHack needs ${TILES_NEEDED}. It was probably made for an older version.`,
  );
  expect(tileSheetProblem(640, 937, { width: 16, height: 16 })).toBeNull();
});
