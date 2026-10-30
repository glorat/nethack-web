import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { tooltipText, wikiTerm, wikiUrl } from "../port/describe";
import { COLNO, ROWNO, type GameState } from "../port/state";
import { drawTile, type TileSheet } from "../tiles";
import { asciiCell, drawSymbol } from "./ascii";
import { drawMarks } from "./marks";
import petMarkUrl from "./petmark.png";

interface Props {
  state: GameState;
  sheet: TileSheet;
  cell: number;
  ascii: boolean;
  /** Absent until the core has read its options, which would overrule a switch made before. */
  onAscii?(on: boolean): void;
  onClick(x: number, y: number, button: number): void;
  describe(x: number, y: number): Promise<string | null>;
  onZoom(step: -1 | 1): void;
}

interface Tooltip {
  text: string;
  left: number;
  top: number;
}

interface ContextMenu {
  x: number;
  y: number;
  left: number;
  top: number;
  /** What to search the wiki for; null while farlook is asked, or when it has nothing to say. */
  term: string | null;
}

const TOOLTIP_DELAY = 500;

// CLICK_1 / CLICK_2 in the core
const CLICK_PRIMARY = 1;
const CLICK_SECONDARY = 2;

export function MapView({ state, sheet, cell, ascii, onAscii, onClick, describe, onZoom }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hover = useRef<{ x: number; y: number; timer: number } | null>(null);
  const [petMark, setPetMark] = useState<HTMLImageElement | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const menuEl = useRef<HTMLDivElement>(null);

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

  const text = ascii ? asciiCell(cell) : null;
  const width = text?.width ?? cell;
  const height = cell;

  // before paint: resizing the canvas has cleared it
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = cell < sheet.size;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, COLNO * width, ROWNO * height);
    for (let y = 0; y < ROWNO; y++) {
      for (let x = 0; x < COLNO; x++) {
        const c = state.map[y * COLNO + x];
        if (!c) continue;
        if (text) {
          drawSymbol(ctx, text, c.symbol, c.color, x * width, y * height);
        } else {
          drawTile(ctx, sheet, c.bgTile, x * width, y * height, cell);
          drawTile(ctx, sheet, c.tile, x * width, y * height, cell);
        }
        if (c.marks) drawMarks(ctx, c.marks, x * width, y * height, width, height, petMark);
      }
    }
    if (state.cursor) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(state.cursor.x * width + 0.5, state.cursor.y * height + 0.5, width - 1, height - 1);
    }
  }, [state.map, state.cursor, sheet, cell, text, petMark]);

  // keep the hero in view, as cliparound asks
  useEffect(() => {
    const el = scroller.current;
    if (!el || !state.cursor) return;
    const cx = state.cursor.x * width + width / 2;
    const cy = state.cursor.y * height + height / 2;
    if (cx < el.scrollLeft + width * 4 || cx > el.scrollLeft + el.clientWidth - width * 4)
      el.scrollLeft = cx - el.clientWidth / 2;
    if (cy < el.scrollTop + height * 4 || cy > el.scrollTop + el.clientHeight - height * 4)
      el.scrollTop = cy - el.clientHeight / 2;
  }, [state.cursor, width, height]);

  const square = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / width);
    const y = Math.floor((e.clientY - rect.top) / height);
    return x >= 1 && x < COLNO && y >= 0 && y < ROWNO ? { x, y } : null;
  };

  const click = (e: MouseEvent) => {
    e.preventDefault();
    cancelTooltip();
    const at = square(e);
    if (at) onClick(at.x, at.y, CLICK_PRIMARY);
  };

  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    cancelTooltip();
    const at = square(e);
    if (!at) return;
    const opened = { ...at, left: e.clientX, top: e.clientY, term: null };
    setMenu(opened);
    describe(at.x, at.y).then((text) => {
      const term = text ? wikiTerm(text) : "";
      if (term) setMenu((m) => (m === opened ? { ...opened, term } : m));
    });
  };

  // flip the menu above or left of the pointer where it would run off the window, as a native menu does
  useLayoutEffect(() => {
    const el = menuEl.current;
    if (!menu || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = menu.left + width > window.innerWidth ? menu.left - width : menu.left;
    const top = menu.top + height > window.innerHeight ? menu.top - height : menu.top;
    el.style.left = `${Math.max(0, left)}px`;
    el.style.top = `${Math.max(0, top)}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    // any other key closes the menu and still plays
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
      close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

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
      <div
        class="map"
        ref={scroller}
        onScroll={() => {
          cancelTooltip();
          setMenu(null);
        }}
      >
        <canvas
          ref={canvas}
          width={COLNO * width}
          height={ROWNO * height}
          onClick={click}
          onContextMenu={openMenu}
          onMouseMove={move}
          onMouseLeave={cancelTooltip}
        />
      </div>
      <div class="map-zoom">
        <button class="ascii-toggle" aria-pressed={ascii} disabled={!onAscii} onClick={() => onAscii?.(!ascii)}>
          ASCII
        </button>
        <button aria-label="Zoom out" onClick={() => onZoom(-1)}>−</button>
        <button aria-label="Zoom in" onClick={() => onZoom(1)}>+</button>
      </div>
      {menu ? (
        <div class="context-backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div class="context-menu" role="menu" ref={menuEl} onMouseDown={(e) => e.stopPropagation()}>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onClick(menu.x, menu.y, CLICK_SECONDARY);
              }}
            >
              Look here
            </button>
            {menu.term ? (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  window.open(wikiUrl(menu.term!), "_blank", "noopener");
                }}
              >
                Search the NetHack Wiki for ‘{menu.term}’
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {tooltip ? (
        <div class="map-tooltip" role="tooltip" style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}>
          {tooltip.text}
        </div>
      ) : null}
    </div>
  );
}
