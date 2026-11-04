// The tile sheet: tile2bmp order, a row as wide as the sheet; gm.tileidx indexes it.

import { tileSheetProblem, tileSizeOfSheet } from "./port/tilesets";

export interface TileSheet {
  image: HTMLImageElement;
  width: number;
  height: number;
  /** Tiles to a row. */
  columns: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load tiles from ${url}`));
    image.src = url;
  });
}

function sheetOf(image: HTMLImageElement, width: number, height: number): TileSheet {
  return { image, width, height, columns: Math.floor(image.naturalWidth / width) };
}

export async function loadTileSheet(url: string, size: number): Promise<TileSheet> {
  return sheetOf(await loadImage(url), size, size);
}

/** A sheet from a file the player chose; it rejects with why it can't be used. */
export async function loadImportedSheet(name: string, file: Blob): Promise<TileSheet> {
  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | null = null;
  try {
    image = await loadImage(url);
  } catch {}
  const width = image?.naturalWidth ?? 0;
  const size = tileSizeOfSheet(name, width);
  const problem = tileSheetProblem(width, image?.naturalHeight ?? 0, size);
  if (problem || !image || !size) {
    URL.revokeObjectURL(url);
    throw new Error(problem ?? "It isn't an image that can be read.");
  }
  return sheetOf(image, size.width, size.height);
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
  const sx = (tile % sheet.columns) * sheet.width;
  const sy = Math.floor(tile / sheet.columns) * sheet.height;
  ctx.drawImage(sheet.image, sx, sy, sheet.width, sheet.height, dx, dy, cell, cell);
}

/** CSS background for a tile shown in a DOM element of the given size. */
export function tileStyle(sheet: TileSheet, tile: number, cell: number): Record<string, string> {
  if (tile < 0) return {};
  const scaleX = cell / sheet.width;
  const scaleY = cell / sheet.height;
  return {
    // the classic tiles are small, and blur when drawn bigger
    imageRendering: cell > Math.max(sheet.width, sheet.height) ? "pixelated" : "auto",
    backgroundImage: `url(${sheet.image.src})`,
    backgroundSize: `${sheet.image.naturalWidth * scaleX}px ${sheet.image.naturalHeight * scaleY}px`,
    backgroundPosition: `-${(tile % sheet.columns) * cell}px -${Math.floor(tile / sheet.columns) * cell}px`,
  };
}
