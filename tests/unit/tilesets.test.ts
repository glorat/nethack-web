import { expect, test } from "vitest";
import { tileSetNamed } from "../../src/port/tilesets";

test("tile_file names a set by its file, with or without a path", () => {
  expect(tileSetNamed("tiles16.bmp")?.title).toBe("Classic");
  expect(tileSetNamed("~/nethack/Tiles64.PNG")?.title).toBe("Painted");
  expect(tileSetNamed("mytiles.png")).toBeUndefined();
});
