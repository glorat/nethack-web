// Reads and writes of core structs through the Emscripten heap. Offsets are
// for wasm32 and must track include/wintype.h.

export interface NetHackModule {
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  ccall(name: string, ret: string | null, argTypes: string[], args: unknown[]): unknown;
  _malloc(size: number): number;
  _nhweb_extcmd_name(i: number): number;
  _nhweb_extcmd_desc(i: number): number;
  _nhweb_extcmd_status(i: number): number;
  _nhweb_floor_tile(): number;
  _nhweb_glyph_tile(glyph: number): number;
  _nhweb_equip_letter(slot: number): number;
  _nhweb_equip_tile(slot: number): number;
  _main(argc: number, argv: number): number;
  ENV: Record<string, string>;
  FS: EmscriptenFS;
  IDBFS: unknown;
}

export interface EmscriptenFS {
  mkdir(path: string): void;
  mount(type: unknown, opts: object, mountpoint: string): void;
  syncfs(populate: boolean, callback: (err: unknown) => void): void;
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
