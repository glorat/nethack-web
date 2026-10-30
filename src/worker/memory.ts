// Reads and writes of core structs through the Emscripten heap. Offsets are
// for wasm32 and must track include/wintype.h.
import type { PlayerChoices } from "../protocol";

export interface NetHackModule {
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  ccall(name: string, ret: string | null, argTypes: string[], args: unknown[]): unknown;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _nhweb_extcmd_name(i: number): number;
  _nhweb_extcmd_desc(i: number): number;
  _nhweb_extcmd_status(i: number): number;
  _nhweb_floor_tile(): number;
  _nhweb_glyph_tile(glyph: number): number;
  _nhweb_equip_letter(slot: number): number;
  _nhweb_equip_tile(slot: number): number;
  _nhweb_inventory_key(): number;
  _nhweb_command_key(): number;
  _nhweb_wizard(): number;
  _nhweb_tile_file(): number;
  _nhweb_role_name(role: number, female: number): number;
  _nhweb_race_name(race: number): number;
  _nhweb_role_tile(role: number, female: number): number;
  _nhweb_race_tile(race: number, female: number): number;
  _nhweb_valid_race(role: number, race: number): number;
  _nhweb_valid_gender(role: number, race: number, gender: number): number;
  _nhweb_valid_align(role: number, race: number, align: number): number;
  _nhweb_chosen(facet: number): number;
  _nhweb_choose(role: number, race: number, gender: number, align: number): void;
  _nhweb_describe(x: number, y: number): number;
  _nhweb_map_marks(x: number, y: number, glyph: number, glyphFlags: number): number;
  _nhweb_in_play(): number;
  _nhweb_moves(): number;
  _nhweb_condition_mask(i: number): number;
  _nhweb_invent_letters(): number;
  _nhweb_dirchars(): number;
  _nhweb_set_yn_number(n: number): void;
  _nhweb_font_size_message(): number;
  _nhweb_ascii_map(): number;
  _nhweb_set_ascii_map(on: number): void;
  _nhweb_dec_graphics(): number;
  _main(argc: number, argv: number): number;
  ENV: Record<string, string>;
  FS: EmscriptenFS;
  IDBFS: unknown;
}

export interface EmscriptenFS {
  mkdir(path: string): void;
  mount(type: unknown, opts: object, mountpoint: string): void;
  syncfs(populate: boolean, callback: (err: unknown) => void): void;
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string, opts: { encoding: "utf8" }): string;
  unlink(path: string): void;
  analyzePath(path: string): { exists: boolean };
}

/* glyph_info: int glyph; int ttychar; uint32 framecolor; glyph_map gm;
   glyph_map: unsigned glyphflags; {int color; int symidx} sym;
              uint32 customcolor; uint16 color256idx; short tileidx; ... */
const GI_GLYPH = 0;
const GI_TTYCHAR = 4;
const GI_GLYPHFLAGS = 12;
const GI_COLOR = 16;
const GI_TILEIDX = 30;

export interface GlyphInfo {
  glyph: number;
  ch: number;
  color: number;
  glyphFlags: number;
  tile: number;
}

export function readGlyphInfo(m: NetHackModule, ptr: number): GlyphInfo | null {
  if (!ptr) return null;
  return {
    glyph: m.getValue(ptr + GI_GLYPH, "i32"),
    ch: m.getValue(ptr + GI_TTYCHAR, "i32"),
    color: m.getValue(ptr + GI_COLOR, "i32"),
    glyphFlags: m.getValue(ptr + GI_GLYPHFLAGS, "i32") >>> 0,
    tile: m.getValue(ptr + GI_TILEIDX, "i16"),
  };
}

/* menu_item: anything item (8 bytes: the union holds int64); long count;
   unsigned itemflags. The core frees the array. */
const MI_SIZE = 16;
const MI_ITEM = 0;
const MI_COUNT = 8;

export function writeMenuSelection(
  m: NetHackModule,
  listPtr: number,
  selection: { identifier: number; count: number }[],
): void {
  const arr = m._malloc(MI_SIZE * selection.length);
  selection.forEach((s, i) => {
    const base = arr + i * MI_SIZE;
    m.setValue(base + MI_ITEM, s.identifier, "i32");
    m.setValue(base + MI_ITEM + 4, 0, "i32");
    m.setValue(base + MI_COUNT, s.count, "i32");
    m.setValue(base + 12, 0, "i32");
  });
  m.setValue(listPtr, arr, "*");
}

/** nh_poskey's x and y are coordxy (int16) pointers. */
export function writePosition(m: NetHackModule, xPtr: number, yPtr: number, modPtr: number, x: number, y: number, mod: number): void {
  m.setValue(xPtr, x, "i16");
  m.setValue(yPtr, y, "i16");
  m.setValue(modPtr, mod, "i32");
}

const BUFSZ = 256;

export function writeLine(m: NetHackModule, bufPtr: number, text: string): void {
  m.stringToUTF8(text, bufPtr, BUFSZ);
}

const EQUIPMENT_SLOTS = 12;

export function readEquipment(m: NetHackModule): { letter: string; tile: number }[] {
  const out = [];
  for (let slot = 0; slot < EQUIPMENT_SLOTS; slot++) {
    const letter = m._nhweb_equip_letter(slot);
    out.push({ letter: letter ? String.fromCharCode(letter) : "", tile: m._nhweb_equip_tile(slot) });
  }
  return out;
}

export function readExtCommands(m: NetHackModule): { index: number; name: string; description: string; autocompletes: boolean }[] {
  const out = [];
  for (let i = 0; ; i++) {
    const status = m._nhweb_extcmd_status(i);
    if (status < 0) break;
    if (status === 0) continue;
    out.push({
      index: i,
      name: m.UTF8ToString(m._nhweb_extcmd_name(i)),
      description: m.UTF8ToString(m._nhweb_extcmd_desc(i)),
      autocompletes: (status & 2) !== 0,
    });
  }
  return out;
}

const GENDERS = 2;
const ALIGNS = 3;

/** A data file as display_file() would show it, or null if the core can't open it. */
export function readDataFile(m: NetHackModule, name: string): string | null {
  const ptr = m.ccall("nhweb_read_file", "number", ["string"], [name]) as number;
  if (!ptr) return null;
  const text = m.UTF8ToString(ptr);
  m._free(ptr);
  return text;
}

/** Farlook's text for a square, or null outside play. */
export function describeSquare(m: NetHackModule, x: number, y: number): string | null {
  const ptr = m._nhweb_describe(x, y);
  return ptr ? m.UTF8ToString(ptr) : null;
}

export function readPlayerChoices(m: NetHackModule): PlayerChoices {
  const roles: PlayerChoices["roles"] = [];
  for (let ro = 0; m._nhweb_role_name(ro, 0); ro++) {
    roles.push({
      name: m.UTF8ToString(m._nhweb_role_name(ro, 0)),
      femaleName: m.UTF8ToString(m._nhweb_role_name(ro, 1)),
      tile: m._nhweb_role_tile(ro, 0),
      femaleTile: m._nhweb_role_tile(ro, 1),
    });
  }
  const races: PlayerChoices["races"] = [];
  for (let ra = 0; m._nhweb_race_name(ra); ra++) {
    races.push({ name: m.UTF8ToString(m._nhweb_race_name(ra)), tile: m._nhweb_race_tile(ra, 0), femaleTile: m._nhweb_race_tile(ra, 1) });
  }
  const each = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));
  return {
    roles,
    races,
    validRace: each(roles.length, (ro) => each(races.length, (ra) => !!m._nhweb_valid_race(ro, ra))),
    validGender: each(roles.length, (ro) => each(races.length, (ra) => each(GENDERS, (g) => !!m._nhweb_valid_gender(ro, ra, g)))),
    validAlign: each(roles.length, (ro) => each(races.length, (ra) => each(ALIGNS, (a) => !!m._nhweb_valid_align(ro, ra, a)))),
    chosen: { role: m._nhweb_chosen(0), race: m._nhweb_chosen(1), gender: m._nhweb_chosen(2), align: m._nhweb_chosen(3) },
  };
}
