import type {
  Answer,
  GameEvent,
  GameRequest,
  MapCell,
  MenuHow,
  MenuItem,
  StatusValue,
} from "../protocol";
import { unlistedLetters } from "../port/getobj";
import { withLetters } from "../port/letters";
import { MARK_PEACEFUL } from "../port/marks";
import { symbolText } from "../port/symbols";
import { COLNO } from "../port/state";
import {
  type GlyphInfo,
  type NetHackModule,
  readEquipment,
  readExtCommands,
  readGlyphInfo,
  readDataFile,
  readPlayerChoices,
  writeLine,
  writeMenuSelection,
  writePosition,
} from "./memory";
import { keyText, ynAnswer, ynQuestion } from "../port/yn";

// window types from include/wintype.h
const NHW_MESSAGE = 1;
const NHW_MAP = 3;
const NHW_MENU = 4;
const NHW_TEXT = 5;

const CLICK_PRIMARY = 1;
const MENU_BEHAVE_PERMINV = 1;
const MENU_ITEMFLAGS_SELECTED = 1;
const ESC = 27;
const HASH = "#".charCodeAt(0);

interface Window {
  kind: number;
  lines: { attr: number; text: string }[];
  menu: { behavior: number; items: MenuItem[]; prompt: string } | null;
}

export type Input = { key: number } | { click: { x: number; y: number; button: number } };

export interface GameHost {
  post(events: GameEvent[]): void;
  request(request: GameRequest): Promise<Answer | null>;
  /** Resolves with the next key or click the player makes. */
  nextInput(request: Extract<GameRequest, { kind: "poskey" }>): Promise<Input>;
  persist(): Promise<void>;
}

/** "FOODPOIS" style names of the bits set in a BL_CONDITION mask, in `order`. */
function conditionNames(table: Record<string | number, string | number> | undefined, order: number[], mask: number): string[] {
  if (!table) return [];
  const names = new Map<number, string>();
  for (const [name, bit] of Object.entries(table))
    if (typeof bit === "number" && name.startsWith("BL_MASK_")) names.set(bit, name.slice("BL_MASK_".length));
  return order.filter((bit) => (mask & bit) !== 0 && names.has(bit)).map((bit) => names.get(bit)!);
}

/** The fields that show an arrow when they change, and whether going up is good. */
const IMPROVES_UP: Record<string, boolean> = {
  BL_STR: true, BL_DX: true, BL_CO: true, BL_IN: true, BL_WI: true, BL_CH: true,
  BL_XP: true, BL_HD: true, BL_AC: false,
};

// the core's default for how long statushilites show a change
const CHANGE_TURNS = 3;

// Emscripten's HOME, where the worker puts the options file and #saveoptions writes it
export const CONFIG_FILE = "/home/web_user/.nethackrc";

/** Implements the shim window port on top of the WASM core. */
export class Game {
  private windows = new Map<number, Window>();
  private nextWindowId = 1;
  private pending: GameEvent[] = [];
  private mapBatch: MapCell[] = [];
  private status: Record<string, StatusValue> = {};
  /** The turn each field last went up or down, for the status's arrows. */
  private changes = new Map<string, { direction: 1 | -1; improved: boolean; turn: number }>();
  // starting gear changes AC and stats before the first turn
  private showChanges = false;
  /** The options file as last seen; #saveoptions rewrites it in place, which is kept only if passed on. */
  private configText: string | null = null;
  private floorTile: number | undefined;
  /** The cell last drawn on each map square, by y * COLNO + x. */
  private cells = new Map<number, MapCell>();
  private mapCursor = { x: 0, y: 0 };

  constructor(
    private readonly m: NetHackModule,
    private readonly host: GameHost,
  ) {}

  private emit(event: GameEvent): void {
    this.flushMap();
    this.pending.push(event);
  }

  private flushMap(): void {
    if (this.mapBatch.length) {
      this.pending.push({ type: "map", cells: this.mapBatch });
      this.mapBatch = [];
    }
  }

  flush(): void {
    this.flushMap();
    if (this.pending.length) {
      this.host.post(this.pending);
      this.pending = [];
    }
  }

  private async ask(request: GameRequest): Promise<Answer | null> {
    this.refreshPeaceful();
    this.flush();
    return this.host.request(request);
  }

  private async input(): Promise<Input> {
    this.optionsFile();
    this.refreshPeaceful();
    this.expireChanges();
    this.flush();
    return this.host.nextInput({
      kind: "poskey",
      inventoryKey: this.m._nhweb_inventory_key(),
      commandKey: this.m._nhweb_command_key(),
      wizard: !!this.m._nhweb_wizard(),
    });
  }

  /**
   * Dispatched from the shim with already-decoded arguments; see winshim.c for each signature.
   * Never rejects: the shim has no handler for that, and the core would wait forever.
   */
  async callback(name: string, args: unknown[]): Promise<unknown> {
    try {
      return await this.dispatch(name, args);
    } catch (e) {
      console.error(`${name} failed`, e);
      this.pending = [];
      this.mapBatch = [];
      return this.fallback(name, args);
    }
  }

  /** What a failed callback tells the core: the player cancelled, as Cocoa's window code does. */
  private fallback(name: string, args: unknown[]): unknown {
    switch (name) {
      case "shim_nhgetch":
      case "shim_nh_poskey":
      case "shim_yn_function":
        return ESC;
      case "shim_select_menu":
      case "shim_get_ext_cmd":
        return -1;
      case "shim_getlin":
        writeLine(this.m, args[1] as number, "\x1b");
        return 0;
      case "shim_player_selection_or_tty":
        return true;
      default:
        return 0;
    }
  }

  private async dispatch(name: string, args: unknown[]): Promise<unknown> {
    const a = args as number[];
    switch (name) {
      case "shim_init_nhwindows":
        // the options have been read by now
        this.textSize(true);
        this.tileFile();
        return 0;
      case "shim_status_init":
        this.changes.clear();
        this.showChanges = false;
        return 0;
      case "shim_player_selection_or_tty":
        return this.playerSelection();
      case "shim_create_nhwindow":
        return this.createWindow(a[0]);
      case "shim_clear_nhwindow":
        return this.clearWindow(a[0]);
      case "shim_destroy_nhwindow":
        this.windows.delete(a[0]);
        return 0;
      case "shim_display_file":
        return this.displayFile(args[0] as string, !!a[1]);
      case "shim_display_nhwindow":
        return this.displayWindow(a[0], !!a[1]);
      case "shim_curs":
        if (this.windows.get(a[0])?.kind === NHW_MAP) {
          this.mapCursor = { x: a[1], y: a[2] };
          this.emit({ type: "cursor", x: a[1], y: a[2] });
        }
        return 0;
      case "shim_cliparound":
        this.emit({ type: "cursor", x: a[0], y: a[1] });
        return 0;
      case "shim_putstr":
        return this.putstr(a[0], a[1], args[2] as string);
      case "shim_raw_print":
      case "shim_raw_print_bold":
        this.emit({ type: "message", text: args[0] as string, attr: 0 });
        return 0;
      case "shim_print_glyph":
        return this.printGlyph(a[1], a[2], a[3], a[4]);
      case "shim_start_menu":
        return this.startMenu(a[0], a[1]);
      case "shim_add_menu":
        return this.addMenu(args);
      case "shim_end_menu": {
        const menu = this.windows.get(a[0])?.menu;
        if (menu) menu.prompt = (args[1] as string) ?? "";
        return 0;
      }
      case "shim_select_menu":
        return this.selectMenu(a[0], a[1], a[2]);
      case "shim_message_menu":
        return 0;
      case "shim_nhgetch": {
        const input = await this.input();
        return "key" in input ? input.key : ESC;
      }
      case "shim_nh_poskey":
        return this.poskey(a[0], a[1], a[2]);
      case "shim_yn_function":
        return this.yn(args[0] as string, args[1] as string, a[2]);
      case "shim_getlin":
        return this.getlin(args[0] as string, a[1]);
      case "shim_get_ext_cmd": {
        const answer = await this.ask({ kind: "ext_cmd", commands: readExtCommands(this.m) });
        return answer?.kind === "ext_cmd" ? answer.index : -1;
      }
      case "shim_status_enablefield":
        // a field the core stops showing, such as Xp while polymorphed, is no longer updated
        if (!a[3]) delete this.status[this.statusFieldName(a[0])];
        return 0;
      case "shim_status_update":
        return this.statusUpdate(a[0], a[1], a[2], a[3], a[4]);
      case "shim_preference_update": {
        const pref = this.m.UTF8ToString(a[0]);
        // tiled_map switches ascii_map too
        if (pref === "ascii_map" || pref === "tiled_map") this.emit({ type: "ascii_map", on: !!this.m._nhweb_ascii_map() });
        if (pref === "font_size_message" || pref === "font_size_status") this.textSize(false);
        return 0;
      }
      case "shim_nhbell":
        this.emit({ type: "bell" });
        return 0;
      case "shim_delay_output":
        this.flush();
        await new Promise((r) => setTimeout(r, 50));
        return 0;
      case "shim_getmsghistory":
      case "shim_get_color_string":
        return "";
      case "shim_doprev_message":
        return 0;
      case "shim_exit_nhwindows":
        this.flush();
        await this.host.persist();
        this.emit({ type: "game_over", text: (args[0] as string) ?? "" });
        this.flush();
        return 0;
      default:
        return 0;
    }
  }

  /** Returns true for the core's own setup, which asks nothing once all four are chosen. */
  private async playerSelection(): Promise<boolean> {
    const choices = readPlayerChoices(this.m);
    const { role, race, gender, align } = choices.chosen;
    if (role >= 0 && race >= 0 && gender >= 0 && align >= 0) return true;
    const answer = await this.ask({ kind: "player", choices });
    if (answer?.kind === "player") this.m._nhweb_choose(answer.role, answer.race, answer.gender, answer.align);
    return true;
  }

  private createWindow(type: number): number {
    const id = this.nextWindowId++;
    this.windows.set(id, { kind: type, lines: [], menu: null });
    return id;
  }

  private clearWindow(win: number): number {
    const w = this.windows.get(win);
    if (!w) return 0;
    if (w.kind === NHW_MAP) {
      this.mapBatch = [];
      this.cells.clear();
      this.emit({ type: "map_clear" });
    }
    w.lines = [];
    w.menu = null;
    return 0;
  }

  private async displayWindow(win: number, blocking: boolean): Promise<number> {
    const w = this.windows.get(win);
    if (!w) return 0;
    if ((w.kind === NHW_TEXT || w.kind === NHW_MENU) && w.lines.length) {
      const lines = w.lines;
      w.lines = [];
      await this.ask({ kind: "text", lines });
    } else if (blocking || w.kind === NHW_MAP) {
      this.flush();
    }
    return 0;
  }

  private async displayFile(name: string, complain: boolean): Promise<number> {
    const text = readDataFile(this.m, name);
    if (text === null) {
      if (complain) this.emit({ type: "message", text: `Cannot open ${name}.`, attr: 0 });
      return 0;
    }
    await this.ask({ kind: "text", lines: text.replace(/\n$/, "").split("\n").map((line) => ({ attr: 0, text: line })) });
    return 0;
  }

  private putstr(win: number, attr: number, text: string): number {
    const w = this.windows.get(win);
    if (!w) return 0;
    switch (w.kind) {
      case NHW_MESSAGE:
        this.emit({ type: "message", text, attr });
        break;
      case NHW_TEXT:
      case NHW_MENU:
        w.lines.push({ attr, text });
        break;
    }
    return 0;
  }

  private printGlyph(x: number, y: number, giPtr: number, bkPtr: number): number {
    const gi = readGlyphInfo(this.m, giPtr);
    if (!gi) return 0;
    const cell: MapCell = {
      x,
      y,
      glyph: gi.glyph,
      tile: gi.tile,
      bgTile: this.backgroundTile(gi.glyph, readGlyphInfo(this.m, bkPtr)),
      ch: gi.ch,
      color: gi.color,
      glyphFlags: gi.glyphFlags,
      marks: this.m._nhweb_map_marks(x, y, gi.glyph, gi.glyphFlags),
      symbol: symbolText(gi.ch, !!this.m._nhweb_dec_graphics()),
    };
    this.cells.set(y * COLNO + x, cell);
    this.mapBatch.push(cell);
    return 0;
  }

  private optionsFile(): void {
    let text = "";
    try {
      text = this.m.FS.readFile(CONFIG_FILE, { encoding: "utf8" });
    } catch {
      // none yet
    }
    if (this.configText !== null && text !== this.configText) this.emit({ type: "options_file", text });
    this.configText = text;
  }

  private tileFile(): void {
    const name = this.m.UTF8ToString(this.m._nhweb_tile_file());
    if (name) this.emit({ type: "tile_file", name });
  }

  private textSize(atStart: boolean): void {
    const size = this.m._nhweb_font_size_message();
    if (size > 0) this.emit({ type: "text_size", size, atStart });
  }

  /** Switches ascii_map from outside the core's options menu. */
  setAsciiMap(on: boolean): void {
    this.m._nhweb_set_ascii_map(on ? 1 : 0);
  }

  /** A monster can be angered or pacified without being redrawn, as Cocoa found. */
  private refreshPeaceful(): void {
    // once the game is over, keep the marks the map last showed, as Cocoa does
    if (!this.m._nhweb_in_play()) return;
    for (const [at, cell] of this.cells) {
      const marks = this.m._nhweb_map_marks(cell.x, cell.y, cell.glyph, cell.glyphFlags);
      if ((marks & MARK_PEACEFUL) === (cell.marks & MARK_PEACEFUL)) continue;
      const redrawn = { ...cell, marks };
      this.cells.set(at, redrawn);
      this.mapBatch.push(redrawn);
    }
  }

  private backgroundTile(glyph: number, bk: GlyphInfo | null): number {
    if (!bk || bk.glyph === glyph) return -1;
    const unexplored = this.glyphConstant("GLYPH_UNEXPLORED");
    if (bk.glyph !== unexplored) return this.m._nhweb_glyph_tile(bk.glyph);
    // terrain is drawn whole; anything else (a monster, an object, a zap's beam) stands on lit floor
    const terrainStart = this.glyphConstant("GLYPH_CMAP_OFF");
    const terrainEnd = this.glyphConstant("GLYPH_ZAP_OFF");
    if (glyph >= terrainStart && glyph < terrainEnd) return -1;
    if (glyph === unexplored || glyph === this.glyphConstant("GLYPH_NOTHING")) return -1;
    this.floorTile ??= this.m._nhweb_floor_tile();
    return this.floorTile;
  }

  private glyphConstant(name: string): number {
    return (globalThis as { nethackGlobal?: { constants?: { GLYPH?: Record<string, number> } } })
      .nethackGlobal?.constants?.GLYPH?.[name] ?? -1;
  }

  private startMenu(win: number, behavior: number): number {
    const w = this.windows.get(win);
    if (w) w.menu = { behavior, items: [], prompt: "" };
    return 0;
  }

  private addMenu(args: unknown[]): number {
    const [win, giPtr, identifier, ch, gch, attr, color, text, itemFlags] = args as [
      number, number, number, number, number, number, number, string, number,
    ];
    const menu = this.windows.get(win)?.menu;
    if (!menu) return 0;
    const gi = readGlyphInfo(this.m, giPtr);
    menu.items.push({
      identifier,
      accelerator: ch ? String.fromCharCode(ch & 0xff) : "",
      groupAccelerator: gch ? String.fromCharCode(gch & 0xff) : "",
      attr,
      color,
      text,
      tile: gi && gi.glyph !== this.noGlyph() ? gi.tile : -1,
      preselected: (itemFlags & MENU_ITEMFLAGS_SELECTED) !== 0,
    });
    return 0;
  }

  private noGlyph(): number {
    return this.glyphConstant("NO_GLYPH");
  }

  private async selectMenu(win: number, how: number, listPtr: number): Promise<number> {
    const menu = this.windows.get(win)?.menu;
    if (!menu) return -1;
    if (menu.behavior === MENU_BEHAVE_PERMINV) {
      this.emit({ type: "inventory", items: menu.items, equipment: readEquipment(this.m) });
      return 0;
    }
    const howName: MenuHow = how === 0 ? "none" : how === 1 ? "one" : "any";
    const carried = this.m.UTF8ToString(this.m._nhweb_invent_letters());
    const items = withLetters(howName, menu.items);
    const unlisted = unlistedLetters(howName, items, carried);
    const answer = await this.ask({ kind: "menu", how: howName, prompt: menu.prompt, items, unlisted });
    const selection = answer?.kind === "menu" ? answer.selection : null;
    if (!selection) return -1;
    if (how === 0 || !selection.length) return 0;
    writeMenuSelection(this.m, listPtr, selection);
    return selection.length;
  }

  private async poskey(xPtr: number, yPtr: number, modPtr: number): Promise<number> {
    for (;;) {
      const commanding = this.m._nhweb_inventory_key() !== 0;
      const input = await this.input();
      if ("key" in input) return input.key;
      const { x, y, button } = input.click;
      if (commanding && button === CLICK_PRIMARY && this.travelsIntoUnknown(x, y)) {
        this.emit({ type: "bell" });
        continue;
      }
      writePosition(this.m, xPtr, yPtr, modPtr, x, y, button);
      return 0;
    }
  }

  /** A distant click travels, and travel to a square never seen guesses a route through unknown ground. */
  private travelsIntoUnknown(x: number, y: number): boolean {
    const glyph = this.cells.get(y * COLNO + x)?.glyph;
    const unknown = glyph === undefined || glyph === this.glyphConstant("GLYPH_UNEXPLORED");
    return unknown && (Math.abs(x - this.mapCursor.x) > 1 || Math.abs(y - this.mapCursor.y) > 1);
  }

  private async yn(query: string, choices: string, def: number): Promise<number> {
    const answer = await this.ask({
      kind: "yn",
      query,
      choices: choices ?? "",
      defaultChoice: def ? String.fromCharCode(def) : "",
      // getdir() asks with no choices, which any key answers
      directions: !choices && /direction/.test(query) ? this.m.UTF8ToString(this.m._nhweb_dirchars()) : undefined,
    });
    const code = ynAnswer(answer?.kind === "yn" ? answer.key : null, choices ?? "", def ? String.fromCharCode(def) : "");
    const count = answer?.kind === "yn" && code === HASH && (choices ?? "").includes("#") ? (answer.count ?? 0) : null;
    // as tty sets it for every question
    this.m._nhweb_set_yn_number(count ?? 0);
    // the log keeps the question with its answer, as tty's message line does
    this.emit({ type: "message", text: `${ynQuestion(query, choices ?? "", def ? String.fromCharCode(def) : "")} ${count !== null ? `#${count}` : keyText(code)}`, attr: 0 });
    // the shim returns a C char; a wider value throws in the callback and hangs the core
    return code > 0 && code < 128 ? code : ESC;
  }

  private async getlin(query: string, bufPtr: number): Promise<number> {
    const answer = await this.ask({ kind: "getlin", query });
    const text = answer?.kind === "getlin" ? answer.text : null;
    writeLine(this.m, bufPtr, text ?? "\x1b");
    this.emit({ type: "message", text: `${query} ${text ?? ""}`.trimEnd(), attr: 0 });
    return 0;
  }

  private statusWithChanges(): Record<string, StatusValue> {
    const fields = { ...this.status };
    const now = this.m._nhweb_moves();
    for (const [name, { direction, improved, turn }] of this.changes) {
      // a field the core has stopped showing shows no change either
      if (fields[name] && now - turn < CHANGE_TURNS) fields[name] = { ...fields[name], change: { direction, improved } };
    }
    return fields;
  }

  /** Without the time option the core sends no status when only the turn changes, so a change would stay shown. */
  private expireChanges(): void {
    const now = this.m._nhweb_moves();
    let expired = false;
    for (const [name, { turn }] of this.changes) {
      if (now - turn < CHANGE_TURNS) continue;
      this.changes.delete(name);
      expired = true;
    }
    if (expired) this.emit({ type: "status", fields: this.statusWithChanges() });
  }

  /** The condition bits most serious first, as tty and Cocoa show them. */
  private conditionOrder(): number[] {
    const order: number[] = [];
    for (let i = 0, bit; (bit = this.m._nhweb_condition_mask(i) >>> 0); i++) order.push(bit);
    return order;
  }

  private statusFieldName(field: number): string {
    const constants = (globalThis as { nethackGlobal?: { constants?: Record<string, Record<string | number, string | number>> } })
      .nethackGlobal?.constants;
    return String(constants?.STATUS_FIELD?.[field] ?? field);
  }

  private statusUpdate(field: number, ptr: number, chg: number, percent: number, color: number): number {
    const constants = (globalThis as { nethackGlobal?: { constants?: Record<string, Record<string | number, string | number>> } })
      .nethackGlobal?.constants;
    const name = this.statusFieldName(field);
    switch (name) {
      case "BL_FLUSH":
      case "BL_RESET":
        this.emit({ type: "status", fields: this.statusWithChanges() });
        if (this.m._nhweb_in_play()) this.showChanges = true;
        return 0;
      case "BL_CHARACTERISTICS":
        return 0;
      case "BL_CONDITION": {
        const mask = ptr ? this.m.getValue(ptr, "i32") >>> 0 : 0;
        this.status[name] = { text: conditionNames(constants?.CONDITION, this.conditionOrder(), mask).join(" "), color, percent, mask };
        return 0;
      }
      default: {
        const before = this.status[name]?.text;
        this.status[name] = { text: ptr ? this.m.UTF8ToString(ptr) : "", color, percent };
        if (this.showChanges && chg && name in IMPROVES_UP) {
          // with a hilite rule on XL, the core's chg follows the percentage to the next level, which drops on a level-up
          const by = Number(this.status[name].text) - Number(before);
          const direction = (Number.isNaN(by) || by === 0 ? chg : by) > 0 ? 1 : -1;
          this.changes.set(name, { direction, improved: (direction > 0) === IMPROVES_UP[name], turn: this.m._nhweb_moves() });
        }
        return 0;
      }
    }
  }
}
