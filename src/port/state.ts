// Game state as the UI sees it, folded from worker events. No DOM here.
import type { EquipmentSlot, GameEvent, MapCell, MenuItem, StatusValue } from "../protocol";

export const COLNO = 80;
export const ROWNO = 21;
export const MAX_MESSAGES = 200;

export interface Message {
  id: number;
  text: string;
  attr: number;
  /** Turn-ish grouping: messages since the player's last input share a batch. */
  batch: number;
}

export interface GameState {
  started: boolean;
  /** Row-major, COLNO * ROWNO; null where nothing has been drawn. */
  map: (MapCell | null)[];
  cursor: { x: number; y: number } | null;
  messages: Message[];
  status: Record<string, StatusValue>;
  inventory: MenuItem[];
  equipment: EquipmentSlot[];
  gameOver: string | null;
  /** The core's ascii_map option as last changed in its options menu; null until then. */
  asciiMap: boolean | null;
  /** font_size_message as last set in the options; null until then. */
  textSize: number | null;
  /** The tile_file option; null if it isn't set. */
  tileFile: string | null;
  /** The options file as #saveoptions last rewrote it; null if it hasn't. */
  optionsFile: string | null;
  error: string | null;
  batch: number;
  nextMessageId: number;
}

export function initialState(): GameState {
  return {
    started: false,
    map: new Array(COLNO * ROWNO).fill(null),
    cursor: null,
    messages: [],
    status: {},
    inventory: [],
    equipment: [],
    gameOver: null,
    asciiMap: null,
    textSize: null,
    tileFile: null,
    optionsFile: null,
    error: null,
    batch: 0,
    nextMessageId: 1,
  };
}

export function applyEvents(state: GameState, events: GameEvent[]): GameState {
  let next = state;
  let map: (MapCell | null)[] | null = null;
  for (const event of events) {
    switch (event.type) {
      case "ready":
        next = { ...next, started: true };
        break;
      case "map":
        map ??= next.map.slice();
        for (const cell of event.cells) {
          if (cell.x >= 0 && cell.x < COLNO && cell.y >= 0 && cell.y < ROWNO) map[cell.y * COLNO + cell.x] = cell;
        }
        break;
      case "map_clear":
        map = new Array(COLNO * ROWNO).fill(null);
        break;
      case "cursor":
        next = { ...next, cursor: { x: event.x, y: event.y } };
        break;
      case "message": {
        if (!event.text.trim()) break;
        const message = { id: next.nextMessageId, text: event.text, attr: event.attr, batch: next.batch };
        next = {
          ...next,
          messages: [...next.messages, message].slice(-MAX_MESSAGES),
          nextMessageId: next.nextMessageId + 1,
        };
        break;
      }
      case "status":
        next = { ...next, status: event.fields };
        break;
      case "inventory":
        next = { ...next, inventory: event.items, equipment: event.equipment };
        break;
      case "game_over":
        next = { ...next, gameOver: event.text };
        break;
      case "error":
        next = { ...next, error: event.text };
        break;
      case "options_file":
        next = { ...next, optionsFile: event.text };
        break;
      case "tile_file":
        next = { ...next, tileFile: event.name };
        break;
      case "text_size":
        next = { ...next, textSize: event.size };
        break;
      case "ascii_map":
        next = { ...next, asciiMap: event.on };
        break;
      case "bell":
        break;
    }
  }
  return map ? { ...next, map } : next;
}

/** Called when the player acts, so new messages start a fresh batch. */
export function nextBatch(state: GameState): GameState {
  return { ...state, batch: state.batch + 1 };
}

export function cellAt(state: GameState, x: number, y: number): MapCell | null {
  return state.map[y * COLNO + x] ?? null;
}
