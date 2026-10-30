// A menu's items in A–Z order, as Cocoa's Sort A–Z sorts them: by name, past counts and descriptions.
import type { MenuItem } from "../protocol";

const PREFIXES = [
  "a ", "an ", "the ", "blessed ", "cursed ", "uncursed ",
  "very ", "thoroughly ", "rustproof ", "fireproof ", "corrodeproof ", "fixed ",
  "rusty ", "burnt ", "corroded ", "rotted ", "partly eaten ",
];

/** "2 blessed +1 daggers" sorts as "daggers". */
export function sortKey(title: string): string {
  let s = title;
  for (let changed = true; changed; ) {
    changed = false;
    const number = /^[+-]?\d+ /.exec(s);
    if (number) {
      s = s.slice(number[0].length);
      changed = true;
    }
    for (const prefix of PREFIXES) {
      if (s.startsWith(prefix)) {
        s = s.slice(prefix.length);
        changed = true;
      }
    }
  }
  return s;
}

/** "a +0 dagger (in quiver)" is named "a +0 dagger": what is in the first parentheses is a detail. */
function withoutDetail(text: string): string {
  const open = text.indexOf(" (");
  return open >= 0 && text.indexOf(")", open) > open + 2 ? text.slice(0, open) : text;
}

/** The order to show `items` in: each run of items between headings sorted, headings left in place. */
export function sortedOrder(items: MenuItem[]): number[] {
  const order = items.map((_, i) => i);
  const byName = (a: number, b: number) =>
    sortKey(withoutDetail(items[a].text)).localeCompare(sortKey(withoutDetail(items[b].text)), undefined, { sensitivity: "base" });
  for (let start = 0; start < order.length; ) {
    if (items[start].identifier === 0) {
      start++;
      continue;
    }
    let end = start;
    while (end < order.length && items[end].identifier !== 0) end++;
    order.splice(start, end - start, ...order.slice(start, end).sort(byName));
    start = end;
  }
  return order;
}
