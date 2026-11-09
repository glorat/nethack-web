// Messages between the game worker and the UI thread. The worker owns the
// WASM core; the UI only ever sees these types.
import type { GameState } from "./port/state";

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
  /** The core cleared the message window, as it does each turn. */
  | { type: "message_clear" }
  | { type: "map"; cells: MapCell[] }
  | { type: "map_clear" }
  | { type: "cursor"; x: number; y: number }
  | { type: "status"; fields: Record<string, StatusValue> }
  | { type: "inventory"; items: MenuItem[]; equipment: EquipmentSlot[] }
  | { type: "bell" }
  /** The options file, as #saveoptions rewrote it. */
  | { type: "options_file"; text: string }
  /** An option the player chose in the game, such as "!tutorial", to keep in the options file. */
  | { type: "keep_option"; option: string }
  /** The tile_file option, as the game starts. */
  | { type: "tile_file"; name: string }
  /** font_size_message (or font_size_status), in points: as the game starts, or changed in the options menu. */
  | { type: "text_size"; size: number; atStart: boolean }
  /** The core's ascii_map option, changed in its options menu. */
  | { type: "ascii_map"; on: boolean }
  | { type: "game_over"; text: string }
  /** Lines added to the game's recording, as they're written; `atPrompt` once the core is waiting and all it did is there. */
  | { type: "recorded"; lines: string[]; atPrompt: boolean }
  /** What the recording of a game that has come back already held. */
  | { type: "recorded_before"; text: string }
  /** The whole recording of a game that has ended. */
  | { type: "recording"; text: string }
  /** An offline game has ended, and this is the high score file it left, with the last line of the game log: the latest game to score. */
  | { type: "scores"; text: string; last?: string | undefined }
  /** An online game that can't be replayed, and so can't come back. */
  | { type: "game_lost" }
  /** Writing the game to the browser's storage has started or stopped failing. */
  | { type: "save_failing"; failing: boolean }
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
   * inventoryKey, commandKey (the extended command key) and repeatKey are 0 unless the core is waiting for a command,
   * or if nothing is bound to them. hereActions: what the hero can do where they stand, by their names for
   * #hereaction separated by spaces, or "" unless the core is waiting for a command.
   */
  | { kind: "poskey"; inventoryKey: number; commandKey: number; repeatKey: number; hereActions: string; wizard: boolean }
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

/** A seed from the server; for an injected seed, how many turns after its point the next goes in, and how many turns before that to ask for it. */
export interface SeedReply {
  seed: number;
  now: number;
  validTurns: number;
  askAheadTurns: number;
}

export type WorkerMessage =
  | { type: "events"; events: GameEvent[] }
  | { type: "request"; id: number; request: GameRequest }
  | { type: "description"; id: number; text: string | null }
  /** #terrain's known map without monsters and objects, the core's glyphs row by row, for a bot driving the page. */
  | { type: "terrain"; id: number; glyphs: number[] | null }
  | { type: "debug_files"; id: number; files: Record<string, Uint8Array>; bones: Record<string, Uint8Array> }
  | { type: "shadow_status"; status: ShadowStatus }
  /** The core wants a seed for an online game, or with `turn`, one to inject; answered with a "seed_reply" of the same id. */
  | { type: "seed_request"; id: number; turn?: number }
  | ReplayMessage;

/** How a second core following the game by its recording is getting on. */
export interface ShadowStatus {
  state: "following" | "ended" | "mismatch" | "unrecorded";
  turn: number;
  /** Where it went differently. */
  message?: string;
  /** Its game files when it did. */
  files?: Record<string, Uint8Array>;
}

/** What a replay tells the page, besides the game's own events. */
export type ReplayMessage =
  /** A prompt the player answered, shown for a moment; null once it's answered. */
  | { type: "replay_prompt"; request: GameRequest | null }
  /** Everything a seek skipped over, all at once. */
  | { type: "replay_state"; state: GameState }
  | { type: "replay_progress"; progress: ReplayProgress };

export interface ReplayProgress {
  turn: number;
  /** The recording line the replay is waiting to answer, counting from 1; 0 before the first. */
  line: number;
  playing: boolean;
  /** Going ahead to a turn without showing the way. */
  seeking: boolean;
  /** Where the replay stopped: at the recording's end, or where the game went differently. */
  ended: null | { error: string | null };
}

export type ReplayControl =
  | { action: "play" }
  | { action: "pause" }
  /** Plays to the next turn, then pauses. */
  | { action: "step" }
  /** Turns a second; Infinity as fast as the core goes. */
  | { action: "speed"; turnsPerSecond: number }
  /** Plays again from the start, without showing it, up to this turn, then pauses there, or plays on if `play`. */
  | { action: "seek"; turn: number; play?: boolean }
  /** Likewise, up to just after this recording line, so whatever it did has happened. */
  | { action: "seek"; line: number; play?: boolean };

/** The values a game would otherwise take from the machine, as a replay has them from its recording. */
export interface FixedInputs {
  /** The first seed; each one asked for after it is one more, as different as real ones, not all the same. */
  seed: number;
  /** Seconds since 1970, for every time the core reads. */
  now: number;
  /** Seconds east of UTC. */
  utcOffset: number;
  uuid: string;
}

/** Who answers for what decides a game's outcome. */
export type AuthorityChoice =
  | { kind: "browser" }
  | { kind: "fixed"; inputs: FixedInputs }
  /** The server answers: the page asks it for each seed, and the time comes with the seed. */
  /** `recording` is the game so far, from the server, for a game that's coming back. */
  | { kind: "online"; game: string; utcOffset: number; recording: string; now: number };

export interface StartOptions {
  /** Base URL that nethack.js and nethack.wasm are served from. */
  assetBase: string;
  /** NETHACKOPTIONS, e.g. "name:Agnes,role:Valkyrie". */
  options: string;
  /** The .nethackrc the game reads, before NETHACKOPTIONS. */
  config: string;
  /** A shadow is following, and needs what a game that comes back had already recorded. */
  shadowed?: boolean;
  authority: AuthorityChoice;
}

export type UiMessage =
  | { type: "start"; start: StartOptions }
  /** Plays a recording instead of a game. */
  | { type: "replay"; assetBase: string; text: string; turnsPerSecond: number }
  | { type: "replay_control"; control: ReplayControl }
  /** Becomes a shadow: follows a game by the recording lines it's sent. */
  | { type: "shadow"; assetBase: string }
  | { type: "shadow_before"; text: string }
  | { type: "shadow_lines"; lines: string[]; atPrompt: boolean }
  /** The game's files, and these bones; answered with a "debug_files" message of the same id. */
  | { type: "debug_files"; id: number; hashes: string[] }
  | { type: "key"; code: number }
  | { type: "click"; x: number; y: number; button: number }
  | { type: "ascii_map"; on: boolean }
  | { type: "answer"; id: number; answer: Answer }
  | ({ type: "seed_reply"; id: number } & SeedReply)
  /** Farlook's text for a map square; answered with a "description" message of the same id. */
  | { type: "describe"; id: number; x: number; y: number }
  /** #terrain's known map, for a bot driving the page; answered with a "terrain" message of the same id. */
  | { type: "terrain"; id: number };
