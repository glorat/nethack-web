// The game as the NetHack Learning Environment (NLE) shows it, for bots written for NLE: its observation arrays,
// and a terminal that takes keystrokes as tty does, drawing menus, text windows and --More-- on the screen and
// sending the game only a finished answer.
//
// Glyphs follow NLE's NetHack 3.6 layout, with each range sized by this core (NUMMONS, NUM_OBJECTS and so on, in
// nhdata.json); a bot takes its monster and object tables from nhdata.json, not from NLE. The core's finer glyphs
// fold into that layout: male and female monsters, walls by branch, altars by alignment, piles. An object's glyph is
// the object its tile shows, its appearance, on the map and in the inventory alike, as the inventory has only tiles.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Answer, GameRequest } from "../../src/protocol";
import type { Observation } from "./observe";

export const ROWNO = 21;
export const COLNO = 80;
const ROWS = 24;
const INV = 55;
const INV_WIDTH = 80;
const MESSAGE = 256;

const ESC = 27;
const ENTER = 13;
const NEWLINE = 10;
const SPACE = 32;

/** Indexes into blstats, as NLE has them. */
export const BL = {
  X: 0, Y: 1, STR25: 2, STR125: 3, DEX: 4, CON: 5, INT: 6, WIS: 7, CHA: 8, SCORE: 9, HP: 10, HPMAX: 11, DEPTH: 12,
  GOLD: 13, ENE: 14, ENEMAX: 15, AC: 16, HD: 17, XP: 18, EXP: 19, TIME: 20, HUNGER: 21, CAP: 22, DNUM: 23, DLEVEL: 24,
  CONDITION: 25, ALIGN: 26,
} as const;

// NetHack 3.6's glyph flags and condition bits, which NLE gives
const MG36: Record<string, number> = {
  MG_CORPSE: 0x01, MG_INVIS: 0x02, MG_DETECT: 0x04, MG_PET: 0x08, MG_RIDDEN: 0x10, MG_STATUE: 0x20, MG_OBJPILE: 0x40,
  MG_BW_LAVA: 0x80,
};
const CONDITIONS36: Record<string, number> = {
  STONE: 0x1, SLIME: 0x2, STRNGL: 0x4, FOODPOIS: 0x8, TERMILL: 0x10, BLIND: 0x20, DEAF: 0x40, STUN: 0x80, CONF: 0x100,
  HALLU: 0x200, LEV: 0x400, FLY: 0x800, RIDE: 0x1000,
};

const DUNGEONS: Record<string, number> = {
  "The Dungeons of Doom": 0, Gehennom: 1, "The Gnomish Mines": 2, "The Quest": 3, Sokoban: 4, "Fort Ludios": 5,
  "Vlad's Tower": 6, "The Elemental Planes": 7,
};
// the inventory's class headings, in class order (names[] in the core's invent.c)
const HEADINGS = [
  "Illegal objects", "Weapons", "Armor", "Rings", "Amulets", "Tools", "Comestibles", "Potions", "Scrolls",
  "Spellbooks", "Wands", "Coins", "Gems/Stones", "Boulders/Statues", "Iron balls", "Chains", "Venoms",
];
const HUNGER: Record<string, number> = { Satiated: 0, "": 1, Hungry: 2, Weak: 3, Fainting: 4, Fainted: 5 };
const CAPACITY: Record<string, number> = { "": 0, Burdened: 1, Stressed: 2, Strained: 3, Overtaxed: 4, Overloaded: 5 };
const ALIGN: Record<string, number> = { Chaotic: -1, Neutral: 0, Lawful: 1 };
// the questions after the game ends, which NLE's episode doesn't include
const END = ["Do you want your possessions identified?", "Do you want to see "];

export interface NhData {
  consts: Record<string, number>;
  cmap: Record<string, number>;
  object_tiles: number[];
  objects: { class: number }[];
}

export function loadNhData(): NhData {
  const file = resolve(__dirname, "nhdata.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as NhData;
  } catch {
    throw new Error("no tools/bot/nhdata.json: run tools/bot/nhdata/build.sh");
  }
}

/** NLE's observation: each array flat, row by row, in the shape its key's comment gives. */
export interface NleObservation {
  /** 21×79, int16: the map from column 1. */
  glyphs: number[];
  /** 21×79 */
  chars: number[];
  /** 21×79 */
  colors: number[];
  /** 21×79: NetHack 3.6's MG_* flags. */
  specials: number[];
  /** 27: indexed by BL. */
  blstats: number[];
  /** 256 bytes of UTF-8, zero-padded. */
  message: number[];
  /** 55 */
  inv_glyphs: number[];
  /** 55×80 bytes, each item's text zero-padded. */
  inv_strs: number[];
  /** 55 */
  inv_letters: number[];
  /** 55 */
  inv_oclasses: number[];
  /** 24×80 */
  tty_chars: number[];
  /** 24×80 */
  tty_colors: number[];
  /** [row, column] */
  tty_cursor: number[];
  /** [waiting for a yes/no answer, for a typed line, for a key to go on past --More--] */
  misc: number[];
  /** The episode is over: the hero has died, or the game ended otherwise. */
  done: boolean;
}

/** What the game is to be given, once the bot's keys make one. */
export type GameAction = { key: number } | { answer: Answer | null };

type Menu = Extract<GameRequest, { kind: "menu" }>;

/** Each choosable item's letter: its own, or for a menu whose items run past the letters it gave, an unused one, as a
 * terminal's later pages would give. */
function menuLetters(request: Menu): Map<number, string> {
  const items = request.items.filter((i) => i.identifier);
  const used = new Set(items.filter((i) => i.accelerator).map((i) => i.accelerator));
  const spare = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((c) => !used.has(c));
  let next = 0;
  const letters = new Map<number, string>();
  for (const i of items) {
    const letter = i.accelerator || (next < spare.length ? spare[next++] : null);
    if (letter) letters.set(i.identifier, letter);
  }
  return letters;
}

function expandTabs(s: string): string {
  let out = "";
  for (const c of s) out += c === "\t" ? " ".repeat(8 - (out.length % 8)) : c;
  return out;
}

function number(text: string | undefined, dflt = 0): number {
  const found = (text ?? "").match(/-?\d+/g);
  return found ? parseInt(found[found.length - 1], 10) : dflt;
}

const encoder = new TextEncoder();
function bytes(text: string, width: number): number[] {
  const out = new Array<number>(width).fill(0);
  encoder.encode(text).slice(0, width).forEach((b, i) => (out[i] = b));
  return out;
}

export class NleTerminal {
  private readonly translation: Int16Array;
  private readonly objectByTile = new Map<number, number>();
  private readonly flags: [number, number][];
  private readonly conditions: [number, number][];
  private readonly c: Record<string, number>;

  private seen: Observation | null = null;
  /** Message lines still to show, the first on screen. */
  private screens: string[] = [];
  private asked: string | null = null;
  private typed = "";
  private count = "";
  private picked = new Map<number, number>();
  private page = 0;
  private hero: [number, number] = [0, 0];
  done = false;

  /** `core`: the core's own glyph flags and condition bits, by name (nethackGlobal.constants MG and BL_MASK). */
  constructor(
    private readonly data: NhData,
    core: { MG: Record<string, number>; BL_MASK: Record<string, number> },
  ) {
    this.c = data.consts;
    this.translation = translation(data);
    data.object_tiles.forEach((tile, i) => this.objectByTile.set(tile, i));
    this.flags = Object.entries(MG36).map(([name, bit]) => [core.MG[name], bit]);
    this.conditions = Object.entries(CONDITIONS36).map(([name, bit]) => [core.BL_MASK[`BL_MASK_${name}`], bit]);
  }

  /** Takes what the game shows now that it waits for something new. */
  load(seen: Observation): void {
    this.seen = seen;
    this.typed = "";
    this.count = "";
    this.picked = new Map();
    this.page = 0;
    const messages = [...seen.messages];
    // the page logs each answered question as a message, which the terminal doesn't
    if (this.asked && messages.length && messages[0].startsWith(this.asked)) messages.shift();
    this.screens = lines(messages);
    const request = seen.request;
    this.asked = request.kind === "yn" || request.kind === "getlin" ? request.query : null;
    if (seen.gameOver !== null || (request.kind === "yn" && END.some((e) => request.query.startsWith(e)))) this.done = true;
  }

  /** The bot's key: what to give the game, or null if the terminal took it itself. */
  key(key: number): GameAction | null {
    const request = this.seen!.request;
    if (this.more()) {
      // any key goes on past --More--, and Escape past all of this turn's messages
      this.screens = key === ESC ? [] : this.screens.slice(1);
      return null;
    }
    this.screens = [];
    switch (request.kind) {
      case "key":
      case "poskey":
        return { key };
      case "yn": {
        let k = key;
        if (request.choices && k !== ESC && !request.choices.includes(String.fromCharCode(k))) {
          // as tty: Space and Enter take the default, and other keys are ignored
          if ((k === SPACE || k === ENTER || k === NEWLINE) && request.defaultChoice) k = request.defaultChoice.charCodeAt(0);
          else return null;
        }
        return { answer: k === ESC ? null : { kind: "yn", key: String.fromCharCode(k) } };
      }
      case "text":
        // any key turns the page, and dismisses the window on the last
        if (this.page < this.textPages(request).length - 1) return (this.page++, null);
        return { answer: { kind: "text" } };
      case "getlin":
        return this.type(key, (text) => ({ kind: "getlin", text }));
      case "ext_cmd":
        return this.type(key, (typed) => {
          const chosen = request.commands.find((c) => c.name === typed) ?? request.commands.find((c) => c.autocompletes && typed && c.name.startsWith(typed));
          return { kind: "ext_cmd", index: chosen ? chosen.index : -1 };
        });
      case "menu":
        return this.menu(key, request);
      default:
        return { answer: null };
    }
  }

  private type(key: number, answer: (text: string) => Answer): GameAction | null {
    if (key === ESC) return { answer: null };
    if (key === ENTER || key === NEWLINE) return { answer: answer(this.typed) };
    if (key === 8 || key === 127) this.typed = this.typed.slice(0, -1);
    else this.typed += String.fromCharCode(key);
    return null;
  }

  private menu(key: number, request: Menu): GameAction | null {
    if (key === ESC) return { answer: null };
    const pages = this.menuPages(request).length;
    if (key === ">".charCodeAt(0) && this.page < pages - 1) return (this.page++, null);
    if (key === "<".charCodeAt(0) && this.page > 0) return (this.page--, null);
    // Space turns the page, and accepts on the last
    if (key === SPACE && this.page < pages - 1) return (this.page++, null);
    if (request.how === "none" || key === ENTER || key === NEWLINE || key === SPACE) {
      return { answer: { kind: "menu", selection: [...this.picked].map(([identifier, count]) => ({ identifier, count })) } };
    }
    const ch = String.fromCharCode(key);
    const letters = menuLetters(request);
    const item = request.items.find((i) => letters.get(i.identifier) === ch);
    if (/^\d$/.test(ch) && !item) {
      this.count += ch;
      return null;
    }
    if (!item) {
      if (request.unlisted.includes(ch)) return { answer: { kind: "menu", selection: [{ identifier: key, count: -1 }] } };
      if (request.how === "any" && (ch === "," || ch === ".")) for (const i of request.items) if (letters.has(i.identifier)) this.picked.set(i.identifier, -1);
      if (request.how === "any" && ch === "-") this.picked.clear();
      return null;
    }
    const count = this.count ? parseInt(this.count, 10) : -1;
    this.count = "";
    if (request.how === "one") return { answer: { kind: "menu", selection: [{ identifier: item.identifier, count }] } };
    if (this.picked.has(item.identifier) && count === -1) this.picked.delete(item.identifier);
    else this.picked.set(item.identifier, count);
    return null;
  }

  /** The message line waits with --More--: before another line, or before a question or window. */
  private more(): boolean {
    const kind = this.seen!.request.kind;
    return this.screens.length > 1 || (this.screens.length === 1 && kind !== "key" && kind !== "poskey");
  }

  private message(): string {
    if (this.screens.length) return this.screens[0];
    const request = this.seen!.request;
    if (request.kind === "yn") {
      let text = request.query;
      if (request.choices) text += ` [${request.choices}]`;
      if (request.defaultChoice) text += ` (${request.defaultChoice})`;
      return text;
    }
    if (request.kind === "getlin") return `${request.query} ${this.typed}`;
    if (request.kind === "ext_cmd") return `# ${this.typed}`;
    return "";
  }

  /** A menu's lines, as tty writes them, split into the pages that fit beside the message line. */
  private menuPages(request: Menu): string[][] {
    const letters = menuLetters(request);
    const lines: string[] = request.prompt ? [request.prompt] : [];
    for (const item of request.items) {
      const letter = letters.get(item.identifier);
      if (letter) lines.push(`${letter} ${this.picked.has(item.identifier) ? "+" : "-"} ${item.text}`);
      else if (!item.identifier) lines.push(item.text);
    }
    return paginate(lines.map(expandTabs));
  }

  /** The window over the map, with its marker: (end), (n of m) or --More--. */
  private window(): string[] {
    if (this.more()) return [];
    const request = this.seen!.request;
    if (request.kind === "menu") {
      const pages = this.menuPages(request);
      const page = pages[Math.min(this.page, pages.length - 1)];
      return [...page, pages.length > 1 ? `(${this.page + 1} of ${pages.length})` : "(end)"];
    }
    if (request.kind === "text") {
      const pages = this.textPages(request);
      return [...pages[Math.min(this.page, pages.length - 1)], "--More--"];
    }
    return [];
  }

  private textPages(request: Extract<GameRequest, { kind: "text" }>): string[][] {
    return paginate(request.lines.map((l) => expandTabs(l.text)));
  }

  observation(): NleObservation {
    const seen = this.seen!;
    const request = seen.request;
    const width = COLNO - 1;
    const map = (values: number[], each: (v: number) => number) => {
      const out = new Array<number>(ROWNO * width);
      for (let y = 0; y < ROWNO; y++) for (let x = 1; x < COLNO; x++) out[y * width + x - 1] = each(values[y * COLNO + x]);
      return out;
    };
    const glyphs = map(seen.glyphs, (g) => this.translation[g] ?? -1);
    const tiles = map(seen.tiles, (t) => t);
    for (let i = 0; i < glyphs.length; i++) {
      if (glyphs[i] < this.c.GLYPH_OBJ_OFF36 || glyphs[i] >= this.c.GLYPH_CMAP_OFF36) continue;
      const obj = this.objectByTile.get(tiles[i]);
      if (obj !== undefined) glyphs[i] = this.c.GLYPH_OBJ_OFF36 + obj;
    }
    const chars = map(seen.chars, (c) => c);
    const colors = map(seen.colors, (c) => c);
    const specials = map(seen.flags, (f) => this.flags.reduce((s, [core, bit]) => (f & core ? s | bit : s), 0));

    // the hero's square, when the core marks it; else where the cursor waits for a command
    const hero = seen.flags.findIndex((f) => f & this.c.MG_HERO);
    if (hero >= 0) this.hero = [Math.floor(hero / COLNO), (hero % COLNO) - 1];
    else if (seen.cursor && (request.kind === "key" || request.kind === "poskey")) this.hero = [seen.cursor.y, seen.cursor.x - 1];

    const message = this.message();
    const more = this.more();
    const window = this.window();
    const tty = new Array<string>(ROWS).fill("");
    tty[0] = more ? `${message}--More--` : message;
    for (let y = 0; y < ROWNO; y++) tty[y + 1] = String.fromCharCode(...chars.slice(y * width, (y + 1) * width));
    [tty[22], tty[23]] = this.statusLines();
    const ttyColors = new Array<number>(ROWS * COLNO).fill(0);
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < width; x++) ttyColors[(y + 1) * COLNO + x] = colors[y * width + x];
    let cursor: [number, number] = [this.hero[0] + 1, this.hero[1]];
    if (window.length) {
      // tty puts a window at the right, from the top, unless it would start in the first 10 columns
      const top = message ? 1 : 0;
      const widest = Math.max(...window.map((l) => l.length));
      const right = Math.max(10, COLNO - widest - 1);
      const left = right === 10 || window.length + top > ROWS ? 0 : right;
      window.forEach((line, i) => {
        const row = top + i;
        if (row >= ROWS) return;
        tty[row] = (tty[row].padEnd(left).slice(0, left) + line).slice(0, COLNO);
        for (let x = left; x < COLNO; x++) ttyColors[row * COLNO + x] = 0;
      });
      const last = Math.min(top + window.length - 1, ROWS - 1);
      cursor = [last, left + window[window.length - 1].length];
    } else if (message && request.kind !== "key" && request.kind !== "poskey") {
      cursor = [0, tty[0].length];
    }
    const ttyChars: number[] = [];
    for (const line of tty) ttyChars.push(...bytes(line.padEnd(COLNO).slice(0, COLNO), COLNO));

    const [invStrs, invLetters, invClasses, invGlyphs] = this.inventory();
    return {
      glyphs,
      chars,
      colors,
      specials,
      blstats: this.blstats(),
      message: bytes(message, MESSAGE),
      inv_glyphs: invGlyphs,
      inv_strs: invStrs,
      inv_letters: invLetters,
      inv_oclasses: invClasses,
      tty_chars: ttyChars,
      tty_colors: ttyColors,
      tty_cursor: cursor,
      misc: [!more && request.kind === "yn" ? 1 : 0, !more && request.kind === "getlin" ? 1 : 0, more || request.kind === "text" ? 1 : 0],
      done: this.done,
    };
  }

  private blstats(): number[] {
    const s = this.seen!.status;
    // the core's raw strength, 3..125, in which 18/xx is 18 + xx and 19 is 119
    const [base, extra] = (s.BL_STR ?? "").split("/");
    const raw = extra === undefined ? (number(base) > 18 ? number(base) + 100 : number(base)) : 18 + (extra.trim() === "**" ? 100 : number(extra));
    const out = new Array<number>(27).fill(0);
    // as NLE gives it, the hero's column in glyphs, one less than the core's
    out[BL.X] = this.hero[1];
    out[BL.Y] = this.hero[0];
    // ACURRSTR: up to 18 as it is, 18/01 to 18/** as 19 to 21, then 22 to 25
    out[BL.STR25] = raw <= 18 ? raw : raw <= 121 ? 19 + Math.floor(raw / 50) : raw - 100;
    out[BL.STR125] = raw;
    out[BL.DEX] = number(s.BL_DX);
    out[BL.CON] = number(s.BL_CO);
    out[BL.INT] = number(s.BL_IN);
    out[BL.WIS] = number(s.BL_WI);
    out[BL.CHA] = number(s.BL_CH);
    out[BL.SCORE] = number(s.BL_SCORE);
    out[BL.HP] = number(s.BL_HP);
    out[BL.HPMAX] = number(s.BL_HPMAX);
    out[BL.DEPTH] = number(s.BL_LEVELDESC);
    out[BL.GOLD] = number(s.BL_GOLD);
    out[BL.ENE] = number(s.BL_ENE);
    out[BL.ENEMAX] = number(s.BL_ENEMAX);
    out[BL.AC] = number(s.BL_AC);
    out[BL.HD] = number(s.BL_HD);
    out[BL.XP] = number(s.BL_XP);
    out[BL.EXP] = number(s.BL_EXP);
    out[BL.TIME] = number(s.BL_TIME);
    out[BL.HUNGER] = HUNGER[(s.BL_HUNGER ?? "").trim()] ?? 1;
    out[BL.CAP] = CAPACITY[(s.BL_CAP ?? "").trim()] ?? 0;
    out[BL.DNUM] = DUNGEONS[s.dungeon_name ?? ""] ?? -1;
    out[BL.DLEVEL] = number(s.dungeon_level);
    out[BL.CONDITION] = this.conditions.reduce((m, [core, bit]) => (this.seen!.conditions & core ? m | bit : m), 0);
    out[BL.ALIGN] = ALIGN[(s.BL_ALIGN ?? "").trim()] ?? 0;
    return out;
  }

  /** tty's two status lines. */
  private statusLines(): [string, string] {
    const s = this.seen!.status;
    const t = (k: string) => (s[k] ?? "").trim();
    const str = t("BL_STR");
    const one = [t("BL_TITLE"), `St:${str} Dx:${t("BL_DX")} Co:${t("BL_CO")} In:${t("BL_IN")} Wi:${t("BL_WI")} Ch:${t("BL_CH")}`, t("BL_ALIGN")];
    if (s.BL_SCORE !== undefined) one.push(`S:${t("BL_SCORE")}`);
    const conditions = t("BL_CONDITION")
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => c[0].toUpperCase() + c.slice(1).toLowerCase());
    const two = [
      t("BL_LEVELDESC"),
      `$:${number(s.BL_GOLD)}`,
      `HP:${t("BL_HP")}(${t("BL_HPMAX")})`,
      `Pw:${t("BL_ENE")}(${t("BL_ENEMAX")})`,
      `AC:${t("BL_AC")}`,
      s.BL_HD !== undefined && t("BL_HD") ? `HD:${t("BL_HD")}` : `Xp:${t("BL_XP")}/${t("BL_EXP")}`,
      `T:${t("BL_TIME")}`,
      t("BL_HUNGER"),
      t("BL_CAP"),
      ...conditions,
    ];
    return [one.filter(Boolean).join(" "), two.filter(Boolean).join(" ")];
  }

  private inventory(): [number[], number[], number[], number[]] {
    const strs = new Array<number>(INV * INV_WIDTH).fill(0);
    const letters = new Array<number>(INV).fill(0);
    const classes = new Array<number>(INV).fill(this.c.MAXOCLASSES);
    const glyphs = new Array<number>(INV).fill(this.c.MAX_GLYPH36);
    this.seen!.inventory.slice(0, INV).forEach((item, i) => {
      bytes(item.text, INV_WIDTH).forEach((b, j) => (strs[i * INV_WIDTH + j] = b));
      letters[i] = item.letter.charCodeAt(0) || 0;
      const h = HEADINGS.findIndex((name) => item.heading.startsWith(name));
      const obj = this.objectByTile.get(item.tile);
      classes[i] = h >= 0 ? h + 1 : obj !== undefined ? this.objectClass(obj) : this.c.MAXOCLASSES;
      // a hallucinating hero sees items drawn as other things, so the tile counts only where it agrees
      if (obj !== undefined && this.objectClass(obj) === classes[i]) glyphs[i] = this.c.GLYPH_OBJ_OFF36 + obj;
    });
    return [strs, letters, classes, glyphs];
  }

  private objectClass(obj: number): number {
    return this.data.objects[obj].class;
  }
}

/** Messages as tty's message line shows them: together while they fit beside --More--. */
function lines(messages: string[], width = COLNO - "--More--".length): string[] {
  const out: string[] = [];
  for (const message of messages) {
    if (out.length && out[out.length - 1].length + 2 + message.length <= width) out[out.length - 1] += `  ${message}`;
    else out.push(message);
  }
  return out;
}

/** A window's lines in pages that leave the last row for the marker. */
function paginate(lines: string[], rows = ROWS - 1): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows));
  return pages.length ? pages : [[]];
}

/** The core's glyphs in NLE's NetHack 3.6 layout, each range sized by this core; also sets the layout's offsets in
 * data.consts, with the suffix 36. */
function translation(data: NhData): Int16Array {
  const c = data.consts;
  const cmap = data.cmap;
  const NUMMONS = c.NUMMONS;
  const MON = 0;
  const PET = MON + NUMMONS;
  const INVIS = PET + NUMMONS;
  const DETECT = INVIS + 1;
  const BODY = DETECT + NUMMONS;
  const RIDDEN = BODY + NUMMONS;
  const OBJ = RIDDEN + NUMMONS;
  const CMAP = OBJ + c.NUM_OBJECTS;
  const EXPLODE = CMAP + c.MAXPCHARS;
  const ZAP = EXPLODE + c.MAXEXPCHARS * c.EXPL_MAX;
  const SWALLOW = ZAP + c.NUM_ZAP * 4;
  const WARNING = SWALLOW + NUMMONS * 8;
  const STATUE = WARNING + c.WARNCOUNT;
  const MAX = STATUE + NUMMONS;
  Object.assign(c, {
    GLYPH_MON_OFF36: MON, GLYPH_PET_OFF36: PET, GLYPH_INVIS_OFF36: INVIS, GLYPH_DETECT_OFF36: DETECT,
    GLYPH_BODY_OFF36: BODY, GLYPH_RIDDEN_OFF36: RIDDEN, GLYPH_OBJ_OFF36: OBJ, GLYPH_CMAP_OFF36: CMAP,
    GLYPH_EXPLODE_OFF36: EXPLODE, GLYPH_ZAP_OFF36: ZAP, GLYPH_SWALLOW_OFF36: SWALLOW, GLYPH_WARNING_OFF36: WARNING,
    GLYPH_STATUE_OFF36: STATUE, MAX_GLYPH36: MAX,
  });

  const t = new Int16Array(c.MAX_GLYPH).fill(-1);
  const fill = (start: string, end: string, to: (i: number) => number) => {
    for (let g = c[start]; g < c[end]; g++) t[g] = to(g - c[start]);
  };
  const walls = cmap.S_trwall - cmap.S_vwall + 1;
  fill("GLYPH_MON_OFF", "GLYPH_PET_OFF", (i) => MON + (i % NUMMONS));
  fill("GLYPH_PET_OFF", "GLYPH_INVIS_OFF", (i) => PET + (i % NUMMONS));
  fill("GLYPH_INVIS_OFF", "GLYPH_DETECT_OFF", () => INVIS);
  fill("GLYPH_DETECT_OFF", "GLYPH_BODY_OFF", (i) => DETECT + (i % NUMMONS));
  fill("GLYPH_BODY_OFF", "GLYPH_RIDDEN_OFF", (i) => BODY + i);
  fill("GLYPH_RIDDEN_OFF", "GLYPH_OBJ_OFF", (i) => RIDDEN + (i % NUMMONS));
  fill("GLYPH_OBJ_OFF", "GLYPH_CMAP_OFF", (i) => OBJ + i);
  fill("GLYPH_CMAP_STONE_OFF", "GLYPH_CMAP_MAIN_OFF", () => CMAP + cmap.S_stone);
  fill("GLYPH_CMAP_MAIN_OFF", "GLYPH_CMAP_A_OFF", (i) => CMAP + cmap.S_vwall + (i % walls));
  fill("GLYPH_CMAP_A_OFF", "GLYPH_ALTAR_OFF", (i) => CMAP + cmap.S_ndoor + i);
  fill("GLYPH_ALTAR_OFF", "GLYPH_CMAP_B_OFF", () => CMAP + cmap.S_altar);
  fill("GLYPH_CMAP_B_OFF", "GLYPH_ZAP_OFF", (i) => CMAP + cmap.S_grave + i);
  fill("GLYPH_ZAP_OFF", "GLYPH_CMAP_C_OFF", (i) => ZAP + i);
  fill("GLYPH_CMAP_C_OFF", "GLYPH_SWALLOW_OFF", (i) => CMAP + cmap.S_digbeam + i);
  fill("GLYPH_SWALLOW_OFF", "GLYPH_EXPLODE_OFF", (i) => SWALLOW + i);
  fill("GLYPH_EXPLODE_OFF", "GLYPH_WARNING_OFF", (i) => EXPLODE + i);
  fill("GLYPH_WARNING_OFF", "GLYPH_STATUE_OFF", (i) => WARNING + i);
  fill("GLYPH_STATUE_OFF", "GLYPH_PILETOP_OFF", (i) => STATUE + (i % NUMMONS));
  fill("GLYPH_OBJ_PILETOP_OFF", "GLYPH_BODY_PILETOP_OFF", (i) => OBJ + i);
  fill("GLYPH_BODY_PILETOP_OFF", "GLYPH_STATUE_MALE_PILETOP_OFF", (i) => BODY + i);
  fill("GLYPH_STATUE_MALE_PILETOP_OFF", "GLYPH_UNEXPLORED_OFF", (i) => STATUE + (i % NUMMONS));
  fill("GLYPH_UNEXPLORED_OFF", "MAX_GLYPH", () => CMAP + cmap.S_stone);
  for (let g = 0; g < t.length; g++) if (t[g] < 0 || t[g] >= MAX) throw new Error(`the core's glyph ${g} has no place in NLE's layout`);
  return t;
}
