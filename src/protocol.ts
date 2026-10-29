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

export type GameRequest =
  | { kind: "key" }
  | { kind: "poskey" }
  | { kind: "yn"; query: string; choices: string; defaultChoice: string }
  | { kind: "getlin"; query: string }
  | { kind: "menu"; how: MenuHow; prompt: string; items: MenuItem[] }
  | { kind: "text"; lines: { attr: number; text: string }[] }
  | { kind: "ext_cmd"; commands: ExtCommand[] };

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
  | { kind: "ext_cmd"; index: number };

export type WorkerMessage =
  | { type: "events"; events: GameEvent[] }
  | { type: "request"; id: number; request: GameRequest };

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
  | { type: "answer"; id: number; answer: Answer };
