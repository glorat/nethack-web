import { useEffect, useRef } from "preact/hooks";
import { COLNO, ROWNO, type GameState } from "../port/state";
import { drawTile, type TileSheet } from "../tiles";

interface Props {
  state: GameState;
  sheet: TileSheet;
  cell: number;
  onClick(x: number, y: number, button: number): void;
}

// CLICK_1 / CLICK_2 in the core
const CLICK_PRIMARY = 1;
const CLICK_SECONDARY = 2;

export function MapView({ state, sheet, cell, onClick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = cell < sheet.size;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, COLNO * cell, ROWNO * cell);
    for (let y = 0; y < ROWNO; y++) {
      for (let x = 0; x < COLNO; x++) {
        const c = state.map[y * COLNO + x];
        if (!c) continue;
        drawTile(ctx, sheet, c.bgTile, x * cell, y * cell, cell);
        drawTile(ctx, sheet, c.tile, x * cell, y * cell, cell);
      }
    }
    if (state.cursor) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(state.cursor.x * cell + 0.5, state.cursor.y * cell + 0.5, cell - 1, cell - 1);
    }
  }, [state.map, state.cursor, sheet, cell]);

  // keep the hero in view, as cliparound asks
  useEffect(() => {
    const el = scroller.current;
    if (!el || !state.cursor) return;
    const cx = state.cursor.x * cell + cell / 2;
    const cy = state.cursor.y * cell + cell / 2;
    const margin = cell * 4;
    if (cx < el.scrollLeft + margin || cx > el.scrollLeft + el.clientWidth - margin)
      el.scrollLeft = cx - el.clientWidth / 2;
    if (cy < el.scrollTop + margin || cy > el.scrollTop + el.clientHeight - margin)
      el.scrollTop = cy - el.clientHeight / 2;
  }, [state.cursor, cell]);

  const click = (e: MouseEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);
    if (x >= 1 && x < COLNO && y >= 0 && y < ROWNO) onClick(x, y, e.button === 2 ? CLICK_SECONDARY : CLICK_PRIMARY);
  };

  return (
    <div class="map" ref={scroller}>
      <canvas
        ref={canvas}
        width={COLNO * cell}
        height={ROWNO * cell}
        onClick={click}
        onContextMenu={click}
      />
    </div>
  );
}
