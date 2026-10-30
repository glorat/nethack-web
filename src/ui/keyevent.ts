// Key events as the game reads them.
import type { KeyLike } from "../port/keys";

// Option composes a character on macOS, where the key's own character has to be looked up
const OPTION_COMPOSES = /Mac|iPhone|iPad/.test(navigator.platform);

// the layout's character for each key, where the browser says (Chromium); else the US layout's letters and digits
let layout: Map<string, string> | null = null;
(navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<Map<string, string>> } }).keyboard
  ?.getLayoutMap?.()
  .then((map) => (layout = map))
  .catch(() => {});

function usKey(code: string): string | undefined {
  return /^Key([A-Z])$/.exec(code)?.[1].toLowerCase() ?? /^Digit([0-9])$/.exec(code)?.[1];
}

export function keyLike(e: KeyboardEvent): KeyLike {
  return {
    key: e.key,
    code: e.code,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    base: OPTION_COMPOSES && e.altKey ? (layout?.get(e.code) ?? usKey(e.code)) : undefined,
  };
}
