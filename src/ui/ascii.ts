import { drawBoxGlyph } from "./box";

// Cocoa's ASCII map colors, brighter than the text colors so blue, green and brown read on black
const ASCII_COLORS = [
  "#555555", "#ff0000", "#1aa61a", "#b3731a",
  "#4066ff", "#ff00ff", "#00ffff", "#b9c0c5",
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
 * A map square in ASCII mode. The default font keeps the terminal's 8:18 cell shape; a chosen font is as tall as
 * its lines, as Cocoa sizes it. Both scale with the map.
 */
export function asciiCell(cell: number, chosen: AsciiFont | null, scale: number): AsciiCell {
  const key = chosen ? `${chosen.family}/${chosen.size * scale}` : `/${cell}`;
  let found = cells.get(key);
  if (!found) {
    const font = chosen
      ? `${Math.round(chosen.size * scale)}px "${chosen.family}", monospace`
      : `${Math.round(cell * 0.72)}px ui-monospace, Menlo, Consolas, monospace`;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = font;
    // The terminal's map cell is 8x18 and its font is about 13px in an 18px row. Keep that cell shape (14x32 here)
    // and use the same font-to-row proportion, rather than scaling the cell with the font.
    const width = chosen
      ? Math.max(...Array.from({ length: 95 }, (_, i) => ctx.measureText(String.fromCharCode(32 + i)).width))
      : cell * 0.4375;
    found = { width: Math.max(1, Math.round(width)), height: cell, font };
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

/** The map background the terminal palette is composited over. */
export const MAP_BACKGROUND = "#000";

// NH_ALTPALETTE in include/color.h: the low 24 bits are an RGB value. NH_BASIC_COLOR's low bits are a
// palette index, so leave those to the ANSI palette rather than mistaking an index for a colour.
const ALT_PALETTE = 0x2000000;

// The four block elements the core's UTF-8 sets use, positioned with Ghostty's
// rounding: the width/height is rounded once, then snapped to the cell edge.
const BLOCKS: Record<number, { horizontal: "left" | "right"; vertical: "top" | "bottom"; width: number; height: number }> = {
  0x2581: { horizontal: "left", vertical: "bottom", width: 1, height: 1 / 8 },
  0x258f: { horizontal: "left", vertical: "top", width: 1 / 8, height: 1 },
  0x2594: { horizontal: "left", vertical: "top", width: 1, height: 1 / 8 },
  0x2595: { horizontal: "right", vertical: "top", width: 1 / 8, height: 1 },
};

function symbolColor(color: number, customColor?: number): string {
  if (customColor !== undefined && (customColor & ALT_PALETTE) !== 0)
    return `#${(customColor & 0xffffff).toString(16).padStart(6, "0")}`;
  return ASCII_COLORS[color] ?? ASCII_COLORS[8];
}

export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  cell: AsciiCell,
  symbol: string,
  color: number,
  left: number,
  top: number,
  customColor?: number,
) {
  const fill = symbolColor(color, customColor);
  const ch = symbol.codePointAt(0) ?? 0;

  // The ANSI/Unicode shades are a flat composite over the whole cell. At terminal size their dither has
  // averaged out; drawing the glyph's bitmap at map size made a loud checkerboard that the terminal doesn't show.
  if (ch === 0x2591 || ch === 0x2592 || ch === 0x2593) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.globalAlpha = ch === 0x2591 ? 0.25 : ch === 0x2592 ? 0.5 : 0.75;
    ctx.fillRect(left, top, cell.width, cell.height);
    ctx.restore();
    return;
  }

  if (drawBoxGlyph(ctx, symbol, left, top, cell.width, cell.height, fill, Math.max(1, cell.width / 8)))
    return;

  // One-eighth blocks used by Enhanced1/2 for swimming and explosions. Ghostty
  // rounds the block size first and then aligns it to the cell edge, so the
  // block meets the neighbouring cell without a subpixel gap.
  const block = BLOCKS[ch];
  if (block) {
    const width = Math.round(cell.width * block.width);
    const height = Math.round(cell.height * block.height);
    const x = block.horizontal === "right" ? cell.width - width : 0;
    const y = block.vertical === "bottom" ? cell.height - height : 0;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(left + x, top + y, width, height);
    ctx.restore();
    return;
  }

  // A terminal's floor dot is a 2-3px mark, not a text glyph scaled up with the map. Drawing the font's dot
  // made the rooms look like they were paved with bright squares.
  if (ch === 0x00b7) {
    const size = Math.max(2, Math.round(cell.width / 4));
    ctx.save();
    ctx.fillStyle = color === 7 && customColor === undefined ? "#73787e" : fill;
    ctx.fillRect(Math.round(left + (cell.width - size) / 2), Math.round(top + (cell.height - size) / 2), size, size);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, cell.width, cell.height);
  ctx.clip();
  ctx.font = cell.font;
  ctx.textAlign = "center";
  ctx.textBaseline = cell.ascent === undefined ? "middle" : "alphabetic";
  ctx.fillStyle = fill;
  ctx.fillText(symbol, left + cell.width / 2, top + (cell.ascent ?? cell.height / 2));
  ctx.restore();
}
