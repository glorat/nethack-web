import { useLayoutEffect, useRef } from "preact/hooks";
import { directionKey } from "../../port/keys";
import { COLNO, ROWNO } from "../../port/state";

interface Props {
  query: string;
  /** The core's keys for W NW N NE E SE S SW down up. */
  directions: string;
  onDone(key: string | null): void;
}

// the grid's squares as indices into directions, row by row; -1 is self
const GRID = [1, 2, 3, 0, -1, 4, 7, 6, 5];
const ARROWS = ["↖", "↑", "↗", "←", "", "→", "↙", "↓", "↘"];
// past the squares next to the hero, which are the ones being chosen between
const MARGIN = 8;

/** Where the hero is on screen, from the map's canvas; null if it isn't showing. */
function heroRect(): DOMRect | null {
  const canvas = document.querySelector<HTMLCanvasElement>(".map canvas");
  const at = canvas?.dataset.cursor?.split(",").map(Number);
  if (!canvas || !at) return null;
  const box = canvas.getBoundingClientRect();
  const width = box.width / COLNO;
  const height = box.height / ROWNO;
  return new DOMRect(box.left + at[0] * width, box.top + at[1] * height, width, height);
}

export function DirectionDialog({ query, directions, onDone }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      e.stopPropagation();
      if (e.metaKey) return;
      e.preventDefault();
      // anything else is the core's to answer, as tty's: help for ?, a cursor for _, a complaint for the rest
      const code = directionKey(e, directions);
      if (code !== null && code < 128) onDone(String.fromCharCode(code));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // beside the hero rather than over it, so the map around them stays visible, and again when a zoom
  // or the window's size moves them
  useLayoutEffect(() => {
    const place = () => {
      const el = panel.current;
      const hero = heroRect();
      if (!el || !hero) return;
      const { width, height } = el.getBoundingClientRect();
      const gap = hero.width + MARGIN;
      let left = hero.right + gap;
      if (left + width > window.innerWidth) left = hero.left - gap - width;
      const top = hero.top + hero.height / 2 - height / 2;
      el.style.left = `${Math.max(0, Math.min(left, window.innerWidth - width))}px`;
      el.style.top = `${Math.max(0, Math.min(top, window.innerHeight - height))}px`;
      el.style.transform = "none";
    };
    place();
    const map = document.querySelector(".map canvas");
    const resized = new ResizeObserver(place);
    if (map) resized.observe(map);
    window.addEventListener("resize", place);
    // a zoom scrolls the map as well
    const scroller = document.querySelector(".map");
    scroller?.addEventListener("scroll", place);
    return () => {
      resized.disconnect();
      window.removeEventListener("resize", place);
      scroller?.removeEventListener("scroll", place);
    };
  }, []);

  const button = (key: string, label: string, arrow = "") => (
    <button class="direction" onClick={() => onDone(key)}>
      <span class="direction-key">{key}</span>
      {arrow ? <span class="direction-arrow">{arrow}</span> : null}
      {label ? <span>{label}</span> : null}
    </button>
  );

  return (
    <div class="dialog-backdrop clear">
      <div class="dialog direction-dialog" role="dialog" ref={panel}>
        <div class="dialog-title">{query}</div>
        <div class="direction-grid">
          {GRID.map((d, n) => (d < 0 ? button(".", "Self") : button(directions[d], "", ARROWS[n])))}
        </div>
        <div class="direction-vertical">
          {button(directions[9], "Up")}
          {button(directions[8], "Down")}
        </div>
        <div class="hint">s also means self, ? lists the directions, Esc cancels.</div>
        <div class="dialog-buttons">
          <button onClick={() => onDone(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
