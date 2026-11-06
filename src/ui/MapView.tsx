import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cursorColor } from "../port/cursor";
import { tooltipText, wikiTerm, wikiUrl } from "../port/describe";
import { useTooltip } from "./tooltip";
import { COLNO, ROWNO, type GameState } from "../port/state";
import { drawTile, type TileSheet } from "../tiles";
import { asciiCell, type AsciiFont, drawSymbol } from "./ascii";
import { drawMarks } from "./marks";
import { clipAround } from "./scroll";
import petMarkUrl from "./petmark.png";

interface Props {
  state: GameState;
  sheet: TileSheet;
  cell: number;
  /** How far the map is zoomed from its starting size. */
  scale: number;
  ascii: boolean;
  /** The player's choice for the ASCII map, else the default. */
  asciiFont: AsciiFont | null;
  /** Absent until the core has read its options, which would overrule a switch made before. */
  onAscii?(on: boolean): void;
  onClick(x: number, y: number, button: number): void;
  describe(x: number, y: number): Promise<string | null>;
  /** 0 goes back to the starting size. */
  onZoom(step: -1 | 0 | 1): void;
  /** Present while the inventory sidebar is hidden. */
  onShowInventory?(): void;
  /** Buttons over the map's bottom-left corner. */
  toolbar?: ComponentChildren;
}

interface ContextMenu {
  x: number;
  y: number;
  left: number;
  top: number;
  /** What to search the wiki for; null while farlook is asked, or when it has nothing to say. */
  term: string | null;
}

// how far a pinch goes for one zoom step, near Cocoa's 0.15 magnification (Safari's scale is times 100)
const PINCH_STEP = 15;

// CLICK_1 / CLICK_2 in the core
const CLICK_PRIMARY = 1;
const CLICK_SECONDARY = 2;

export function MapView({ state, sheet, cell, scale, ascii, asciiFont, onAscii, onClick, describe, onZoom, onShowInventory, toolbar }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const tooltip = useTooltip();
  const hover = useRef<{ x: number; y: number } | null>(null);
  const [petMark, setPetMark] = useState<HTMLImageElement | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const menuEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setPetMark(image);
    image.src = petMarkUrl;
  }, []);

  const cancelTooltip = () => {
    hover.current = null;
    tooltip.hide();
  };

  // what was under the mouse may have moved or gone
  useEffect(cancelTooltip, [state.map]);

  const text = ascii ? asciiCell(cell, asciiFont, scale) : null;
  const width = text?.width ?? cell;
  const height = text?.height ?? cell;
  // the Rogue level is drawn as text even with tiles on, in squares the size of the tiles, as Cocoa does
  const symbols = text ?? (state.status.rogue_level ? { ...asciiCell(cell, null, scale), width: cell } : null);
  // BL_HP is the polymorphed form's while polymorphed, as Cocoa's u.mh
  const cursorStroke = cursorColor(Number(state.status.BL_HP?.text), Number(state.status.BL_HPMAX?.text));

  // before paint: resizing the canvas has cleared it
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = cell < Math.max(sheet.width, sheet.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, COLNO * width, ROWNO * height);
    for (let y = 0; y < ROWNO; y++) {
      for (let x = 0; x < COLNO; x++) {
        const c = state.map[y * COLNO + x];
        if (!c) continue;
        if (symbols) {
          drawSymbol(ctx, symbols, c.symbol, c.color, x * width, y * height);
        } else {
          drawTile(ctx, sheet, c.bgTile, x * width, y * height, cell);
          drawTile(ctx, sheet, c.tile, x * width, y * height, cell);
        }
        if (c.marks) drawMarks(ctx, c.marks, x * width, y * height, width, height, petMark);
      }
    }
    if (state.cursor) {
      ctx.strokeStyle = cursorStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(state.cursor.x * width + 0.5, state.cursor.y * height + 0.5, width - 1, height - 1);
    }
  }, [state.map, state.cursor, cursorStroke, sheet, cell, symbols?.font, symbols?.width, petMark]);

  // the middle of the view in squares, kept as it scrolls: once the canvas has been resized, the browser
  // has already clamped the scroll position to it
  const shown = useRef({ width, height });
  const middle = useRef<{ x: number; y: number } | null>(null);
  const recordMiddle = () => {
    const el = scroller.current;
    if (el)
      middle.current = {
        x: (el.scrollLeft + el.clientWidth / 2) / shown.current.width,
        y: (el.scrollTop + el.clientHeight / 2) / shown.current.height,
      };
  };

  // a zoom keeps what was in the middle of the view there, then keeps the hero in view, as Cocoa's does
  useLayoutEffect(() => {
    const el = scroller.current;
    const before = shown.current;
    if (before.width === width && before.height === height) return;
    if (!middle.current) recordMiddle();
    shown.current = { width, height };
    if (!el || !middle.current) return;
    el.scrollLeft = middle.current.x * width - el.clientWidth / 2;
    el.scrollTop = middle.current.y * height - el.clientHeight / 2;
    if (state.cursor) clipAround(el, state.cursor.x, state.cursor.y, width, height);
    recordMiddle();
  }, [width, height]);

  // a trackpad pinch arrives as a wheel with ctrlKey in most browsers and as gesture events in Safari;
  // either would otherwise zoom the page
  const zoom = useRef(onZoom);
  zoom.current = onZoom;
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    let pinched = 0;
    let idle = 0;
    let scale = 1;
    const pinch = (by: number) => {
      pinched += by;
      clearTimeout(idle);
      idle = window.setTimeout(() => (pinched = 0), 200);
      if (Math.abs(pinched) < PINCH_STEP) return;
      zoom.current(pinched > 0 ? 1 : -1);
      pinched = 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      pinch(-e.deltaY);
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      scale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const next = (e as Event & { scale: number }).scale;
      pinch((next - scale) * 100);
      scale = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      clearTimeout(idle);
    };
  }, []);

  // keep the hero in view when the core asks
  useEffect(() => {
    const el = scroller.current;
    if (el && state.cursor) clipAround(el, state.cursor.x, state.cursor.y, shown.current.width, shown.current.height);
  }, [state.cursor]);

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

  const tapMark = useRef<HTMLDivElement>(null);
  const tapped = (e: PointerEvent) => {
    const mark = tapMark.current;
    if (e.pointerType !== "touch" || !e.isPrimary || !mark) return;
    const at = square(e);
    if (!at) return;
    Object.assign(mark.style, { left: `${at.x * width}px`, top: `${at.y * height}px`, width: `${width}px`, height: `${height}px` });
    mark.classList.remove("released");
    mark.hidden = false;
    // one frame at full strength, then the fade
    requestAnimationFrame(() => requestAnimationFrame(() => mark.classList.add("released")));
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
    tooltip.show(async () => {
      const text = await describe(at.x, at.y);
      return text && tooltipText(text);
    }, e.clientX + 12, e.clientY + 16);
    hover.current = at;
  };

  return (
    <div class="map-pane" ref={pane}>
      <div
        class="map"
        ref={scroller}
        onScroll={() => {
          cancelTooltip();
          setMenu(null);
          recordMiddle();
        }}
      >
        <canvas
          ref={canvas}
          data-cursor={state.cursor ? `${state.cursor.x},${state.cursor.y}` : undefined}
          width={COLNO * width}
          height={ROWNO * height}
          onClick={click}
          onContextMenu={openMenu}
          onMouseMove={move}
          onMouseLeave={cancelTooltip}
          onPointerUp={tapped}
        />
        <div class="tap-mark" ref={tapMark} hidden />
      </div>
      {onShowInventory ? (
        <button class="show-inventory" onClick={onShowInventory}>
          Show Inventory
        </button>
      ) : null}
      {toolbar}
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
      {tooltip.element}
    </div>
  );
}
