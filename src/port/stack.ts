import type { MenuHow, MenuItem } from "../protocol";

/** A menu to pick from that lists a stack of something, such as "12 daggers", where a count takes only some. */
export function listsStack(how: MenuHow, items: MenuItem[]): boolean {
  if (how === "none") return false;
  return items.some((item) => item.identifier !== 0 && item.tile >= 0 && Number(/^(\d+) /.exec(item.text.trim())?.[1]) > 1);
}
