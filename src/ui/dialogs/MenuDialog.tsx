import { useLayoutEffect, useState } from "preact/hooks";
import type { MenuHow, MenuItem, MenuSelection } from "../../protocol";
import { tileStyle, type TileSheet } from "../../tiles";
import { nhColor } from "../colors";

const ICON = 24;
const ATR_BOLD = 1;
const ATR_INVERSE = 7;

interface Props {
  how: MenuHow;
  prompt: string;
  items: MenuItem[];
  sheet: TileSheet;
  onDone(selection: MenuSelection[] | null): void;
}

export function MenuDialog({ how, prompt, items, sheet, onDone }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.flatMap((item, i) => (item.preselected && item.identifier !== 0 ? [i] : []))),
  );

  const finish = (indices: Iterable<number>) =>
    onDone([...indices].map((i) => ({ identifier: items[i].identifier, count: -1 })));

  const toggle = (i: number) => {
    if (items[i].identifier === 0) return;
    if (how === "one") return finish([i]);
    if (how === "none") return;
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return onDone(null);
      if (e.key === "Enter" || (e.key === " " && how !== "one")) {
        if (how === "one" && selected.size === 0) return onDone(null);
        return finish(selected);
      }
      const hits = items.flatMap((item, i) =>
        item.identifier !== 0 && (item.accelerator === e.key || item.groupAccelerator === e.key) ? [i] : [],
      );
      if (!hits.length) return;
      if (how === "one") return finish([hits[0]]);
      if (how === "any") {
        const next = new Set(selected);
        for (const i of hits) {
          if (next.has(i)) next.delete(i);
          else next.add(i);
        }
        setSelected(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div class="dialog-backdrop">
      <div class="dialog menu-dialog" role="dialog">
        {prompt ? <div class="dialog-title">{prompt}</div> : null}
        <div class="menu-items">
          {items.map((item, i) =>
            item.identifier === 0 ? (
              <div class={`menu-heading${item.attr === ATR_INVERSE || item.attr === ATR_BOLD ? " strong" : ""}`}>
                {item.text || " "}
              </div>
            ) : (
              <button
                class={`menu-item${selected.has(i) ? " selected" : ""}`}
                onClick={() => toggle(i)}
                style={{ color: nhColor(item.color) }}
              >
                <span class="inv-icon" style={tileStyle(sheet, item.tile, ICON)} />
                <span class="inv-letter">{item.accelerator}</span>
                <span class="menu-text">{item.text}</span>
              </button>
            ),
          )}
        </div>
        <div class="dialog-buttons">
          <button onClick={() => onDone(null)}>{how === "none" ? "Close" : "Cancel"}</button>
          {how === "any" ? (
            <button class="primary" onClick={() => finish(selected)}>
              OK
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
