/**
 * Box-drawing glyph geometry, U+2500-U+257F, ported from Ghostty's sprite face.
 *
 * Copyright (c) 2024 Mitchell Hashimoto, Ghostty contributors. MIT licensed;
 * see public/third-party-licenses.txt.
 *
 * Derived from ghostty src/font/sprite/draw/box.zig. Ghostty draws solid box
 * characters as filled cell-aligned rectangles rather than xterm's strokes, so
 * the light/heavy/double joins stay geometrically consistent at every cell size.
 */

type Style = "none" | "light" | "heavy" | "double";

interface Lines {
  up: Style;
  right: Style;
  down: Style;
  left: Style;
}

interface Metrics {
  width: number;
  height: number;
  /** The light-line thickness in pixels. Heavy lines are twice this. */
  thickness: number;
}

interface Painter {
  ctx: CanvasRenderingContext2D;
  left: number;
  top: number;
  color: string;
  metrics: Metrics;
}

/**
 * Per-edge styles in up/right/down/left order. `.` none, `l` light, `h` heavy,
 * `d` double. This is a direct table of Ghostty's linesChar calls.
 */
const LINES: Record<number, string> = {
  0x2500: '.l.l',
  0x2501: '.h.h',
  0x2502: 'l.l.',
  0x2503: 'h.h.',
  0x250c: '.ll.',
  0x250d: '.hl.',
  0x250e: '.lh.',
  0x250f: '.hh.',
  0x2510: '..ll',
  0x2511: '..lh',
  0x2512: '..hl',
  0x2513: '..hh',
  0x2514: 'll..',
  0x2515: 'lh..',
  0x2516: 'hl..',
  0x2517: 'hh..',
  0x2518: 'l..l',
  0x2519: 'l..h',
  0x251a: 'h..l',
  0x251b: 'h..h',
  0x251c: 'lll.',
  0x251d: 'lhl.',
  0x251e: 'hll.',
  0x251f: 'llh.',
  0x2520: 'hlh.',
  0x2521: 'hhl.',
  0x2522: 'lhh.',
  0x2523: 'hhh.',
  0x2524: 'l.ll',
  0x2525: 'l.lh',
  0x2526: 'h.ll',
  0x2527: 'l.hl',
  0x2528: 'h.hl',
  0x2529: 'h.lh',
  0x252a: 'l.hh',
  0x252b: 'h.hh',
  0x252c: '.lll',
  0x252d: '.llh',
  0x252e: '.hll',
  0x252f: '.hlh',
  0x2530: '.lhl',
  0x2531: '.lhh',
  0x2532: '.hhl',
  0x2533: '.hhh',
  0x2534: 'll.l',
  0x2535: 'll.h',
  0x2536: 'lh.l',
  0x2537: 'lh.h',
  0x2538: 'hl.l',
  0x2539: 'hl.h',
  0x253a: 'hh.l',
  0x253b: 'hh.h',
  0x253c: 'llll',
  0x253d: 'lllh',
  0x253e: 'lhll',
  0x253f: 'lhlh',
  0x2540: 'hlll',
  0x2541: 'llhl',
  0x2542: 'hlhl',
  0x2543: 'hllh',
  0x2544: 'hhll',
  0x2545: 'llhh',
  0x2546: 'lhhl',
  0x2547: 'hhlh',
  0x2548: 'lhhh',
  0x2549: 'hlhh',
  0x254a: 'hhhl',
  0x254b: 'hhhh',
  0x2550: '.d.d',
  0x2551: 'd.d.',
  0x2552: '.dl.',
  0x2553: '.ld.',
  0x2554: '.dd.',
  0x2555: '..ld',
  0x2556: '..dl',
  0x2557: '..dd',
  0x2558: 'ld..',
  0x2559: 'dl..',
  0x255a: 'dd..',
  0x255b: 'l..d',
  0x255c: 'd..l',
  0x255d: 'd..d',
  0x255e: 'ldl.',
  0x255f: 'dld.',
  0x2560: 'ddd.',
  0x2561: 'l.ld',
  0x2562: 'd.dl',
  0x2563: 'd.dd',
  0x2564: '.dld',
  0x2565: '.ldl',
  0x2566: '.ddd',
  0x2567: 'ld.d',
  0x2568: 'dl.l',
  0x2569: 'dd.d',
  0x256a: 'ldld',
  0x256b: 'dldl',
  0x256c: 'dddd',
  0x2574: '...l',
  0x2575: 'l...',
  0x2576: '.l..',
  0x2577: '..l.',
  0x2578: '...h',
  0x2579: 'h...',
  0x257a: '.h..',
  0x257b: '..h.',
  0x257c: '.h.l',
  0x257d: 'l.h.',
  0x257e: '.l.h',
  0x257f: 'h.l.',
};

function decodeLines(encoded: string): Lines {
  const style = (c: string): Style => (c === "l" ? "light" : c === "h" ? "heavy" : c === "d" ? "double" : "none");
  return {
    up: style(encoded[0]),
    right: style(encoded[1]),
    down: style(encoded[2]),
    left: style(encoded[3]),
  };
}

/** Fill a cell-relative rectangle; Ghostty's Canvas.box normalizes both corners. */
function fillBox(p: Painter, x0: number, y0: number, x1: number, y1: number): void {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  if (width <= 0 || height <= 0) return;
  p.ctx.fillRect(p.left + x, p.top + y, width, height);
}

function hline(p: Painter, x1: number, x2: number, y: number, thickness: number): void {
  fillBox(p, x1, y, x2, y + thickness);
}

function vline(p: Painter, y1: number, y2: number, x: number, thickness: number): void {
  fillBox(p, x, y1, x + thickness, y2);
}

function hlineMiddle(p: Painter, thickness: number): void {
  hline(p, 0, p.metrics.width, Math.trunc((p.metrics.height - thickness) / 2), thickness);
}

function vlineMiddle(p: Painter, thickness: number): void {
  vline(p, 0, p.metrics.height, Math.trunc((p.metrics.width - thickness) / 2), thickness);
}

/**
 * Draw a traditional intersection-style box character. Each edge stops at the
 * correct side of the crossing line, exactly as Ghostty's linesChar does.
 */
function linesChar(p: Painter, lines: Lines): void {
  const { width, height, thickness: lightPx } = p.metrics;
  const heavyPx = lightPx * 2;

  const hLightTop = Math.trunc((height - lightPx) / 2);
  const hLightBottom = hLightTop + lightPx;
  const hHeavyTop = Math.trunc((height - heavyPx) / 2);
  const hHeavyBottom = hHeavyTop + heavyPx;
  const hDoubleTop = Math.max(0, hLightTop - lightPx);
  const hDoubleBottom = hLightBottom + lightPx;

  const vLightLeft = Math.trunc((width - lightPx) / 2);
  const vLightRight = vLightLeft + lightPx;
  const vHeavyLeft = Math.trunc((width - heavyPx) / 2);
  const vHeavyRight = vHeavyLeft + heavyPx;
  const vDoubleLeft = Math.max(0, vLightLeft - lightPx);
  const vDoubleRight = vLightRight + lightPx;

  const upBottom =
    lines.left === "heavy" || lines.right === "heavy"
      ? hHeavyBottom
      : lines.left !== lines.right || lines.down === lines.up
        ? lines.left === "double" || lines.right === "double"
          ? hDoubleBottom
          : hLightBottom
        : lines.left === "none" && lines.right === "none"
          ? hLightBottom
          : hLightTop;

  const downTop =
    lines.left === "heavy" || lines.right === "heavy"
      ? hHeavyTop
      : lines.left !== lines.right || lines.up === lines.down
        ? lines.left === "double" || lines.right === "double"
          ? hDoubleTop
          : hLightTop
        : lines.left === "none" && lines.right === "none"
          ? hLightTop
          : hLightBottom;

  const leftRight =
    lines.up === "heavy" || lines.down === "heavy"
      ? vHeavyRight
      : lines.up !== lines.down || lines.left === lines.right
        ? lines.up === "double" || lines.down === "double"
          ? vDoubleRight
          : vLightRight
        : lines.up === "none" && lines.down === "none"
          ? vLightRight
          : vLightLeft;

  const rightLeft =
    lines.up === "heavy" || lines.down === "heavy"
      ? vHeavyLeft
      : lines.up !== lines.down || lines.right === lines.left
        ? lines.up === "double" || lines.down === "double"
          ? vDoubleLeft
          : vLightLeft
        : lines.up === "none" && lines.down === "none"
          ? vLightLeft
          : vLightRight;

  switch (lines.up) {
    case "none":
      break;
    case "light":
      fillBox(p, vLightLeft, 0, vLightRight, upBottom);
      break;
    case "heavy":
      fillBox(p, vHeavyLeft, 0, vHeavyRight, upBottom);
      break;
    case "double": {
      const leftBottom = lines.left === "double" ? hLightTop : upBottom;
      const rightBottom = lines.right === "double" ? hLightTop : upBottom;
      fillBox(p, vDoubleLeft, 0, vLightLeft, leftBottom);
      fillBox(p, vLightRight, 0, vDoubleRight, rightBottom);
      break;
    }
  }

  switch (lines.right) {
    case "none":
      break;
    case "light":
      fillBox(p, rightLeft, hLightTop, width, hLightBottom);
      break;
    case "heavy":
      fillBox(p, rightLeft, hHeavyTop, width, hHeavyBottom);
      break;
    case "double": {
      const topLeft = lines.up === "double" ? vLightRight : rightLeft;
      const bottomLeft = lines.down === "double" ? vLightRight : rightLeft;
      fillBox(p, topLeft, hDoubleTop, width, hLightTop);
      fillBox(p, bottomLeft, hLightBottom, width, hDoubleBottom);
      break;
    }
  }

  switch (lines.down) {
    case "none":
      break;
    case "light":
      fillBox(p, vLightLeft, downTop, vLightRight, height);
      break;
    case "heavy":
      fillBox(p, vHeavyLeft, downTop, vHeavyRight, height);
      break;
    case "double": {
      const leftTop = lines.left === "double" ? hLightBottom : downTop;
      const rightTop = lines.right === "double" ? hLightBottom : downTop;
      fillBox(p, vDoubleLeft, leftTop, vLightLeft, height);
      fillBox(p, vLightRight, rightTop, vDoubleRight, height);
      break;
    }
  }

  switch (lines.left) {
    case "none":
      break;
    case "light":
      fillBox(p, 0, hLightTop, leftRight, hLightBottom);
      break;
    case "heavy":
      fillBox(p, 0, hHeavyTop, leftRight, hHeavyBottom);
      break;
    case "double": {
      const topRight = lines.up === "double" ? vLightLeft : leftRight;
      const bottomRight = lines.down === "double" ? vLightLeft : leftRight;
      fillBox(p, 0, hDoubleTop, topRight, hLightTop);
      fillBox(p, 0, hLightBottom, bottomRight, hDoubleBottom);
      break;
    }
  }
}

/** Ghostty's dashHorizontal. */
function dashHorizontal(p: Painter, count: number, thickness: number): void {
  const { width, height } = p.metrics;
  if (width < count * 2) {
    hlineMiddle(p, p.metrics.thickness);
    return;
  }
  const desiredGap = Math.max(4, p.metrics.thickness);
  const gap = Math.min(desiredGap, Math.trunc(width / (2 * count)));
  const totalGap = count * gap;
  const totalDash = width - totalGap;
  const dash = Math.trunc(totalDash / count);
  let extra = totalDash % count;
  let x = Math.trunc(gap / 2);
  const y = Math.trunc((height - thickness) / 2);
  for (let i = 0; i < count; i++) {
    let x1 = x + dash;
    if (extra > 0) {
      extra--;
      x1++;
    }
    hline(p, x, x1, y, thickness);
    x = x1 + gap;
  }
}

/** Ghostty's dashVertical. */
function dashVertical(p: Painter, count: number, thickness: number): void {
  const { width, height } = p.metrics;
  if (height < count * 2) {
    vlineMiddle(p, p.metrics.thickness);
    return;
  }
  const desiredGap = Math.max(4, p.metrics.thickness);
  const gap = Math.min(desiredGap, Math.trunc(height / (2 * count)));
  const totalGap = count * gap;
  const totalDash = height - totalGap;
  const dash = Math.trunc(totalDash / count);
  let extra = totalDash % count;
  let y = 0;
  const x = Math.trunc((width - thickness) / 2);
  for (let i = 0; i < count; i++) {
    let y1 = y + dash;
    if (extra > 0) {
      extra--;
      y1++;
    }
    vline(p, y, y1, x, thickness);
    y = y1 + gap;
  }
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left + x0, top + y0);
  ctx.lineTo(left + x1, top + y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = "butt";
  ctx.stroke();
  ctx.restore();
}

function diagonal(p: Painter, downRight: boolean): void {
  const { width, height, thickness } = p.metrics;
  const slopeX = Math.min(1, width / height);
  const slopeY = Math.min(1, height / width);
  if (downRight) {
    strokeLine(
      p.ctx,
      p.left,
      p.top,
      -0.5 * slopeX,
      -0.5 * slopeY,
      width + 0.5 * slopeX,
      height + 0.5 * slopeY,
      thickness,
      p.color,
    );
  } else {
    strokeLine(
      p.ctx,
      p.left,
      p.top,
      width + 0.5 * slopeX,
      -0.5 * slopeY,
      -0.5 * slopeX,
      height + 0.5 * slopeY,
      thickness,
      p.color,
    );
  }
}

function arc(p: Painter, corner: "tl" | "tr" | "bl" | "br"): void {
  const { width, height, thickness } = p.metrics;
  const centerX = Math.trunc((width - thickness) / 2) + thickness / 2;
  const centerY = Math.trunc((height - thickness) / 2) + thickness / 2;
  const r = Math.min(width, height) / 2;
  const s = 0.25;

  p.ctx.save();
  p.ctx.beginPath();
  if (corner === "tl") {
    p.ctx.moveTo(p.left + centerX, p.top);
    p.ctx.lineTo(p.left + centerX, p.top + centerY - r);
    p.ctx.bezierCurveTo(
      p.left + centerX,
      p.top + centerY - s * r,
      p.left + centerX - s * r,
      p.top + centerY,
      p.left + centerX - r,
      p.top + centerY,
    );
    p.ctx.lineTo(p.left, p.top + centerY);
  } else if (corner === "tr") {
    p.ctx.moveTo(p.left + centerX, p.top);
    p.ctx.lineTo(p.left + centerX, p.top + centerY - r);
    p.ctx.bezierCurveTo(
      p.left + centerX,
      p.top + centerY - s * r,
      p.left + centerX + s * r,
      p.top + centerY,
      p.left + centerX + r,
      p.top + centerY,
    );
    p.ctx.lineTo(p.left + width, p.top + centerY);
  } else if (corner === "bl") {
    p.ctx.moveTo(p.left + centerX, p.top + height);
    p.ctx.lineTo(p.left + centerX, p.top + centerY + r);
    p.ctx.bezierCurveTo(
      p.left + centerX,
      p.top + centerY + s * r,
      p.left + centerX - s * r,
      p.top + centerY,
      p.left + centerX - r,
      p.top + centerY,
    );
    p.ctx.lineTo(p.left, p.top + centerY);
  } else {
    p.ctx.moveTo(p.left + centerX, p.top + height);
    p.ctx.lineTo(p.left + centerX, p.top + centerY + r);
    p.ctx.bezierCurveTo(
      p.left + centerX,
      p.top + centerY + s * r,
      p.left + centerX + s * r,
      p.top + centerY,
      p.left + centerX + r,
      p.top + centerY,
    );
    p.ctx.lineTo(p.left + width, p.top + centerY);
  }
  p.ctx.strokeStyle = p.color;
  p.ctx.lineWidth = thickness;
  p.ctx.lineCap = "butt";
  p.ctx.stroke();
  p.ctx.restore();
}

/**
 * Draw a U+2500-U+257F box glyph. Returns false for a codepoint Ghostty does
 * not sprite-render.
 */
export function drawBoxGlyph(
  ctx: CanvasRenderingContext2D,
  symbol: string,
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  thickness = width / 8,
): boolean {
  const ch = symbol.codePointAt(0) ?? 0;
  if (ch < 0x2500 || ch > 0x257f) return false;

  const metrics: Metrics = {
    width: Math.round(width),
    height: Math.round(height),
    thickness: Math.max(1, Math.round(thickness)),
  };
  const painter: Painter = { ctx, left, top, color, metrics };
  ctx.save();
  ctx.fillStyle = color;

  const encoded = LINES[ch];
  if (encoded) {
    linesChar(painter, decodeLines(encoded));
    ctx.restore();
    return true;
  }

  switch (ch) {
    case 0x2504:
      dashHorizontal(painter, 3, metrics.thickness);
      break;
    case 0x2505:
      dashHorizontal(painter, 3, metrics.thickness * 2);
      break;
    case 0x2506:
      dashVertical(painter, 3, metrics.thickness);
      break;
    case 0x2507:
      dashVertical(painter, 3, metrics.thickness * 2);
      break;
    case 0x2508:
      dashHorizontal(painter, 4, metrics.thickness);
      break;
    case 0x2509:
      dashHorizontal(painter, 4, metrics.thickness * 2);
      break;
    case 0x250a:
      dashVertical(painter, 4, metrics.thickness);
      break;
    case 0x250b:
      dashVertical(painter, 4, metrics.thickness * 2);
      break;
    case 0x254c:
      dashHorizontal(painter, 2, metrics.thickness);
      break;
    case 0x254d:
      dashHorizontal(painter, 2, metrics.thickness * 2);
      break;
    case 0x254e:
      dashVertical(painter, 2, metrics.thickness);
      break;
    case 0x254f:
      dashVertical(painter, 2, metrics.thickness * 2);
      break;
    case 0x256d:
      arc(painter, "br");
      break;
    case 0x256e:
      arc(painter, "bl");
      break;
    case 0x256f:
      arc(painter, "tl");
      break;
    case 0x2570:
      arc(painter, "tr");
      break;
    case 0x2571:
      diagonal(painter, false);
      break;
    case 0x2572:
      diagonal(painter, true);
      break;
    case 0x2573:
      diagonal(painter, true);
      diagonal(painter, false);
      break;
    default:
      ctx.restore();
      return false;
  }

  ctx.restore();
  return true;
}
