import type {
  Answer,
  GameEvent,
  GameRequest,
  MapCell,
  MenuHow,
  MenuItem,
  StatusValue,
} from "../protocol";
import {
  type GlyphInfo,
  type NetHackModule,
  readEquipment,
  readExtCommands,
  readGlyphInfo,
  writeLine,
  writeMenuSelection,
  writePosition,
} from "./memory";

// window types from include/wintype.h
const NHW_MESSAGE = 1;
const NHW_MAP = 3;
const NHW_MENU = 4;
const NHW_TEXT = 5;

const MENU_BEHAVE_PERMINV = 1;
const MENU_ITEMFLAGS_SELECTED = 1;
const ESC = 27;

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
  nextInput(): Promise<Input>;
  persist(): Promise<void>;
}

/** "BL_MASK_FOODPOIS" style names of the bits set in a BL_CONDITION mask. */
function conditionNames(table: Record<string | number, string | number> | undefined, mask: number): string[] {
  if (!table) return [];
  const names: string[] = [];
  for (const [name, bit] of Object.entries(table)) {
    if (typeof bit === "number" && name.startsWith("BL_MASK_") && (mask & bit) !== 0)
      names.push(name.slice("BL_MASK_".length));
  }
  return names;
}

/** Implements the shim window port on top of the WASM core. */
export class Game {
  private windows = new Map<number, Window>();
  private nextWindowId = 1;
  private pending: GameEvent[] = [];
  private mapBatch: MapCell[] = [];
  private status: Record<string, StatusValue> = {};
  private floorTile: number | undefined;

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
    this.flush();
    return this.host.request(request);
  }

  private async input(): Promise<Input> {
    this.flush();
    return this.host.nextInput();
  }

  // Dispatched from the shim with already-decoded arguments; see winshim.c for each signature.
  async callback(name: string, args: unknown[]): Promise<unknown> {
    const a = args as number[];
    switch (name) {
      case "shim_init_nhwindows":
      case "shim_status_init":
        return 0;
      case "shim_player_selection_or_tty":
        return true;
      case "shim_create_nhwindow":
        return this.createWindow(a[0]);
      case "shim_clear_nhwindow":
        return this.clearWindow(a[0]);
      case "shim_destroy_nhwindow":
        this.windows.delete(a[0]);
        return 0;
      case "shim_display_nhwindow":
        return this.displayWindow(a[0], !!a[1]);
      case "shim_curs":
        if (this.windows.get(a[0])?.kind === NHW_MAP) this.emit({ type: "cursor", x: a[1], y: a[2] });
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
      case "shim_status_update":
        return this.statusUpdate(a[0], a[1], a[3], a[4]);
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
    this.mapBatch.push({
      x,
      y,
      glyph: gi.glyph,
      tile: gi.tile,
      bgTile: this.backgroundTile(gi.glyph, readGlyphInfo(this.m, bkPtr)),
      ch: gi.ch,
      color: gi.color,
      glyphFlags: gi.glyphFlags,
    });
    return 0;
  }

  private backgroundTile(glyph: number, bk: GlyphInfo | null): number {
    if (!bk || bk.glyph === glyph) return -1;
    const unexplored = this.glyphConstant("GLYPH_UNEXPLORED");
    if (bk.glyph !== unexplored) return this.m._nhweb_glyph_tile(bk.glyph);
    // a cmap glyph is terrain itself; anything else (monster, object) stands on lit floor
    const cmapStart = this.glyphConstant("GLYPH_CMAP_OFF");
    const cmapEnd = this.glyphConstant("GLYPH_EXPLODE_OFF");
    if (glyph >= cmapStart && glyph < cmapEnd) return -1;
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
    const answer = await this.ask({ kind: "menu", how: howName, prompt: menu.prompt, items: menu.items });
    const selection = answer?.kind === "menu" ? answer.selection : null;
    if (!selection) return -1;
    if (how === 0 || !selection.length) return 0;
    writeMenuSelection(this.m, listPtr, selection);
    return selection.length;
  }

  private async poskey(xPtr: number, yPtr: number, modPtr: number): Promise<number> {
    const input = await this.input();
    if ("key" in input) return input.key;
    writePosition(this.m, xPtr, yPtr, modPtr, input.click.x, input.click.y, input.click.button);
    return 0;
  }

  private async yn(query: string, choices: string, def: number): Promise<number> {
    const answer = await this.ask({
      kind: "yn",
      query,
      choices: choices ?? "",
      defaultChoice: def ? String.fromCharCode(def) : "",
    });
    const code = answer?.kind === "yn" && answer.key ? answer.key.charCodeAt(0) : ESC;
    // the shim returns a C char; a wider value throws in the callback and hangs the core
    return code > 0 && code < 128 ? code : ESC;
  }

  private async getlin(query: string, bufPtr: number): Promise<number> {
    const answer = await this.ask({ kind: "getlin", query });
    const text = answer?.kind === "getlin" ? answer.text : null;
    writeLine(this.m, bufPtr, text ?? "\x1b");
    return 0;
  }

  private statusUpdate(field: number, ptr: number, percent: number, color: number): number {
    const constants = (globalThis as { nethackGlobal?: { constants?: Record<string, Record<string | number, string | number>> } })
      .nethackGlobal?.constants;
    const name = String(constants?.STATUS_FIELD?.[field] ?? field);
    switch (name) {
      case "BL_FLUSH":
      case "BL_RESET":
        this.emit({ type: "status", fields: { ...this.status } });
        return 0;
      case "BL_CHARACTERISTICS":
        return 0;
      case "BL_CONDITION": {
        const mask = ptr ? this.m.getValue(ptr, "i32") >>> 0 : 0;
        this.status[name] = { text: conditionNames(constants?.CONDITION, mask).join(" "), color, percent, mask };
        return 0;
      }
      default:
        this.status[name] = { text: ptr ? this.m.UTF8ToString(ptr) : "", color, percent };
        return 0;
    }
  }
}
