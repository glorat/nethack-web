// Cocoa's ASCII map colors, brighter than the text colors so blue, green and brown read on black
const ASCII_COLORS = [
  "#555555", "#ff0000", "#1aa61a", "#b3731a",
  "#4066ff", "#ff00ff", "#00ffff", "#bfbfbf",
  "#ffffff", "#ffaa00", "#00ff00", "#ffff00",
  "#00bfff", "#ff80ff", "#80ffff", "#ffffff",
];

export interface AsciiCell {
  width: number;
  height: number;
  font: string;
}

const cells = new Map<number, AsciiCell>();

/** A map square in ASCII mode: as tall as a tile, as wide as the font's widest symbol. */
export function asciiCell(cell: number): AsciiCell {
  let found = cells.get(cell);
  if (!found) {
    const font = `bold ${Math.round(cell * 0.75)}px ui-monospace, Menlo, Consolas, monospace`;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = font;
    let width = 0;
    for (let c = 32; c < 127; c++) width = Math.max(width, ctx.measureText(String.fromCharCode(c)).width);
    found = { width: Math.ceil(width), height: cell, font };
    cells.set(cell, found);
  }
  return found;
}

export function drawSymbol(ctx: CanvasRenderingContext2D, cell: AsciiCell, symbol: string, color: number, left: number, top: number) {
  ctx.font = cell.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ASCII_COLORS[color] ?? ASCII_COLORS[8];
  ctx.fillText(symbol, left + cell.width / 2, top + cell.height / 2);
}
