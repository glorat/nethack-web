// What the bot sees each time the game waits: what a player would see on the page.
import type { GameRequest, MenuItem } from "../../src/protocol";
import { COLNO, ROWNO } from "../../src/port/state";
import type { Session } from "../../tests/headless/harness";

export interface Observation {
  /** What the game waits for; "key" when it wants a command or other keystroke. */
  request: GameRequest | { kind: "key" };
  /** Row-major, ROWNO rows of COLNO; unexplored squares have the core's unexplored glyph. */
  glyphs: number[];
  /** The tile drawn, which for an object shows its appearance where the glyph would give away what it is. */
  tiles: number[];
  chars: number[];
  colors: number[];
  /** The core's MG_* flags for each square. */
  flags: number[];
  cursor: { x: number; y: number } | null;
  /** Status fields as the status panel shows them, by the core's BL_* names and the panel's own. */
  status: Record<string, string>;
  /** The BL_CONDITION bits. */
  conditions: number;
  /** Messages since the last observation. */
  messages: string[];
  inventory: { letter: string; text: string; tile: number }[];
  gameOver: string | null;
}

export class Observer {
  private lastMessage = 0;

  constructor(
    private session: Session,
    private unexplored: number,
  ) {}

  observe(): Observation {
    const { state, prompt } = this.session;
    const glyphs = new Array<number>(COLNO * ROWNO).fill(this.unexplored);
    const tiles = new Array<number>(COLNO * ROWNO).fill(-1);
    const chars = new Array<number>(COLNO * ROWNO).fill(32);
    const colors = new Array<number>(COLNO * ROWNO).fill(0);
    const flags = new Array<number>(COLNO * ROWNO).fill(0);
    state.map.forEach((cell, i) => {
      if (!cell) return;
      glyphs[i] = cell.glyph;
      tiles[i] = cell.tile;
      chars[i] = cell.ch;
      colors[i] = cell.color;
      flags[i] = cell.glyphFlags;
    });
    const messages = state.messages.filter((m) => m.id > this.lastMessage && !m.separator).map((m) => m.text);
    this.lastMessage = state.messages.at(-1)?.id ?? this.lastMessage;
    const status = Object.fromEntries(Object.entries(state.status).map(([k, v]) => [k, v.text]));
    return {
      request: prompt ?? { kind: "key" },
      glyphs,
      tiles,
      chars,
      colors,
      flags,
      cursor: state.cursor,
      status,
      conditions: state.status.BL_CONDITION?.mask ?? 0,
      messages,
      inventory: state.inventory.filter((i) => i.identifier !== 0).map((i: MenuItem) => ({
        letter: i.accelerator,
        text: i.text,
        tile: i.tile,
      })),
      gameOver: state.gameOver,
    };
  }
}
