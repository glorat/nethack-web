// What a new player is told the first time they come to a place, until they've opened the hint once.

export interface Hint {
  id: string;
  /** Keys are written in backticks, as `p`, to be shown as keys. */
  tip: string;
  /** What to search the NetHack Wiki for. */
  wiki: string;
}

export const HINTS = {
  goal: {
    id: "goal",
    tip: "Your goal is the Amulet of Yendor, far below at the bottom of the dungeon. Find the stairs down, shown as `>`, and go down them.",
    wiki: "Amulet of Yendor",
  },
  shop: {
    id: "shop",
    tip: "You're in a shop. Pick up what you want, then pay with `p` before you leave. Drop something of yours to be offered a price for it. Don't leave without paying: shopkeepers are deadly when angry.",
    wiki: "Shop",
  },
  altar: {
    id: "altar",
    tip: "Sacrifice the fresh corpse of a monster you've just killed to please your god, but only on your own god's altar. Look with `:` to see whose this is. Drop things on any altar to learn which are cursed: a black flash means cursed, an amber one blessed.",
    wiki: "Altar",
  },
  fountain: {
    id: "fountain",
    tip: "Drinking from a fountain or dipping into it is a gamble. Usually little happens, but it can bring out snakes, or a demon that's deadly to a new hero.",
    wiki: "Fountain",
  },
  mines: {
    id: "mines",
    tip: "You're in the Gnomish Mines, a branch off the main dungeon. Many of the gnomes, dwarves and hobbits here will fight you, and a dwarf with an axe or a pick can kill a new hero in a few blows. A town a few levels down usually has shops and a temple.",
    wiki: "Gnomish Mines",
  },
  sokoban: {
    id: "sokoban",
    tip: "Sokoban is a puzzle: push the boulders into the holes to reach the stairs up. A boulder moves only straight ahead, and only if nothing is behind it. Getting past it any other way, such as by breaking boulders, brings you bad luck.",
    wiki: "Sokoban",
  },
} as const satisfies Record<string, Hint>;

export type HintId = keyof typeof HINTS;

const MINES_KIN =
  "You're in the Gnomish Mines, a branch off the main dungeon. As one of their own kind, most of the gnomes and dwarves here are peaceful to you. A town a few levels down usually has shops and a temple.";

/** A hint's text for this hero, from the status panel's hero kind, as "gnomish valkyrie" or "(dwarvish) newt". */
export function hintTip(id: HintId, heroKind: string): string {
  if (id === "mines" && /^\(?(gnomish|dwarvish)\b/.test(heroKind.trim())) return MINES_KIN;
  return HINTS[id].tip;
}

/** A tip as text and keys, for keys written in backticks. */
export function tipParts(tip: string): { text: string; key?: boolean }[] {
  return tip.split(/`([^`]+)`/).map((text, i) => (i % 2 ? { text, key: true } : { text })).filter((p) => p.text);
}

/** The toolbar action each hint marks: fountains alone offer Dip, and altars Sacrifice. */
export const ACTION_HINTS: Record<string, HintId> = { dip: "fountain", offer: "altar" };

/** Whether the up stairs here lead out of the dungeon, ending the game. */
export function leavesDungeon(dungeon: string, level: number): boolean {
  return dungeon === "The Dungeons of Doom" && level === 1;
}

/** The hint for where the hero is: the goal at the top of the dungeon, or the branch they're in. */
export function dungeonHint(dungeon: string, level: number): HintId | null {
  if (leavesDungeon(dungeon, level)) return "goal";
  if (dungeon === "The Gnomish Mines") return "mines";
  if (dungeon === "Sokoban") return "sokoban";
  return null;
}

// the core's shtypes[] in shknam.c
const SHOP_TYPES = [
  "general store", "used armor dealership", "second-hand bookstore", "liquor emporium", "antique weapons outlet",
  "delicatessen", "jewelers", "quality apparel and accessories", "hardware store", "rare books", "health food store",
  "lighting store",
];

// u_entered_shop() in shk.c: the shopkeeper's welcome, or what a deaf hero or one with a mute shopkeeper is told
const SHOP_ENTERED = new RegExp(`(?:Welcome(?: again)? to |^You enter ).+ (?:${SHOP_TYPES.join("|")})(?: again)?!"?$`);

/** The hint for a message, as the one that says you've walked into a shop. */
export function messageHint(text: string): HintId | null {
  return SHOP_ENTERED.test(text) ? "shop" : null;
}

/** The hints opened, from what was kept on this device; anything unreadable counts as none. */
export function parseSeen(saved: string | null): Set<string> {
  try {
    const ids: unknown = JSON.parse(saved ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
