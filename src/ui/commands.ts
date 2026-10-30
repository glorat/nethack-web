// The menu bar's commands, grouped as Cocoa's menu bar groups them. A command runs by its
// extended command name, so number_pad and key bindings can't change what it does; the key
// shown is the default one, to learn.

export interface CommandItem {
  title: string;
  /** Extended command name. */
  command: string;
  key?: string;
  /** Under the item before, as Cocoa indents the Info menu's "Current ..." items. */
  indent?: boolean;
}

export interface Menu {
  title: string;
  /** null is a separator. */
  items: (CommandItem | null)[];
}

const c = (title: string, command: string, key?: string): CommandItem => ({ title, command, key });
const under = (title: string, command: string, key: string): CommandItem => ({ title, command, key, indent: true });

export const GAME_MENU: (CommandItem | null)[] = [
  c("Options", "options", "O"),
  c("Toggle Auto Pickup", "autopickup", "@"),
  c("Explore Mode", "exploremode", "M-X"),
  null,
  c("Version", "versionshort", "V"),
  c("Extended Version", "version", "M-v"),
  c("History", "history"),
  null,
  c("Save & Quit", "save", "S"),
];

export const COMMAND_MENUS: Menu[] = [
  {
    title: "Move",
    items: [
      c("North", "movenorth", "k"),
      c("South", "movesouth", "j"),
      c("East", "moveeast", "l"),
      c("West", "movewest", "h"),
      c("North-East", "movenortheast", "u"),
      c("North-West", "movenorthwest", "y"),
      c("South-East", "movesoutheast", "n"),
      c("South-West", "movesouthwest", "b"),
      null,
      c("Up", "up", "<"),
      c("Down", "down", ">"),
      null,
      c("Travel", "travel", "_"),
      null,
      c("Rest", "wait", "."),
      c("Search", "search", "s"),
      c("Jump", "jump", "M-j"),
      c("Sit", "sit", "M-s"),
      c("Ride", "ride", "M-R"),
    ],
  },
  {
    title: "Items",
    items: [
      c("Pick Up", "pickup", ","),
      c("Drop", "drop", "d"),
      c("Drop Many", "droptype", "D"),
      null,
      c("Eat", "eat", "e"),
      c("Quaff Potion", "quaff", "q"),
      c("Read Scroll/Book", "read", "r"),
      c("Apply", "apply", "a"),
      c("Dip", "dip", "M-d"),
      c("Rub", "rub", "M-r"),
      c("Engrave", "engrave", "E"),
      null,
      c("Adjust Letters", "adjust", "M-a"),
      c("Name", "name", "M-n"),
      c("Call Type", "call", "C"),
    ],
  },
  {
    title: "Gear",
    items: [
      c("Remove All Armor", "takeoffall", "A"),
      null,
      c("Wield Weapon", "wield", "w"),
      c("Exchange Weapons", "swap", "x"),
      c("Two Weapon Combat", "twoweapon", "X"),
      c("Load Quiver", "quiver", "Q"),
      null,
      c("Wear Armor", "wear", "W"),
      c("Take Off Armor", "takeoff", "T"),
      null,
      c("Put On Non-Armor", "puton", "P"),
      c("Remove Non-Armor", "remove", "R"),
    ],
  },
  {
    title: "Act",
    items: [
      c("Fight", "fight", "F"),
      c("Fire From Quiver", "fire", "f"),
      c("Throw", "throw", "t"),
      c("Kick", "kick", "^D"),
      c("Force", "force", "M-f"),
      null,
      c("Open Door", "open", "o"),
      c("Close Door", "close", "c"),
      c("Untrap", "untrap", "M-u"),
      c("Loot", "loot", "M-l"),
      null,
      c("Chat", "chat", "M-c"),
      c("Pay", "pay", "p"),
      c("Wipe Face", "wipe", "M-w"),
      c("Enhance Skills", "enhance", "M-e"),
    ],
  },
  {
    title: "Magic",
    items: [
      c("Zap Wand", "zap", "z"),
      c("Cast Spell", "cast", "Z"),
      c("Invoke", "invoke", "M-i"),
      c("Teleport", "teleport", "^T"),
      c("Monster Ability", "monster", "M-m"),
      c("Turn Undead", "turn", "M-t"),
      null,
      c("Offer Sacrifice", "offer", "M-o"),
      c("Pray", "pray", "M-p"),
    ],
  },
  {
    title: "Info",
    items: [
      c("Inventory", "inventory", "i"),
      c("Inventory By Type", "inventtype", "I"),
      null,
      c("Look Here", "look", ":"),
      c("Look At Map Spot", "glance", ";"),
      c("What's This Symbol", "whatis", "/"),
      c("Identify Trap", "showtrap", "^"),
      c("What Does a Key Do", "whatdoes", "&"),
      null,
      c("Current Equipment", "seeall", "*"),
      under("Current Weapon", "seeweapon", ")"),
      under("Current Armor", "seearmor", "["),
      under("Current Rings", "seerings", "="),
      under("Current Amulet", "seeamulet", '"'),
      under("Current Tools", "seetools", "("),
      c("Count Gold", "showgold", "$"),
      null,
      c("Attributes", "attributes", "^X"),
      c("Conduct", "conduct", "M-C"),
      c("Discoveries", "known", "\\"),
      c("Known Spells", "showspells", "+"),
      null,
      c("Dungeon Overview", "overview", "^O"),
      c("Journal", "chronicle", "v"),
      c("Terrain", "terrain"),
    ],
  },
];
