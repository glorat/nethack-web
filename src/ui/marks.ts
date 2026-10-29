import { MARK_DETECTED, MARK_PEACEFUL, MARK_PET, MARK_PILE, MARK_RIDDEN } from "../port/marks";

function badge(ctx: CanvasRenderingContext2D, path: Path2D, fill: string) {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.lineWidth = 1;
  ctx.stroke(path);
}

/** Cocoa's map marks, drawn over the square at (left, top). */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: number, left: number, top: number, cell: number, petMark: HTMLImageElement | null) {
  if (marks & MARK_PET && petMark) ctx.drawImage(petMark, left, top, cell, cell);
  if (!(marks & ~MARK_PET)) return;
  const size = Math.max(5, Math.round(cell * 0.2));
  const inset = Math.max(1, Math.round(size * 0.3));
  const right = left + cell;
  const bottom = top + cell;

  if (marks & MARK_DETECTED) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(left, top, cell, cell);
    ctx.save();
    ctx.setLineDash([size * 0.6, size * 0.4]);
    ctx.lineWidth = Math.max(1, Math.round(size * 0.15));
    ctx.strokeStyle = "rgba(102, 217, 255, 0.9)";
    ctx.strokeRect(left + 1.5, top + 1.5, cell - 3, cell - 3);
    ctx.restore();
  }
  if (marks & MARK_PEACEFUL) {
    const dot = new Path2D();
    dot.arc(left + inset + size / 2, top + inset + size / 2, size / 2, 0, 2 * Math.PI);
    badge(ctx, dot, "rgb(89, 204, 115)");
  }
  if (marks & MARK_RIDDEN) {
    const saddle = new Path2D();
    saddle.moveTo(left + inset, bottom - inset);
    saddle.lineTo(left + inset + size, bottom - inset);
    saddle.lineTo(left + inset + size / 2, bottom - inset - size);
    saddle.closePath();
    badge(ctx, saddle, "rgb(255, 204, 64)");
  }
  if (marks & MARK_PILE) {
    const item = Math.round(size * 0.8);
    const offset = Math.round(size * 0.35);
    const x = right - inset - item;
    const y = bottom - inset - item;
    for (const d of [offset, 0]) {
      const paper = new Path2D();
      paper.roundRect(x - d, y - d, item, item, 1.5);
      badge(ctx, paper, "rgb(242, 242, 242)");
    }
  }
}
