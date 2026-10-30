// Browser key events to the character codes nhgetch/nh_poskey return.

export interface KeyLike {
  key: string;
  /** The physical key, which tells the numeric keypad's digits from the row above the letters. */
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

// vi-keys; with number_pad on the core reads digits instead, which the
// numeric keypad already produces.
const ARROWS: Record<string, string> = {
  ArrowLeft: "h",
  ArrowDown: "j",
  ArrowUp: "k",
  ArrowRight: "l",
  Home: "y",
  PageUp: "u",
  End: "b",
  PageDown: "n",
};

export function keyCode(e: KeyLike): number | null {
  if (e.metaKey) return null;
  if (e.key in ARROWS) return ARROWS[e.key].charCodeAt(0);
  switch (e.key) {
    case "Enter":
      return 13;
    case "Escape":
      return 27;
    case "Backspace":
      return 8;
    case "Tab":
      return 9;
  }
  if (e.key.length !== 1) return null;
  const code = e.key.charCodeAt(0);
  if (code > 127) return null;
  if (e.ctrlKey) {
    const upper = e.key.toUpperCase().charCodeAt(0);
    return upper >= 64 && upper <= 95 ? upper & 0x1f : null;
  }
  // the core's M() meta bit, as tty sets it for Alt with altmeta
  if (e.altKey) return code | 0x80;
  return code;
}

/**
 * Keys typed ahead into a prompt that takes a line (#, getlin), as tty takes them:
 * printable keys are the text, Backspace edits it, Return or Escape ends it.
 * Removes what it uses from `keys`; a line not yet ended leaves `end` null.
 */
export function takeLine(keys: KeyLike[]): { text: string; end: "return" | "escape" | null } {
  let text = "";
  while (keys.length) {
    const k = keys.shift()!;
    if (k.key === "Enter") return { text, end: "return" };
    if (k.key === "Escape") return { text, end: "escape" };
    if (k.key === "Backspace") text = text.slice(0, -1);
    else if (k.key.length === 1 && !k.ctrlKey && !k.metaKey) text += k.key;
  }
  return { text, end: null };
}

const DIAGONALS: Record<string, string> = {
  "ArrowLeft ArrowUp": "Home",
  "ArrowRight ArrowUp": "PageUp",
  "ArrowLeft ArrowDown": "End",
  "ArrowRight ArrowDown": "PageDown",
};

function diagonal(a: string, b: string): string | undefined {
  return DIAGONALS[`${a} ${b}`] ?? DIAGONALS[`${b} ${a}`];
}

const bareArrow = (k: KeyLike) => k.key.startsWith("Arrow") && !k.ctrlKey && !k.altKey && !k.metaKey;

/**
 * Two arrow keys pressed together move diagonally, as in Cocoa: an arrow waits
 * for its release, or for a second arrow, before it is typed.
 */
export class ArrowChords {
  private held: KeyLike | null = null;

  /** The keys a key press types, in order. */
  down(k: KeyLike): KeyLike[] {
    const held = this.held;
    this.held = null;
    if (held) {
      const both = diagonal(held.key, k.key);
      if (both && bareArrow(k)) return [{ ...k, key: both }];
      return [held, k];
    }
    if (bareArrow(k)) {
      this.held = k;
      return [];
    }
    return [k];
  }

  /** The keys a key release types: a waiting arrow, if any. */
  up(): KeyLike[] {
    const held = this.held;
    this.held = null;
    return held ? [held] : [];
  }
}

// indices into the core's direction keys: W NW N NE E SE S SW down up
const DIRECTION_INDEX: Record<string, number> = {
  ArrowLeft: 0, Home: 1, ArrowUp: 2, PageUp: 3, ArrowRight: 4, PageDown: 5, ArrowDown: 6, End: 7,
};
const KEYPAD_INDEX: Record<string, number> = {
  Numpad4: 0, Numpad7: 1, Numpad8: 2, Numpad9: 3, Numpad6: 4, Numpad3: 5, Numpad2: 6, Numpad1: 7,
};

/**
 * A key at a direction prompt: arrows and the keypad go the way they point whatever number_pad says,
 * keypad 5 is self and keypad Enter is Return; others as keyCode.
 */
export function directionKey(e: KeyLike, directions: string): number | null {
  if (e.metaKey) return null;
  const at = (e.code ? KEYPAD_INDEX[e.code] : undefined) ?? DIRECTION_INDEX[e.key];
  if (at !== undefined && directions[at]) return directions.charCodeAt(at);
  if (e.code === "Numpad5") return ".".charCodeAt(0);
  if (e.code === "NumpadEnter") return 13;
  return keyCode(e);
}
