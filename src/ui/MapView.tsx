import { useEffect, useRef, useState } from "preact/hooks";
import { tooltipText } from "../port/describe";
import { COLNO, ROWNO, type GameState } from "../port/state";
import { drawTile, type TileSheet } from "../tiles";
import { drawMarks } from "./marks";
import petMarkUrl from "./petmark.png";

interface Props {
  state: GameState;
  sheet: TileSheet;
  cell: number;
  onClick(x: number, y: number, button: number): void;
  describe(x: number, y: number): Promise<string | null>;
  onZoom(step: -1 | 1): void;
}

interface Tooltip {
  text: string;
  left: number;
  top: number;
}

const TOOLTIP_DELAY = 500;

// CLICK_1 / CLICK_2 in the core
const CLICK_PRIMARY = 1;
const CLICK_SECONDARY = 2;

export function MapView({ state, sheet, cell, onClick, describe, onZoom }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hover = useRef<{ x: number; y: number; timer: number } | null>(null);
  const [petMark, setPetMark] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setPetMark(image);
    image.src = petMarkUrl;
  }, []);

  const cancelTooltip = () => {
    if (hover.current) clearTimeout(hover.current.timer);
    hover.current = null;
    setTooltip(null);
  };

  // what was under the mouse may have moved or gone
  useEffect(cancelTooltip, [state.map]);

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
        if (c.marks) drawMarks(ctx, c.marks, x * cell, y * cell, cell, petMark);
      }
    }
    if (state.cursor) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(state.cursor.x * cell + 0.5, state.cursor.y * cell + 0.5, cell - 1, cell - 1);
    }
  }, [state.map, state.cursor, sheet, cell, petMark]);

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

  const square = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);
    return x >= 1 && x < COLNO && y >= 0 && y < ROWNO ? { x, y } : null;
  };

  const click = (e: MouseEvent) => {
    e.preventDefault();
    cancelTooltip();
    const at = square(e);
    if (at) onClick(at.x, at.y, e.button === 2 ? CLICK_SECONDARY : CLICK_PRIMARY);
  };

  const move = (e: MouseEvent) => {
    const at = square(e);
    if (at && hover.current?.x === at.x && hover.current.y === at.y) return;
    cancelTooltip();
    if (!at) return;
    const { clientX, clientY } = e;
    const timer = window.setTimeout(async () => {
      const text = await describe(at.x, at.y);
      if (text && hover.current?.timer === timer) setTooltip({ text: tooltipText(text), left: clientX + 12, top: clientY + 16 });
    }, TOOLTIP_DELAY);
    hover.current = { ...at, timer };
  };

  return (
    <div class="map-pane">
      <div class="map" ref={scroller} onScroll={cancelTooltip}>
        <canvas
          ref={canvas}
          width={COLNO * cell}
          height={ROWNO * cell}
          onClick={click}
          onContextMenu={click}
          onMouseMove={move}
          onMouseLeave={cancelTooltip}
        />
      </div>
      <div class="map-zoom">
        <button aria-label="Zoom out" onClick={() => onZoom(-1)}>−</button>
        <button aria-label="Zoom in" onClick={() => onZoom(1)}>+</button>
      </div>
      {tooltip ? (
        <div class="map-tooltip" role="tooltip" style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}>
          {tooltip.text}
        </div>
      ) : null}
    </div>
  );
}
