// The items of a menu the core gave no letter get the next free one, so they can be typed.
import type { MenuHow, MenuItem } from "../protocol";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

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
