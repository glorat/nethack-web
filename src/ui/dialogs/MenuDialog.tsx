import { useLayoutEffect, useState } from "preact/hooks";
import type { MenuHow, MenuItem, MenuSelection } from "../../protocol";
import { tileStyle, type TileSheet } from "../../tiles";
import { textStyle } from "../colors";

const ICON = 24;
const ATR_BOLD = 1;
const ATR_INVERSE = 7;

/** A heading's inverse (menu_headings' default) is drawn as a strong heading instead. */
export function headingStyle(item: MenuItem): Record<string, string> {
  return textStyle(item.color, item.attr === ATR_INVERSE ? 0 : item.attr);
}

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

  // with menu_tab_sep the core separates columns with tabs; a grid lines them up,
  // and a heading row of columns starts where the items' text does
  const columns = Math.max(...items.map((item) => item.text.split("\t").length));
  const fields = (text: string, style?: Record<string, string>) =>
    text.split("\t").map((f) => (
      <span class="menu-field" style={style}>
        {f}
      </span>
    ));

  return (
    <div class="dialog-backdrop">
      <div class="dialog menu-dialog" role="dialog">
        {prompt ? <div class="dialog-title">{prompt}</div> : null}
        <div class={columns > 1 ? "menu-items tabbed" : "menu-items"} style={{ "--menu-columns": columns }}>
          {items.map((item, i) =>
            item.identifier === 0 ? (
              <div
                class={`menu-heading${item.attr === ATR_INVERSE || item.attr === ATR_BOLD ? " strong" : ""}${item.text.includes("\t") ? " columns" : ""}`}
                style={item.text.includes("\t") ? undefined : headingStyle(item)}
              >
                {item.text.includes("\t") ? fields(item.text, headingStyle(item)) : item.text || " "}
              </div>
            ) : (
              <button
                class={`menu-item${selected.has(i) ? " selected" : ""}`}
                onClick={() => toggle(i)}
              >
                <span class="inv-icon" style={tileStyle(sheet, item.tile, ICON)} />
                <span class="inv-letter">{item.accelerator}</span>
                {columns > 1 ? (
                  fields(item.text, textStyle(item.color, item.attr))
                ) : (
                  <span class="menu-text" style={textStyle(item.color, item.attr)}>
                    {item.text}
                  </span>
                )}
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
