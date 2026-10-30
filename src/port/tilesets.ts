// The tile sets the game ships, by the file name the tile_file option names them by.

export interface TileSet {
  file: string;
  title: string;
  size: number;
}

export const TILE_SETS: TileSet[] = [
  { file: "tiles64.png", title: "Painted", size: 64 },
  { file: "tiles16.bmp", title: "Classic", size: 16 },
];

export const DEFAULT_TILE_SET = TILE_SETS[0];

/** The set tile_file names, by its file name or its path's last part; undefined if it isn't one of these. */
export function tileSetNamed(tileFile: string): TileSet | undefined {
  const name = tileFile.split(/[/\\]/).pop()!.toLowerCase();
  return TILE_SETS.find((set) => set.file === name);
}
