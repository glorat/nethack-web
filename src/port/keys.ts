// Browser key events to the character codes nhgetch/nh_poskey return.

export interface KeyLike {
  key: string;
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
