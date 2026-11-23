// The page boundaries of a menu, measured from the rows the browser laid out.

export interface MenuRow {
  height: number;
  selectable: boolean;
  heading: boolean;
  /** The row's content, without its padding, relative to the top of the scrollable content. */
  contentTop: number;
  contentBottom: number;
}

export interface MenuPoint {
  row: number;
  top: number;
}

/** The height of the last heading before a row, which stays pinned over the top of the list. */
export function headingHeightBefore(rows: MenuRow[], row: number): number {
  for (let i = row - 1; i >= 0; i--) if (rows[i].heading) return rows[i].height;
  return 0;
}

/**
 * One stop for the top, then the first selectable row cut off by each page's bottom,
 * moved down by the heading that will stay above it.
 */
export function scrollPoints(rows: MenuRow[], viewport: number, onlySelectable = true): MenuPoint[] {
  const points: MenuPoint[] = [{ row: 0, top: 0 }];
  let start = 0;
  for (;;) {
    const top = points[points.length - 1].top;
    let next = -1;
    for (let i = start; i < rows.length; i++) {
      if (rows[i].heading) continue;
      if (onlySelectable && !rows[i].selectable) continue;
      if (rows[i].contentBottom > top + viewport) {
        next = i;
        break;
      }
    }
    if (next < 0) return points;
    if (next === start) {
      next = rows.findIndex((row, i) => i > start && !row.heading && (!onlySelectable || row.selectable));
      if (next < 0) return points;
    }
    points.push({ row: next, top: Math.max(top + 1, rows[next].contentTop - headingHeightBefore(rows, next)) });
    start = next;
  }
}
