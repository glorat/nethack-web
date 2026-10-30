// With force_invmenu, a command's item prompt is a menu of likely items, where the text prompt it
// replaces took any inventory letter; such a menu offers '*' to list everything.
import type { MenuHow, MenuItem } from "../protocol";

const LIST_EVERYTHING = "*".charCodeAt(0);

/**
 * The letters of what is carried (`carried`, from the core, not the sidebar, which can be out of date)
 * that such a menu should also take, though it doesn't list them; none for other menus.
 */
export function unlistedLetters(how: MenuHow, items: MenuItem[], carried: string): string {
  const asksForItem =
    how === "one" && items.some((i) => i.identifier === LIST_EVERYTHING && i.text.startsWith("(list everything)"));
  if (!asksForItem) return "";
  const listed = new Set(items.map((i) => i.accelerator));
  return [...carried].filter((c) => !listed.has(c)).join("");
}
