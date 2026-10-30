// The tile sheet: tile2bmp order, TILES_PER_ROW to a row; gm.tileidx indexes it.

export const TILES_PER_ROW = 40;

export interface TileSheet {
  image: HTMLImageElement;
  size: number;
}

export function loadTileSheet(url: string, size: number): Promise<TileSheet> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, size });
    image.onerror = () => reject(new Error(`could not load tiles from ${url}`));
    image.src = url;
  });
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  sheet: TileSheet,
  tile: number,
  dx: number,
  dy: number,
  cell: number,
): void {
  if (tile < 0) return;
  const sx = (tile % TILES_PER_ROW) * sheet.size;
  const sy = Math.floor(tile / TILES_PER_ROW) * sheet.size;
  ctx.drawImage(sheet.image, sx, sy, sheet.size, sheet.size, dx, dy, cell, cell);
}

/** CSS background for a tile shown in a DOM element of the given size. */
export function tileStyle(sheet: TileSheet, tile: number, cell: number): Record<string, string> {
  if (tile < 0) return {};
  const scale = cell / sheet.size;
  const cols = sheet.image.naturalWidth / sheet.size;
  const rows = sheet.image.naturalHeight / sheet.size;
  return {
    // the classic tiles are small, and blur when drawn bigger
    imageRendering: cell > sheet.size ? "pixelated" : "auto",
    backgroundImage: `url(${sheet.image.src})`,
    backgroundSize: `${cols * cell}px ${rows * cell}px`,
    backgroundPosition: `-${(tile % TILES_PER_ROW) * sheet.size * scale}px -${Math.floor(tile / TILES_PER_ROW) * sheet.size * scale}px`,
  };
}
