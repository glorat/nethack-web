import { expect, test } from "vitest";
import { drawSymbol, type AsciiCell } from "../../src/ui/ascii";
import { symbolText } from "../../src/port/symbols";

const cell: AsciiCell = { width: 14, height: 32, font: "24px Menlo" };

function recorder() {
  const calls: string[] = [];
  let fillStyle = "";
  let lineWidth = 0;
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    closePath: () => calls.push("close"),
    rect: (...args: number[]) => calls.push(`rect:${args.join(",")}`),
    clip: () => calls.push("clip"),
    moveTo: () => calls.push("move"),
    lineTo: () => calls.push("line"),
    bezierCurveTo: () => calls.push("curve"),
    quadraticCurveTo: () => calls.push("curve"),
    stroke: () => calls.push(`stroke:${lineWidth}`),
    fillRect: (...args: number[]) => calls.push(`fillRect:${args.join(",")}`),
    fillText: (text: string) => calls.push(`text:${text}`),
    set font(_v: string) {},
    set fillStyle(v: string) { fillStyle = v; },
    set strokeStyle(v: string) { fillStyle = v; },
    set globalAlpha(_v: number) {},
    set textAlign(_v: CanvasTextAlign) {},
    set textBaseline(_v: CanvasTextBaseline) {},
    set lineWidth(v: number) { lineWidth = v; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, style: () => fillStyle };
}

test("box drawing uses filled cell geometry and never a glyph", () => {
  const { ctx, calls } = recorder();
  drawSymbol(ctx, cell, "║", 7, 0, 0);
  expect(calls.some((c) => c.startsWith("fillRect:"))).toBe(true);
  expect(calls.some((c) => c.startsWith("text:"))).toBe(false);
});

test("ANSI shades fill the cell without a glyph bitmap", () => {
  const { ctx, calls } = recorder();
  drawSymbol(ctx, cell, "░", 7, 0, 0);
  expect(calls).toContain("fillRect:0,0,14,32");
  expect(calls.some((c) => c.startsWith("text:"))).toBe(false);
});

test("one-eighth blocks are cell-snapped, not font glyphs", () => {
  for (const [char, rect] of [["\u2581", "fillRect:0,28,14,4"], ["\u258f", "fillRect:0,0,2,32"], ["\u2594", "fillRect:0,0,14,4"], ["\u2595", "fillRect:12,0,2,32"]] as const) {
    const { ctx, calls } = recorder();
    drawSymbol(ctx, cell, char, 7, 0, 0);
    expect(calls).toContain(rect);
    expect(calls.some((c) => c.startsWith("text:"))).toBe(false);
  }
});

test("custom 24-bit colours override the ANSI palette", () => {
  const { ctx, style } = recorder();
  drawSymbol(ctx, cell, "░", 7, 0, 0, 0x2000000 | 0x123456);
  expect(style()).toBe("#123456");
});

test("the floor dot is a small mark, not a scaled text glyph", () => {
  const { ctx, calls } = recorder();
  drawSymbol(ctx, cell, "·", 7, 0, 0);
  expect(calls).toContain("fillRect:5,14,4,4");
  expect(calls.some((c) => c.startsWith("text:"))).toBe(false);
});

test("ordinary characters still use the chosen text font", () => {
  const { ctx, calls } = recorder();
  drawSymbol(ctx, cell, "@", 7, 0, 0);
  expect(calls).toContain("text:@");
});
// Every active Unicode symbol in Enhanced1/2 (dat/symbols). Plus every byte of the IBM/ASCII and DEC
// mappings below, this covers every symbol a symset can put on the map.
const UTF8_SYMBOLS = [
  0x00a4, 0x00b7, 0x03a8, 0x03a9, 0x03be, 0x2020, 0x2248, 0x224b, 0x2261, 0x2264, 0x2265,
  0x2299, 0x2320, 0x2500, 0x2502, 0x250c, 0x2510, 0x2514, 0x2518, 0x251c, 0x2524, 0x252c,
  0x2534, 0x253c, 0x2550, 0x2551, 0x2554, 0x2557, 0x255a, 0x255d, 0x2560, 0x2563, 0x2566,
  0x2569, 0x256c, 0x2581, 0x258f, 0x2591, 0x2592, 0x2594, 0x2595, 0x2601, 0x2660, 0x2980,
];

test("every symbol of every 8-bit and UTF-8 symset has a renderer branch", () => {
  const symbols = new Set<string>();
  for (const dec of [false, true]) for (let c = 0; c < 256; c++) symbols.add(symbolText(c, dec));
  for (const c of UTF8_SYMBOLS) symbols.add(symbolText(c, false, true));
  for (const symbol of symbols) {
    const ch = symbol.codePointAt(0) ?? 0;
    const { ctx, calls } = recorder();
    drawSymbol(ctx, cell, symbol, 7, 0, 0);
    if (ch >= 0x2500 && ch <= 0x257f) {
      expect(calls.some((c) => c.startsWith("fillRect:") || c.startsWith("stroke:")), `box ${ch.toString(16)}`).toBe(true);
    } else if (ch === 0x2591 || ch === 0x2592 || ch === 0x2593 || ch === 0x00b7 || [0x2581, 0x258f, 0x2594, 0x2595].includes(ch)) {
      expect(calls.some((c) => c.startsWith("fillRect:")), `symbol ${ch.toString(16)}`).toBe(true);
    } else {
      expect(calls.some((c) => c.startsWith("text:")), `text ${ch.toString(16)}`).toBe(true);
    }
  }
});

