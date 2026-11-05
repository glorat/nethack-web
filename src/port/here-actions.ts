// The actions the core's here-menu offers where the hero stands (here_act_list in cmd.c), by the letter
// #hereaction takes, as the quick-action toolbar shows them.

export interface HereAction {
  letter: string;
  label: string;
  /** The default key, to learn, as the menu bar shows it. */
  key: string;
}

const ACTIONS: Record<string, Omit<HereAction, "letter">> = {
  a: { label: "Drink", key: "q" },
  b: { label: "Dip", key: "M-d" },
  c: { label: "Sit", key: "M-s" },
  d: { label: "Sacrifice", key: "M-o" },
  e: { label: "Go up", key: "<" },
  f: { label: "Go down", key: ">" },
  g: { label: "Dismount", key: "M-R" },
  h: { label: "Pick up", key: "," },
  i: { label: "Loot", key: "M-l" },
  j: { label: "Tip", key: "M-T" },
  k: { label: "Eat", key: "e" },
  r: { label: "Disarm", key: "M-u" },
};

// always offered, after what this square allows; the here-menu's Inventory, Drop and Look Here are left to the
// sidebar and the map
const FIXED: Record<string, Omit<HereAction, "letter">> = {
  o: { label: "Search", key: "s" },
  n: { label: "Rest", key: "." },
  q: { label: "Cast", key: "Z" },
};

/** The toolbar's buttons for the letters the core gave: this square's actions in the core's order, then the fixed ones. */
export function toolbarActions(letters: string): HereAction[] {
  const here = [...letters].filter((l) => ACTIONS[l]).map((letter) => ({ letter, ...ACTIONS[letter] }));
  const fixed = Object.keys(FIXED).filter((l) => letters.includes(l)).map((letter) => ({ letter, ...FIXED[letter] }));
  return [...here, ...fixed];
}
