import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MenuHow, MenuItem, MenuSelection } from "../../protocol";
import { isHeading, isQuestion } from "../../port/question";
import { sortedOrder } from "../../port/sort";
import { tileStyle, type TileSheet } from "../../tiles";
import { textStyle } from "../colors";

const ICON = 24;
const ATR_BOLD = 1;
const ATR_INVERSE = 7;
const MAX_COUNT = 0x7fffffff;
const SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };

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
  const [sorted, setSorted] = useState(false);
  const order = sorted ? sortedOrder(items) : items.map((_, i) => i);
  // only lists of things are worth sorting
  const sortable = how !== "none" && items.some((item) => item.tile >= 0);
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

  // a count typed first is for one item, so this drops it, as tty does
  const setAll = (on: boolean) => {
    count.current = 0;
    items.forEach((item, i) => {
      if (item.identifier === 0) return;
      if (!on) selected.current.delete(i);
      else if (!selected.current.has(i)) selected.current.set(i, -1);
    });
    update();
  };

  const choose = (i: number) => {
    if (items[i].identifier === 0) return;
    if (how === "one") return finish(new Map([[i, taking()]]));
    if (how === "any") toggle([i]);
  };

  // a read-only list is read like a text view: selected, copied and scrolled by key
  const list = useRef<HTMLDivElement>(null);
  const selectList = () => {
    if (!list.current) return;
    const range = document.createRange();
    range.selectNodeContents(list.current);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  };
  const scrollList = (key: string) => {
    const el = list.current;
    if (!el) return;
    const page = el.clientHeight * 0.9;
    const by: Record<string, number> = { ArrowUp: -20, ArrowDown: 20, PageUp: -page, PageDown: page, Home: -el.scrollHeight, End: el.scrollHeight };
    el.scrollTop += by[key];
  };
  // copied as Cocoa's text view holds it: a letter, a tab and the item, columns tab-separated
  const copyList = (e: ClipboardEvent) => {
    const selection = getSelection();
    if (!selection || !list.current || !e.clipboardData) return;
    const lines = [...list.current.children].flatMap((row, n) => {
      if (!selection.containsNode(row, true)) return [];
      const item = items[order[n]];
      return [item.identifier === 0 ? item.text : `${item.accelerator}\t${item.text}`];
    });
    if (!lines.length) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", lines.join("\n"));
  };

  // the row the arrow keys, a click or in a pick-one menu the mouse are on, for Return or space;
  // a question's answers are buttons, so it has none
  const highlight = useRef<number | null>(null);
  const highlights = how !== "none" && !isQuestion(how, items);
  const setHighlight = (i: number | null) => {
    if (highlight.current === i) return;
    highlight.current = i;
    update();
  };
  const moveHighlight = (step: 1 | -1) => {
    const rows = order.filter((i) => items[i].identifier !== 0);
    if (!rows.length) return;
    const at = highlight.current === null ? -1 : rows.indexOf(highlight.current);
    const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
    highlight.current = rows[next];
    list.current?.children[order.indexOf(rows[next])]?.scrollIntoView({ block: "nearest" });
    update();
  };

  // sorting moves the highlighted row
  useLayoutEffect(() => {
    if (highlight.current !== null) list.current?.children[order.indexOf(highlight.current)]?.scrollIntoView({ block: "nearest" });
  }, [sorted]);

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (how === "none" && (e.metaKey || e.ctrlKey) && e.key === "c") return;
      e.preventDefault();
      if (how === "none" && (e.metaKey || e.ctrlKey) && e.key === "a") return selectList();
      if (how === "none" && e.key in SCROLL_KEYS) return scrollList(e.key);
      if (e.key === "Escape") return onDone(null);
      // not keys typed before the menu opened, replayed into it: they can't have meant a row they hadn't seen
      if (highlights && e.isTrusted && (e.key === "ArrowDown" || e.key === "ArrowUp"))
        return moveHighlight(e.key === "ArrowDown" ? 1 : -1);
      const lit = highlight.current;
      if (how === "one" && (e.key === "Enter" || e.key === " ") && lit !== null) return choose(lit);
      if (how === "any" && e.key === " " && lit !== null) return toggle([lit]);
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
      if (!hits.length && how === "any" && (e.key === "." || e.key === ",")) return setAll(true);
      if (!hits.length && how === "any" && (e.key === "-" || e.key === "\\")) return setAll(false);
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

  // a list to read is text to select and copy, not buttons
  const Row = how === "none" ? "div" : "button";

  if (isQuestion(how, items))
    return (
      <div class="dialog-backdrop">
        <div class="dialog menu-dialog question" role="dialog">
          {prompt ? <div class="dialog-title">{prompt}</div> : null}
          <div class="answers">
            {items.map((item, i) =>
              item.identifier === 0 ? (
                item.text.trim() ? <p class="hint">{item.text.trim()}</p> : null
              ) : (
                <button class={`answer${item.preselected ? " primary" : ""}`} onClick={() => choose(i)}>
                  <span class="inv-letter">{item.accelerator}</span>
                  <span style={textStyle(item.color, item.attr)}>{item.text}</span>
                </button>
              ),
            )}
          </div>
          <div class="dialog-buttons">
            {count.current > 0 ? <span class="hint">Count: {count.current}</span> : null}
            <button onClick={() => onDone(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );

  return (
    <div class="dialog-backdrop">
      <div class="dialog menu-dialog" role="dialog">
        {prompt ? <div class="dialog-title">{prompt}</div> : null}
        <div
          ref={list}
          onCopy={how === "none" ? copyList : undefined}
          onMouseLeave={how === "one" ? () => setHighlight(null) : undefined}
          class={`menu-items${columns > 1 ? " tabbed" : ""}${how === "none" ? " readonly" : ""}`}
          style={{ "--menu-columns": columns }}
        >
          {order.map((i) => [items[i], i] as const).map(([item, i]) =>
            item.identifier === 0 && !item.text.includes("\t") && !isHeading(item, items[i + 1]) ? (
              <div class="menu-line" style={textStyle(item.color, item.attr)}>
                {item.text || " "}
              </div>
            ) : item.identifier === 0 ? (
              <div
                class={`menu-heading${item.attr === ATR_INVERSE || item.attr === ATR_BOLD ? " strong" : ""}${item.text.includes("\t") ? " columns" : ""}`}
                style={item.text.includes("\t") ? undefined : headingStyle(item)}
              >
                {item.text.includes("\t") ? fields(item.text, headingStyle(item)) : item.text || " "}
              </div>
            ) : (
              <Row
                class={`menu-item${selected.current.has(i) ? " selected" : ""}${highlight.current === i ? " highlighted" : ""}`}
                onClick={
                  how === "none"
                    ? undefined
                    : () => {
                        setHighlight(i);
                        choose(i);
                      }
                }
                onMouseMove={how === "one" ? () => setHighlight(i) : undefined}
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
              </Row>
            ),
          )}
        </div>
        <div class="dialog-buttons">
          <div class="dialog-left">
            {how === "any" ? <button onClick={() => setAll(true)}>Select All</button> : null}
            {sortable ? (
              <label class="sort-toggle">
                <input type="checkbox" checked={sorted} onChange={(e) => setSorted((e.target as HTMLInputElement).checked)} />
                Sort A–Z
              </label>
            ) : null}
          </div>
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
