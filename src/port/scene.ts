// The landing page's picture: a room on the first level, drawn from the game's own tile sheet.

/** Each tile's place on a sheet in tile2bmp's order: the monsters, then the objects, then the rest. */
export const TILES = {
  wizard: 700,
  littleDog: 32,
  newt: 658,
  goldPiece: 789 + 440,
  potion: 789 + 299,
  verticalWall: 1272 + 1,
  horizontalWall: 1272 + 2,
  topLeftCorner: 1272 + 3,
  topRightCorner: 1272 + 4,
  bottomLeftCorner: 1272 + 5,
  bottomRightCorner: 1272 + 6,
  openDoor: 1272 + 13,
  floor: 1272 + 19,
  stairsDown: 1272 + 26,
} as const;

export type TileName = keyof typeof TILES;

/** The name each tile has in the core's win/share files, which the tests check the numbers against. */
export const TILE_NAMES: Record<TileName, string> = {
  wizard: "wizard,male",
  littleDog: "little dog,male",
  newt: "newt,male",
  goldPiece: "gold piece",
  potion: "ruby / gain ability",
  verticalWall: "main walls vertical",
  horizontalWall: "main walls horizontal",
  topLeftCorner: "main walls tlcorn",
  topRightCorner: "main walls trcorn",
  bottomLeftCorner: "main walls blcorn",
  bottomRightCorner: "main walls brcorn",
  openDoor: "vertical open door",
  floor: "floor of a room",
  stairsDown: "staircase down",
};

/** Tiles to a row: what lies on the floor, if anything, or the wall. */
const F = "floor";
export const ROOM: (TileName | [TileName, TileName])[][] = [
  ["topLeftCorner", ...Array<TileName>(8).fill("horizontalWall"), "topRightCorner"],
  ["verticalWall", F, F, [F, "goldPiece"], F, F, F, F, F, "verticalWall"],
  ["verticalWall", F, [F, "wizard"], [F, "littleDog"], F, F, F, F, F, "openDoor"],
  ["verticalWall", F, F, F, F, F, [F, "newt"], F, F, "verticalWall"],
  ["verticalWall", F, [F, "potion"], F, F, F, F, [F, "stairsDown"], F, "verticalWall"],
  ["bottomLeftCorner", ...Array<TileName>(8).fill("horizontalWall"), "bottomRightCorner"],
];

/** What a new player is told about the room: a column and row in it, and a note, above or below that square. */
export const ROOM_NOTES: { column: number; row: number; text: string; below?: boolean }[] = [
  { column: 2, row: 2, text: "You" },
  { column: 3, row: 2, text: "Your little dog", below: true },
  { column: 6, row: 3, text: "A newt. Walk into it to fight" },
  { column: 7, row: 4, text: "Stairs down: press >", below: true },
];

/** A sheet 40 tiles wide. */
export const SHEET_COLUMNS = 40;
