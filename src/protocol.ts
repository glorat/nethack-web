// Messages between the game worker and the UI thread. The worker owns the
// WASM core; the UI only ever sees these types.

export type WindowKind = "message" | "status" | "map" | "menu" | "text";

export interface MapCell {
  x: number;
  y: number;
  glyph: number;
  tile: number;
  /** Floor tile drawn under transparent sprites; -1 when there is none. */
  bgTile: number;
  ch: number;
  color: number;
  glyphFlags: number;
  /** MARK_* bits from port/marks. */
  marks: number;
  /** ch as text, for ASCII mode. */
  symbol: string;
}

export interface MenuItem {
  /** Opaque value handed back to the core when the item is picked; 0 for headings. */
  identifier: number;
  accelerator: string;
  groupAccelerator: string;
  attr: number;
  color: number;
  text: string;
  tile: number;
  preselected: boolean;
}

export interface EquipmentSlot {
  /** Inventory letter of the item in this slot, or "" when empty. */
  letter: string;
  tile: number;
}

export interface StatusValue {
  text: string;
  color: number;
  percent: number;
  /** BL_CONDITION only: bitmask of the hero's conditions. */
  mask?: number;
  /** For a few turns after the value went up (1) or down (-1); improved says whether that was good. */
  change?: { direction: 1 | -1; improved: boolean };
}

export interface ExtCommand {
  index: number;
  name: string;
  description: string;
  autocompletes: boolean;
}

export type GameEvent =
  | { type: "ready" }
  | { type: "message"; text: string; attr: number }
  | { type: "map"; cells: MapCell[] }
  | { type: "map_clear" }
  | { type: "cursor"; x: number; y: number }
  | { type: "status"; fields: Record<string, StatusValue> }
  | { type: "inventory"; items: MenuItem[]; equipment: EquipmentSlot[] }
  | { type: "bell" }
  /** The options file, as #saveoptions rewrote it. */
  | { type: "options_file"; text: string }
  /** The tile_file option, as the game starts. */
  | { type: "tile_file"; name: string }
  /** font_size_message (or font_size_status), in points: as the game starts, or changed in the options menu. */
  | { type: "text_size"; size: number; atStart: boolean }
  /** The core's ascii_map option, changed in its options menu. */
  | { type: "ascii_map"; on: boolean }
  | { type: "game_over"; text: string }
  | { type: "error"; text: string };

export type MenuHow = "none" | "one" | "any";

/** Indexes into the core's roles[], races[], genders[] (male, female) and aligns[] (lawful, neutral, chaotic). */
export interface PlayerPick {
  role: number;
  race: number;
  gender: number;
  align: number;
}

export interface PlayerChoices {
  roles: { name: string; femaleName: string; tile: number; femaleTile: number }[];
  races: { name: string; tile: number; femaleTile: number }[];
  /** validRace[role][race] */
  validRace: boolean[][];
  /** validGender[role][race][gender] */
  validGender: boolean[][][];
  /** validAlign[role][race][align] */
  validAlign: boolean[][][];
  /** What the options chose already; negative where still open. */
  chosen: PlayerPick;
}

export type GameRequest =
  | { kind: "key" }
  /**
   * inventoryKey and commandKey (the extended command key) are 0 unless the core is waiting for a command,
   * or if nothing is bound to them.
   */
  | { kind: "poskey"; inventoryKey: number; commandKey: number; wizard: boolean }
  /** directions: for "In what direction?", the keys for W NW N NE E SE S SW down up. */
  | { kind: "yn"; query: string; choices: string; defaultChoice: string; directions?: string }
  | { kind: "getlin"; query: string }
  /** unlisted: letters the menu takes as answers though it doesn't list them, each answered with its char code. */
  | { kind: "menu"; how: MenuHow; prompt: string; items: MenuItem[]; unlisted: string }
  | { kind: "text"; lines: { attr: number; text: string }[] }
  | { kind: "ext_cmd"; commands: ExtCommand[] }
  | { kind: "player"; choices: PlayerChoices };

export interface MenuSelection {
  identifier: number;
  count: number;
}

/** Answer types, matched to GameRequest by kind. */
export type Answer =
  /** count: with key "#", how many to take. */
  | { kind: "yn"; key: string; count?: number }
  | { kind: "getlin"; text: string | null }
  | { kind: "menu"; selection: MenuSelection[] | null }
  | { kind: "text" }
  | { kind: "ext_cmd"; index: number }
  | ({ kind: "player" } & PlayerPick);

export type WorkerMessage =
  | { type: "events"; events: GameEvent[] }
  | { type: "request"; id: number; request: GameRequest }
  | { type: "description"; id: number; text: string | null };

export interface StartOptions {
  /** Base URL that nethack.js and nethack.wasm are served from. */
  assetBase: string;
  /** NETHACKOPTIONS, e.g. "name:Agnes,role:Valkyrie". */
  options: string;
  /** The .nethackrc the game reads, before NETHACKOPTIONS. */
  config: string;
}

export type UiMessage =
  | { type: "start"; start: StartOptions }
  | { type: "key"; code: number }
  | { type: "click"; x: number; y: number; button: number }
  | { type: "ascii_map"; on: boolean }
  | { type: "answer"; id: number; answer: Answer }
  /** Farlook's text for a map square; answered with a "description" message of the same id. */
  | { type: "describe"; id: number; x: number; y: number };
