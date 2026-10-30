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
  /** For a chosen font, where its baseline sits in the cell; the default font is centred. */
  ascent?: number;
}

/** A font the player chose for the ASCII map, at its size when the map isn't zoomed. */
export interface AsciiFont {
  family: string;
  size: number;
}

const cells = new Map<string, AsciiCell>();

/**
 * A map square in ASCII mode. In the default font it's as tall as a tile; in a chosen font, as tall as the font's
 * lines, as Cocoa sizes it. Either way it's as wide as the font's widest symbol, and zoom scales it.
 */
export function asciiCell(cell: number, chosen: AsciiFont | null, scale: number): AsciiCell {
  const key = chosen ? `${chosen.family}/${chosen.size * scale}` : `/${cell}`;
  let found = cells.get(key);
  if (!found) {
    const font = chosen
      ? `${Math.round(chosen.size * scale)}px "${chosen.family}", monospace`
      : `bold ${Math.round(cell * 0.75)}px ui-monospace, Menlo, Consolas, monospace`;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = font;
    let width = 0;
    for (let c = 32; c < 127; c++) width = Math.max(width, ctx.measureText(String.fromCharCode(c)).width);
    found = { width: Math.ceil(width), height: cell, font };
    if (chosen) {
      const px = Math.round(chosen.size * scale);
      const m = ctx.measureText("M");
      // older Firefox has no font box
      const ascent = m.fontBoundingBoxAscent ?? px * 0.95;
      const descent = m.fontBoundingBoxDescent ?? px * 0.25;
      found = { ...found, height: Math.ceil(ascent + descent), ascent };
    }
    cells.set(key, found);
  }
  return found;
}

export function drawSymbol(ctx: CanvasRenderingContext2D, cell: AsciiCell, symbol: string, color: number, left: number, top: number) {
  ctx.font = cell.font;
  ctx.textAlign = "center";
  ctx.textBaseline = cell.ascent === undefined ? "middle" : "alphabetic";
  ctx.fillStyle = ASCII_COLORS[color] ?? ASCII_COLORS[8];
  ctx.fillText(symbol, left + cell.width / 2, top + (cell.ascent ?? cell.height / 2));
}
