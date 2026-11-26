import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MenuHow, MenuItem, MenuSelection } from "../../protocol";
import { positionalLetters } from "../../port/letters";
import { scrollPoints, type MenuPoint } from "../../port/pages";
import { isHeading, isQuestion, splitFields } from "../../port/question";
import { sortedOrder } from "../../port/sort";
import { listsStack } from "../../port/stack";
import { tileBox, tileStyle, type TileSheet } from "../../tiles";
import { textStyle } from "../colors";

const ICON = 24;
const CHECK = 14;
const LETTER = 12;
const GAP = 6;
const ATR_BOLD = 1;
const ATR_INVERSE = 7;
const MAX_COUNT = 0x7fffffff;
const SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };
const PAGE_KEYS = { "<": "prev", ">": "next", "^": "first", "|": "last" } as const;
// how long after a scroll a zero-movement mousemove is still Safari's synthetic one
const SCROLL_HUSH = 250;

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
  // a menu too long for the core to letter gets a fixed letter by position, shown or not
  const selectable = order.filter((i) => items[i].identifier !== 0);
  const positional = how !== "none" && selectable.length > 52;
  const labels = positionalLetters(items, order, how);
  const label = (i: number) => labels.get(i) ?? "";
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
  const pages = useRef<MenuPoint[]>([]);
  const scrolledAt = useRef(0);
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const pointerBefore = useRef<{ x: number; y: number } | null>(null);
  const markScroll = () => {
    scrolledAt.current = performance.now();
  };
  const pageAt = (el: HTMLElement) => {
    let at = 0;
    for (let i = 0; i < pages.current.length; i++) if (pages.current[i].top <= el.scrollTop + 1) at = i;
    return at;
  };
  const snapPage = (where: "prev" | "next" | "first" | "last") => {
    const el = list.current;
    if (!el || !pages.current.length) return;
    const at = where === "first" ? 0 : where === "last" ? pages.current.length - 1
      : Math.max(0, Math.min(pages.current.length - 1, pageAt(el) + (where === "next" ? 1 : -1)));
    // whole pixels, rounded down, so sub-pixel layout cannot tuck the first row under the heading
    el.scrollTop = Math.floor(pages.current[at].top);
    markScroll();
  };
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
    markScroll();
  };
  // copied as Cocoa's text view holds it: a letter, a tab and the item, columns tab-separated
  const copyList = (e: ClipboardEvent) => {
    const selection = getSelection();
    if (!selection || !list.current || !e.clipboardData) return;
    const lines = [...list.current.children].flatMap((row, n) => {
      if (!selection.containsNode(row, true)) return [];
      const item = items[order[n]];
      return [item.identifier === 0 ? item.text : `${label(order[n])}\t${item.text}`];
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
  const reveal = (i: number) => list.current?.children[order.indexOf(i)]?.scrollIntoView({ block: "nearest" });
  const moveHighlight = (step: 1 | -1) => {
    const rows = order.filter((i) => items[i].identifier !== 0);
    if (!rows.length) return;
    const at = highlight.current === null ? -1 : rows.indexOf(highlight.current);
    const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
    highlight.current = rows[next];
    reveal(rows[next]);
    update();
  };

  // sorting moves the highlighted row
  useLayoutEffect(() => {
    if (highlight.current !== null) reveal(highlight.current);
  }, [sorted]);

  // Track the pointer over the whole list, including headings and padding, so a scroll under a
  // still pointer is not mistaken for a move onto a row.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || how !== "one") return;
    const track = (e: MouseEvent) => {
      pointerBefore.current = pointerAt.current;
      pointerAt.current = { x: e.clientX, y: e.clientY };
    };
    el.addEventListener("mousemove", track, true);
    return () => el.removeEventListener("mousemove", track, true);
  }, [how]);

  // Measure each row's content once per layout; the page keys then only move by whole pages.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const rows = [...el.children].map((child, n) => {
        const rect = child.getBoundingClientRect();
        const style = getComputedStyle(child);
        const top = rect.top - box.top + el.scrollTop;
        return {
          height: rect.height,
          selectable: items[order[n]]?.identifier !== 0,
          heading: child.classList.contains("menu-heading"),
          contentTop: top + (parseFloat(style.paddingTop) || 0),
          contentBottom: top + rect.height - (parseFloat(style.paddingBottom) || 0),
        };
      });
      // A page that would leave less than a viewport below is pulled to the end instead: the last
      // item ends at the bottom, rather than leaving blank space under a short final page.
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      pages.current = scrollPoints(rows, el.clientHeight, how !== "none")
        .map((point) => ({ ...point, top: Math.min(point.top, max) }))
        .filter((point, i, all) => i === 0 || point.top > all[i - 1].top);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items, sorted]);

  // the headings' class symbols share one column, past the widest heading as the font draws it, which a width in ch can't know
  useLayoutEffect(() => {
    const texts = [...(list.current?.querySelectorAll<HTMLElement>(".menu-heading-text") ?? [])];
    if (!texts.length) return;
    const range = document.createRange();
    const align = () => {
      const widest = Math.max(
        ...texts.map((t) => {
          range.selectNodeContents(t);
          return range.getBoundingClientRect().width;
        }),
      );
      for (const t of texts) t.style.minWidth = `${Math.ceil(widest)}px`;
    };
    align();
    const resized = new ResizeObserver(align);
    for (const t of texts) resized.observe(t);
    return () => resized.disconnect();
  });

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (how === "none" && (e.metaKey || e.ctrlKey) && e.key === "c") return;
      e.preventDefault();
      if (how === "none" && (e.metaKey || e.ctrlKey) && e.key === "a") return selectList();
      if (e.key in PAGE_KEYS) return snapPage(PAGE_KEYS[e.key as keyof typeof PAGE_KEYS]);
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
      const letters = items.flatMap((item, i) => (item.identifier !== 0 && label(i) === e.key ? [i] : []));
      const group = items.flatMap((item, i) => (item.identifier !== 0 && item.groupAccelerator === e.key ? [i] : []));
      if (positional && letters.length > 1 && list.current) {
        // the same letter repeats every 52 rows; take the copy the player can actually see
        const box = list.current.getBoundingClientRect();
        const sticky = [...list.current.querySelectorAll<HTMLElement>(".menu-heading")]
          .filter((heading) => heading.getBoundingClientRect().top <= box.top + 1)
          .at(-1);
        const covered = sticky ? sticky.getBoundingClientRect().bottom : box.top;
        const shown = letters.find((i) => {
          const rect = list.current?.children[order.indexOf(i)]?.getBoundingClientRect();
          return rect && rect.bottom > covered && rect.top < box.bottom;
        });
        if (!shown) return;
        letters.splice(0, letters.length, shown);
      }
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
      reveal(hits[0]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // the core separates columns with tabs or runs of spaces; a grid lines up every row's,
  // and a row of columns that isn't an item starts where the items' text does
  const split = (item: MenuItem) => splitFields(item.text.trim());
  // menu_objsyms puts the class glyph on inventory headings as a "  ('x')" suffix. That is
  // decoration on the heading, not a menu column: treating it as one drops the uppercase
  // and indents the whole heading through the tabbed grid.
  const headingSymbol = (item: MenuItem, i: number) => {
    if (item.identifier !== 0 || !isHeading(item, items[i + 1])) return null;
    const fields = split(item);
    return fields.length === 2 && /^\('\S'\)$/.test(fields[1]) ? fields[1] : null;
  };
  const columns = Math.max(...items.map((item, i) => split(item).length - (headingSymbol(item, i) ? 1 : 0)));
  const fields = (item: MenuItem, style?: Record<string, string>, before?: ComponentChildren) =>
    split(item).map((f, n) => (
      <span class="menu-field" style={style}>
        {n === 0 ? before : null}
        {f}
      </span>
    ));
  // a tile or letter column only if some item has one
  const icon = tileBox(sheet, ICON, ICON);
  const hasTiles = items.some((item) => item.identifier !== 0 && item.tile >= 0);
  const hasLetters = items.some((item, i) => item.identifier !== 0 && label(i) !== "");
  const lead = [how === "any" && CHECK, hasTiles && icon.width, hasLetters && LETTER].filter((w): w is number => !!w);
  const grid = {
    // auto, as a subgrid row's padding goes into its edge tracks
    gridTemplateColumns: `repeat(${lead.length + columns}, auto) 1fr`,
  };
  // as in tty, text indented four spaces lines up with the items' text after "a - "
  const indented = (item: MenuItem) => {
    const spaces = item.text.length - item.text.trimStart().length;
    return spaces >= 4 && lead.length > 0 && items.some((other) => other.identifier !== 0);
  };
  const itemStart = `${lead.reduce((sum, w) => sum + w + GAP, 0)}px`;
  // inside the text, so a column menu's grid keeps its columns
  const taken = (i: number) => {
    const n = selected.current.get(i) ?? -1;
    return n > 0 ? <span class="menu-count">{n} of </span> : null;
  };

  // a heading or a line of text
  const line = (item: MenuItem, i: number) => {
    const heading = isHeading(item, items[i + 1]);
    const strong = heading && (item.attr === ATR_INVERSE || item.attr === ATR_BOLD);
    const kind = heading ? `menu-heading${strong ? " strong" : ""}` : "menu-line";
    const style = heading ? headingStyle(item) : textStyle(item.color, item.attr);
    const symbol = headingSymbol(item, i);
    if (symbol)
      return (
        <div class={`${kind} with-symbol`} style={style}>
          <span class="menu-heading-text">
            {split(item)[0]}
          </span>
          <span class="menu-heading-sym">{symbol}</span>
        </div>
      );
    if (columns > 1 && split(item).length > 1)
      return (
        <div class={`${kind} columns`} style={{ "--menu-lead": lead.length + 1 }}>
          {fields(item, style)}
        </div>
      );
    if (!heading && indented(item))
      return (
        <div class={kind} style={{ ...style, paddingLeft: `calc(14px + ${itemStart})` }}>
          {item.text.slice(4) || " "}
        </div>
      );
    return (
      <div class={kind} style={style}>
        {item.text || " "}
      </div>
    );
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
          onScroll={markScroll}
          onWheel={markScroll}
          onMouseLeave={how === "one" ? () => setHighlight(null) : undefined}
          class={`menu-items${columns > 1 ? " tabbed" : ""}${how === "none" ? " readonly" : ""}${how === "any" ? " pick-any" : ""}`}
          style={columns > 1 ? grid : undefined}
        >
          {order.map((i) => [items[i], i] as const).map(([item, i]) =>
            item.identifier === 0 ? (
              line(item, i)
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
                onMouseMove={how === "one" ? (e) => {
                  // WebKit sends a mousemove with no movement just after scrolling when the row
                  // moves under a still pointer; that is not the player pointing at a new row.
                  const samePlace = pointerBefore.current?.x === e.clientX && pointerBefore.current?.y === e.clientY;
                  const first = pointerBefore.current === null;
                  if (!e.movementX && !e.movementY && (samePlace || (first && performance.now() - scrolledAt.current < SCROLL_HUSH)))
                    return;
                  setHighlight(i);
                } : undefined}
                role={how === "any" ? "menuitemcheckbox" : undefined}
                aria-checked={how === "any" ? selected.current.has(i) : undefined}
              >
                {how === "any" ? <span class="menu-check" /> : null}
                {hasTiles ? (
                  <span
                    class="inv-icon"
                    style={{ width: `${icon.width}px`, height: `${icon.height}px`, ...tileStyle(sheet, item.tile, icon.width, icon.height) }}
                  />
                ) : null}
                {hasLetters ? <span class="inv-letter">{label(i)}</span> : null}
                {columns > 1 ? (
                  fields(item, textStyle(item.color, item.attr), taken(i))
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
          {count.current > 0 ? (
            <span class="hint">Count: {count.current}</span>
          ) : listsStack(how, items) ? (
            <span class="hint">Type a number, then a letter, for only that many.</span>
          ) : null}
          {how === "none" ? (
            <button class="primary" onClick={() => onDone(null)}>
              Close
            </button>
          ) : (
            <button onClick={() => onDone(null)}>Cancel</button>
          )}
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
