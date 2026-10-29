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
  /** inventoryKey is 0 unless the core is waiting for a command. */
  | { kind: "poskey"; inventoryKey: number }
  | { kind: "yn"; query: string; choices: string; defaultChoice: string }
  | { kind: "getlin"; query: string }
  | { kind: "menu"; how: MenuHow; prompt: string; items: MenuItem[] }
  | { kind: "text"; lines: { attr: number; text: string }[] }
  | { kind: "ext_cmd"; commands: ExtCommand[] }
  | { kind: "player"; choices: PlayerChoices };

export interface MenuSelection {
  identifier: number;
  count: number;
}

/** Answer types, matched to GameRequest by kind. */
export type Answer =
  | { kind: "yn"; key: string }
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
}

export type UiMessage =
  | { type: "start"; start: StartOptions }
  | { type: "key"; code: number }
  | { type: "click"; x: number; y: number; button: number }
  | { type: "answer"; id: number; answer: Answer }
  /** Farlook's text for a map square; answered with a "description" message of the same id. */
  | { type: "describe"; id: number; x: number; y: number };
