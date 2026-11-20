import { expect, test } from "vitest";
import { drawBoxGlyph } from "../../src/ui/box";

function recorder() {
  const paths: number[][] = [];
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    closePath: () => calls.push("close"),
    rect: () => calls.push("rect"),
    clip: () => calls.push("clip"),
    stroke: () => calls.push("stroke"),
    fillRect: (...args: number[]) => calls.push(`fillRect:${args.join(",")}`),
    moveTo: (x: number, y: number) => paths.push([x, y]),
    lineTo: (x: number, y: number) => paths.push([x, y]),
    bezierCurveTo: (...args: number[]) => paths.push(args),
    quadraticCurveTo: (...args: number[]) => paths.push(args),
    set lineWidth(_v: number) {},
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineCap(_v: CanvasLineCap) {},
    set lineJoin(_v: CanvasLineJoin) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, paths };
}

test("all 128 box drawing characters have Ghostty definitions", () => {
  for (let ch = 0x2500; ch <= 0x257f; ch++) {
    const { ctx, calls } = recorder();
    expect(drawBoxGlyph(ctx, String.fromCodePoint(ch), 0, 0, 14, 32, "#fff"), String.fromCodePoint(ch)).toBe(true);
    expect(calls.some((c) => c.startsWith("fillRect:") || c === "stroke"), String.fromCodePoint(ch)).toBe(true);
  }
});

test("solid box characters use filled cell rectangles, not xterm strokes", () => {
  const { ctx, calls } = recorder();
  drawBoxGlyph(ctx, "╔", 10, 20, 14, 32, "#fff");
  expect(calls.some((c) => c.startsWith("fillRect:"))).toBe(true);
  expect(calls).not.toContain("stroke");
});

test("double vertical lines are two filled bars with the Ghostty gap", () => {
  const { ctx, calls } = recorder();
  drawBoxGlyph(ctx, "║", 10, 20, 14, 32, "#fff", 2);
  expect(calls).toContain("fillRect:14,20,2,17");
  expect(calls).toContain("fillRect:18,20,2,17");
  expect(calls).toContain("fillRect:14,35,2,17");
  expect(calls).toContain("fillRect:18,35,2,17");
});

test("arcs and diagonals use Ghostty's stroked curves", () => {
  for (const char of ["╭", "╱", "╳"]) {
    const { ctx, paths } = recorder();
    expect(drawBoxGlyph(ctx, char, 10, 20, 14, 32, "#fff")).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  }
});
