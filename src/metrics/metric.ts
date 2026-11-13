// What a replay metric sees and gives back. A metric reads only what a step carries, the game as the frontend shows it
// and the core's events, never files or the replay itself, so the same modules can run wherever a game is replayed or
// played: in Node over recordings, on the server, or one day in the game itself.
import type { GameState, Message } from "../port/state";
import type { ReplayedEvent } from "../worker/replayer";

/** One moment of the replay: each time the core waits for an answer. */
export interface Step {
  state: GameState;
  turn: number;
  /** The status line's level, as "Dlvl:3". */
  level: string;
  dungeon: string;
  /** The hero's square, by the core's mark on it; null when nothing marks it, as when invisible. */
  hero: { x: number; y: number } | null;
  /** Messages shown since the last step. */
  messages: Message[];
  /** The first step of a new game turn. */
  newTurn: boolean;
  /** What the core reported since the last step, as achievements and chronicle entries. */
  events: ReplayedEvent[];
  /**
   * The recorded answer about to be given, as ("k", "115") for a key; null if none. A step's messages and events are
   * what the answer before it brought about, not this one.
   */
  answer: { tag: string; rest: string } | null;
  /** How many answers came before this one. */
  index: number;
  /** The monster a glyph shows, by name, or null for another kind of glyph. */
  monsterName(glyph: number): string | null;
  /** The core's flags on a map square's glyph (display.h MG_*), by name without the prefix, as PET. */
  glyphFlag: Record<string, number>;
}

const HUNGER = ["Satiated", "", "Hungry", "Weak", "Fainting", "Fainted", "Starved"];

/** The status line as numbers: hunger 0 satiated to 6 starved, as NLE counts it; depth null off the numbered levels. */
export interface Vitals {
  turn: number;
  hp: number;
  hpmax: number;
  ac: number;
  xl: number;
  gold: number;
  hunger: number;
  depth: number | null;
  /** The status line's conditions, as "STONE", "FOODPOIS". */
  conditions: Set<string>;
}

const vitalsOf = new WeakMap<Step, Vitals>();

export function vitals(s: Step): Vitals {
  let v = vitalsOf.get(s);
  if (v) return v;
  const st = s.state.status;
  const num = (k: string) => Number((st[k]?.text ?? "").trim().match(/-?\d+$/)?.[0] ?? NaN);
  const depth = /^Dlvl:(\d+)/.exec(s.level);
  v = {
    turn: s.turn,
    hp: num("BL_HP"),
    hpmax: num("BL_HPMAX"),
    ac: num("BL_AC"),
    xl: num("BL_XP"),
    gold: num("BL_GOLD"),
    hunger: Math.max(0, HUNGER.indexOf((st.BL_HUNGER?.text ?? "").trim())),
    depth: depth ? Number(depth[1]) : null,
    conditions: new Set((st.BL_CONDITION?.text ?? "").split(" ").filter(Boolean)),
  };
  vitalsOf.set(s, v);
  return v;
}

/** The inventory's items, each with the heading of its class, as "Comestibles". */
export function inventory(s: Step): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  for (const item of s.state.inventory) {
    if (item.identifier === 0) heading = item.text.trim();
    else out.push({ heading, text: item.text });
  }
  return out;
}

export interface Params {
  /** For `messages`: the messages to keep. */
  pattern?: RegExp;
}

/**
 * A metric: "visible" ones use only what the player could see; "judge" ones, which never ship to players, also read the
 * core's hidden truth from a step that carries it (the bot tools' judge build).
 */
export interface Metric<S extends Step = Step> {
  name: string;
  tier: "visible" | "judge";
  /** A fresh counter for one game: fed every step, then asked for its JSON-able result. Keep step() cheap. */
  create(params: Params): { step(s: S): void; result(): unknown };
}

export const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const N = "n".charCodeAt(0);

type Placed = { x: number; y: number; d: number };
// one scan of the map a step, however many metrics ask
const nymphScan = new WeakMap<Step, Placed[]>();

/** Nymphs on the map within `radius` of the hero, with their distance. */
export function nymphsNear(s: Step, radius: number): Placed[] {
  let all = nymphScan.get(s);
  if (!all) {
    all = [];
    if (s.hero) for (const cell of s.state.map) if (cell && cell.ch === N) all.push({ x: cell.x, y: cell.y, d: chebyshev(cell, s.hero) });
    nymphScan.set(s, all);
  }
  return all.filter((n) => n.d <= radius);
}
