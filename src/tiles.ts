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

export async function loadTileSheet(url: string, width: number, height = width): Promise<TileSheet> {
  return sheetOf(await loadImage(url), width, height);
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

/** A sheet whose image may be a canvas: what the map draws from. */
export type DrawableSheet = Omit<TileSheet, "image"> & { image: CanvasImageSource };

/**
 * The sheet redrawn once at the size of a map cell, when that shrinks it. Shrinking every tile
 * from the full painted sheet on each redraw kept some phones' GPUs busy for a third of a second
 * at a time.
 */
export function sheetForCell(sheet: TileSheet, width: number, height = width): DrawableSheet {
  if (width >= sheet.width && height >= sheet.height) return sheet;
  const rows = Math.ceil(sheet.image.naturalHeight / sheet.height);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.columns * width;
  canvas.height = rows * height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sheet;
  ctx.imageSmoothingQuality = "high";
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < sheet.columns; column++)
      ctx.drawImage(sheet.image, column * sheet.width, row * sheet.height, sheet.width, sheet.height, column * width, row * height, width, height);
  return { image: canvas, width, height, columns: sheet.columns };
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  sheet: DrawableSheet,
  tile: number,
  dx: number,
  dy: number,
  width: number,
  height = width,
): void {
  if (tile < 0) return;
  const sx = (tile % sheet.columns) * sheet.width;
  const sy = Math.floor(tile / sheet.columns) * sheet.height;
  ctx.drawImage(sheet.image, sx, sy, sheet.width, sheet.height, dx, dy, width, height);
}

/** How a tile fits a DOM box: keep its aspect, or fill the box. */
export type TileFit = "contain" | "fill";

/** The largest box of the sheet's aspect that fits in width by maxHeight; used for tile icons. */
export function tileBox(sheet: Pick<TileSheet, "width" | "height">, width: number, maxHeight: number): { width: number; height: number } {
  const height = Math.round((width * sheet.height) / sheet.width);
  if (height <= maxHeight) return { width, height };
  return { width: Math.max(1, Math.round((maxHeight * sheet.width) / sheet.height)), height: maxHeight };
}

/** CSS background for a tile shown in a DOM box of the given size. Small icons fill their box; larger portraits keep the tile's aspect. */
export function tileStyle(
  sheet: TileSheet,
  tile: number,
  width: number,
  height = width,
  fit: TileFit = width <= 32 && height <= 32 ? "fill" : "contain",
): Record<string, string> {
  if (tile < 0) return {};
  if (fit === "fill") {
    const scaleX = width / sheet.width;
    const scaleY = height / sheet.height;
    return {
      imageRendering: width > sheet.width || height > sheet.height ? "pixelated" : "auto",
      backgroundImage: `url(${sheet.image.src})`,
      backgroundSize: `${sheet.image.naturalWidth * scaleX}px ${sheet.image.naturalHeight * scaleY}px`,
      backgroundPosition: `-${(tile % sheet.columns) * width}px -${Math.floor(tile / sheet.columns) * height}px`,
    };
  }
  const scale = Math.min(width / sheet.width, height / sheet.height);
  const tileWidth = sheet.width * scale;
  const tileHeight = sheet.height * scale;
  const left = (width - tileWidth) / 2;
  const top = (height - tileHeight) / 2;
  return {
    // the classic tiles are small, and blur when drawn bigger
    imageRendering: scale > 1 ? "pixelated" : "auto",
    backgroundImage: `url(${sheet.image.src})`,
    backgroundSize: `${sheet.image.naturalWidth * scale}px ${sheet.image.naturalHeight * scale}px`,
    backgroundPosition: `${left - (tile % sheet.columns) * tileWidth}px ${top - Math.floor(tile / sheet.columns) * tileHeight}px`,
  };
}
