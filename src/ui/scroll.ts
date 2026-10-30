export interface Scroller {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
}

/** Scrolls as little as shows the hero with a border of 8 squares, at most 40% of the view, as Cocoa's cliparound does. */
export function clipAround(el: Scroller, x: number, y: number, width: number, height: number) {
  const borderX = Math.min(8 * width, el.clientWidth * 0.4);
  const borderY = Math.min(8 * height, el.clientHeight * 0.4);
  const cx = (x + 0.5) * width;
  const cy = (y + 0.5) * height;
  if (cx - borderX < el.scrollLeft) el.scrollLeft = cx - borderX;
  else if (cx + borderX > el.scrollLeft + el.clientWidth) el.scrollLeft = cx + borderX - el.clientWidth;
  if (cy - borderY < el.scrollTop) el.scrollTop = cy - borderY;
  else if (cy + borderY > el.scrollTop + el.clientHeight) el.scrollTop = cy + borderY - el.clientHeight;
}
