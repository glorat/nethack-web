// The items of a menu the core gave no letter get the next free one, so they can be typed.
import type { MenuHow, MenuItem } from "../protocol";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The label a selectable row gets by its displayed position, said the way tty does. */
export function letterAt(position: number): string {
  return LETTERS[position % LETTERS.length];
}

/** The label every selectable row shows, by its place in the displayed order. */
export function positionalLetters(items: MenuItem[], order: number[], how: MenuHow): Map<number, string> {
  const selectable = order.filter((i) => items[i].identifier !== 0);
  if (how === "none" || selectable.length <= 52)
    return new Map(order.flatMap((i) => (items[i].identifier === 0 ? [] : [[i, items[i].accelerator] as const])));
  return new Map(selectable.map((i, position) => [i, letterAt(position)]));
}

export function withLetters(how: MenuHow, items: MenuItem[]): MenuItem[] {
  if (how === "none") return items;
  const used = new Set(items.map((i) => i.accelerator));
  let next = 0;
  return items.map((item) => {
    if (item.identifier === 0 || item.accelerator) return item;
    while (next < LETTERS.length && used.has(LETTERS[next])) next++;
    return next < LETTERS.length ? { ...item, accelerator: LETTERS[next++] } : item;
  });
}
