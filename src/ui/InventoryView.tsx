import type { MenuItem } from "../protocol";
import { tileStyle, type TileSheet } from "../tiles";
import { textStyle } from "./colors";
import { headingStyle } from "./dialogs/MenuDialog";

const ICON = 24;

interface Props {
  items: MenuItem[];
  sheet: TileSheet;
  width: number;
  onChoose(letter: string): void;
  onHide(): void;
  /** While its left edge is dragged; done when the drag ends. */
  onResize(width: number, done: boolean): void;
}

export function InventoryView({ items, sheet, width, onChoose, onHide, onResize }: Props) {
  const drag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    let last = width;
    handle.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onResize((last = width + startX - m.clientX), false);
    // however the drag ends, the width it reached is kept
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", end);
      onResize(last, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end);
  };

  return (
    <>
      {/* outside the sidebar, which scrolls; mouse-only, as Cocoa's is */}
      <div class="inv-resize" aria-hidden="true" onPointerDown={drag} />
      <aside class="inventory" style={{ width: `${width}px` }}>
        <h2>
          Inventory
          <button class="hide-inventory" aria-label="Hide Inventory" onClick={onHide}>
            Hide
          </button>
        </h2>
        {items.map((item) =>
          item.identifier === 0 ? (
            <h3 class="inv-heading" style={headingStyle(item)}>
              {item.text}
            </h3>
          ) : (
            <button class="inv-item" onClick={() => onChoose(item.accelerator)} title={item.text}>
              <span class="inv-icon" style={tileStyle(sheet, item.tile, ICON)} />
              <span class="inv-letter">{item.accelerator}</span>
              <span class="inv-text" style={textStyle(item.color, item.attr)}>
                {item.text}
              </span>
            </button>
          ),
        )}
      </aside>
    </>
  );
}
