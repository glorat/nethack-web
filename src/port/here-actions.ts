// The actions the core's here-menu offers where the hero stands (here_acts in cmd.c), by the name
// #hereaction takes, as the quick-action toolbar shows them.

export interface HereAction {
  name: string;
  label: string;
  /** The default key, to learn, as the menu bar shows it. */
  key: string;
}

const ACTIONS: Record<string, Omit<HereAction, "name">> = {
  quaff: { label: "Drink", key: "q" },
  dip: { label: "Dip", key: "M-d" },
  sit: { label: "Sit", key: "M-s" },
  offer: { label: "Sacrifice", key: "M-o" },
  up: { label: "Go up", key: "<" },
  down: { label: "Go down", key: ">" },
  dismount: { label: "Dismount", key: "M-R" },
  pickup: { label: "Pick up", key: "," },
  loot: { label: "Loot", key: "M-l" },
  tip: { label: "Tip", key: "M-T" },
  eat: { label: "Eat", key: "e" },
  untrap: { label: "Disarm", key: "M-u" },
};

// always offered, after what this square allows; the here-menu's Inventory, Drop and Look Here are left to the
// sidebar and the map
const FIXED: Record<string, Omit<HereAction, "name">> = {
  search: { label: "Search", key: "s" },
  rest: { label: "Rest", key: "." },
  cast: { label: "Cast", key: "Z" },
};

/**
 * The toolbar's buttons for the names the core gave, separated by spaces: this square's actions in the core's order, then the fixed ones.
 * Without Go up where it would leave the dungeon, which ends the game: the menus and `<` still offer it.
 */
export function toolbarActions(names: string, leavesDungeon = false): HereAction[] {
  const given = names.split(" ").filter((n) => n && !(leavesDungeon && n === "up"));
  const here = given.filter((n) => ACTIONS[n]).map((name) => ({ name, ...ACTIONS[name] }));
  const fixed = Object.keys(FIXED).filter((n) => given.includes(n)).map((name) => ({ name, ...FIXED[name] }));
  return [...here, ...fixed];
}
