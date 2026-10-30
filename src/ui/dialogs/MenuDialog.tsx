import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MenuHow, MenuItem, MenuSelection } from "../../protocol";
import { tileStyle, type TileSheet } from "../../tiles";
import { textStyle } from "../colors";

const ICON = 24;
const ATR_BOLD = 1;
const ATR_INVERSE = 7;
const MAX_COUNT = 0x7fffffff;

/** A heading's inverse (menu_headings' default) is drawn as a strong heading instead. */
export function headingStyle(item: MenuItem): Record<string, string> {
  return textStyle(item.color, item.attr === ATR_INVERSE ? 0 : item.attr);
}

interface Props {
  how: MenuHow;
  prompt: string;
  items: MenuItem[];
  /** Letters the menu takes as answers too, though it doesn't list them. */
  unlisted?: string;
  sheet: TileSheet;
  onDone(selection: MenuSelection[] | null): void;
}

export function MenuDialog({ how, prompt, items, unlisted = "", sheet, onDone }: Props) {
  // what is picked, each with how many of it: -1 for all. Refs, as keys typed ahead are replayed
  // one after another before a render would bring new state.
  const [preselected] = useState(
    () => new Map(items.flatMap((item, i) => (item.preselected && item.identifier !== 0 ? [[i, -1]] : []))),
  );
  const selected = useRef<Map<number, number>>(preselected);
  // digits typed before an item's letter: take only that many of it
  const count = useRef(0);
  const [, rerender] = useState(0);
  const update = () => rerender((n) => n + 1);

  const finish = (picked: Map<number, number>) =>
    onDone([...picked].map(([i, n]) => ({ identifier: items[i].identifier, count: n })));

  const taking = () => {
    const n = count.current;
    count.current = 0;
    return n > 0 ? n : -1;
  };

  const toggle = (indices: number[]) => {
    const n = taking();
    for (const i of indices) {
      if (selected.current.has(i)) selected.current.delete(i);
      else selected.current.set(i, n);
    }
    update();
  };

  const choose = (i: number) => {
    if (items[i].identifier === 0) return;
    if (how === "one") return finish(new Map([[i, taking()]]));
    if (how === "any") toggle([i]);
  };

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return onDone(null);
      if (e.key === "Enter" || (e.key === " " && how !== "one")) {
        if (how === "one" && selected.current.size === 0) return onDone(null);
        return finish(selected.current);
      }
      if (how === "none") return;
      const letters = items.flatMap((item, i) => (item.identifier !== 0 && item.accelerator === e.key ? [i] : []));
      const group = items.flatMap((item, i) => (item.identifier !== 0 && item.groupAccelerator === e.key ? [i] : []));
      // a digit is a group's symbol, such as 0 for iron balls, only before a count is started, as in tty
      const digit = e.key >= "0" && e.key <= "9" && !(count.current === 0 && group.length);
      if (!letters.length && digit) {
        const next = count.current * 10 + Number(e.key);
        // the core takes a count as a 32-bit int, and splitting a stack by a wrapped one panics
        if (next <= MAX_COUNT) count.current = next;
        return update();
      }
      const hits = letters.length ? letters : group;
      // an item's identifier in these menus is its letter
      if (!hits.length && how === "one" && e.key.length === 1 && unlisted.includes(e.key))
        return onDone([{ identifier: e.key.charCodeAt(0), count: taking() }]);
      if (!hits.length) return;
      if (how === "one") return choose(hits[0]);
      toggle(hits);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // with menu_tab_sep the core separates columns with tabs; a grid lines them up,
  // and a heading row of columns starts where the items' text does
  const columns = Math.max(...items.map((item) => item.text.split("\t").length));
  const fields = (text: string, style?: Record<string, string>, before?: ComponentChildren) =>
    text.split("\t").map((f, n) => (
      <span class="menu-field" style={style}>
        {n === 0 ? before : null}
        {f}
      </span>
    ));
  // inside the text, so a column menu's grid keeps its columns
  const taken = (i: number) => {
    const n = selected.current.get(i) ?? -1;
    return n > 0 ? <span class="menu-count">{n} of </span> : null;
  };

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
                class={`menu-item${selected.current.has(i) ? " selected" : ""}`}
                onClick={() => choose(i)}
              >
                <span class="inv-icon" style={tileStyle(sheet, item.tile, ICON)} />
                <span class="inv-letter">{item.accelerator}</span>
                {columns > 1 ? (
                  fields(item.text, textStyle(item.color, item.attr), taken(i))
                ) : (
                  <span class="menu-text" style={textStyle(item.color, item.attr)}>
                    {taken(i)}
                    {item.text}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
        <div class="dialog-buttons">
          {count.current > 0 ? <span class="hint">Count: {count.current}</span> : null}
          <button onClick={() => onDone(null)}>{how === "none" ? "Close" : "Cancel"}</button>
          {how === "any" ? (
            <button class="primary" onClick={() => finish(selected.current)}>
              OK
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
