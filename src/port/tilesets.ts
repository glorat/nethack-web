// The tile sets the game ships, by the file name the tile_file option names them by, and the checks an imported one
// must pass.

export interface TileSet {
  file: string;
  title: string;
  /** 0 for an imported set, whose size is worked out from its image. */
  size: number;
  /** One the player imported, kept in the browser. */
  imported?: boolean;
}

export const TILES_PER_ROW = 40;

/** The tiles this version of the core indexes, as tilemap.c's total_tiles_used counts them. */
export const TILES_NEEDED = 2303;

export const TILE_SETS: TileSet[] = [
  { file: "tiles64.png", title: "Painted", size: 64 },
  { file: "tiles16.bmp", title: "Classic", size: 16 },
];

export const DEFAULT_TILE_SET = TILE_SETS[0];

/** A path's last part, which is all a tile set is known by. */
export function tileSetFileName(path: string): string {
  return path.split(/[/\\]/).pop()!;
}

/** The set tile_file names, by its file name or its path's last part; undefined if it isn't one of these. */
export function tileSetNamed(tileFile: string, imported: string[] = []): TileSet | undefined {
  const name = tileSetFileName(tileFile).toLowerCase();
  const shipped = TILE_SETS.find((set) => set.file === name);
  if (shipped) return shipped;
  const mine = imported.find((file) => file.toLowerCase() === name);
  return mine === undefined ? undefined : importedTileSet(mine);
}

export function importedTileSet(file: string): TileSet {
  return { file, title: file, size: 0, imported: true };
}

export interface TileSize {
  width: number;
  height: number;
}

/** A sheet's tile size, from a size ending its name or else 40 tiles to a row; null if neither fits. */
export function tileSizeOfSheet(fileName: string, pixelWidth: number): TileSize | null {
  // the number must end the name, so "DawnHack 3.6.png" isn't read as 6px tiles
  const match = /(?:^|[^0-9.])([0-9]+)(?:x([0-9]+))?\.[a-z]+$/i.exec(tileSetFileName(fileName));
  const rowWidth = pixelWidth >= TILES_PER_ROW && pixelWidth % TILES_PER_ROW === 0 ? pixelWidth / TILES_PER_ROW : 0;
  if (match) {
    const width = Number(match[1]);
    const height = match[2] === undefined ? width : Number(match[2]);
    // a sheet 40 tiles wide only trusts a name that agrees, so "tiles64 copy 2.png" isn't read as 2px tiles
    if (width > 0 && height > 0 && pixelWidth % width === 0 && (rowWidth === 0 || width === rowWidth)) return { width, height };
  }
  return rowWidth ? { width: rowWidth, height: rowWidth } : null;
}

/** Why a sheet can't be used, in the player's words; null if it can. */
export function tileSheetProblem(pixelWidth: number, pixelHeight: number, size: TileSize | null): string | null {
  if (pixelWidth <= 0 || pixelHeight <= 0) return "It isn't an image that can be read.";
  if (!size) return "The tile size couldn't be worked out. Put it at the end of the file name, e.g. tiles32.png or tiles10x20.png.";
  const tiles = Math.floor(pixelWidth / size.width) * Math.floor(pixelHeight / size.height);
  if (tiles < TILES_NEEDED)
    return `It has ${tiles} tiles of ${size.width}x${size.height} pixels, but this version of NetHack needs ${TILES_NEEDED}. It was probably made for an older version.`;
  return null;
}
