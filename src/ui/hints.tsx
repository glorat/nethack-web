import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { HINTS, type HintId, hintTip, parseSeen, tipParts } from "../port/hints";
import { useToggletip } from "./tooltip";

const SEEN_KEY = "nethack.hintsSeen";
const SHOW_KEY = "nethack.showHints";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export type HintMarker = (id: HintId | null) => JSX.Element | null;

/**
 * Hints for a new player: a "?" beside what a hint is about, until the player has opened and closed its popover on this device.
 * `active` is false while nothing should be hinted, as in a replay or after the game ends. `heroKind` is the status panel's.
 */
export function useHints(active: boolean, heroKind: string) {
  const toggletip = useToggletip();
  const [seen, setSeen] = useState(() => parseSeen(load(SEEN_KEY)));
  const [show, setShowState] = useState(() => load(SHOW_KEY) !== "0");

  const markSeen = (id: HintId) =>
    setSeen((s) => {
      if (s.has(id)) return s;
      const next = new Set(s).add(id);
      store(SEEN_KEY, JSON.stringify([...next]));
      return next;
    });

  const marker: HintMarker = (id) => {
    if (!id || !active || !show || seen.has(id)) return null;
    const tip = hintTip(id, heroKind);
    const { wiki } = HINTS[id];
    return (
      <button
        type="button"
        class="hint-marker"
        aria-label={`Hint: ${tipParts(tip).map((p) => p.text).join("")}`}
        // so Enter after a click plays rather than pressing this again
        onMouseDown={(e) => e.preventDefault()}
        {...toggletip.on(tip, wiki, () => markSeen(id))}
      >
        ?
      </button>
    );
  };

  return {
    marker,
    element: toggletip.element,
    sync: toggletip.sync,
    show,
    setShow: (on: boolean) => {
      setShowState(on);
      store(SHOW_KEY, on ? null : "0");
    },
    anySeen: seen.size > 0,
    reset: () => {
      setSeen(new Set());
      store(SEEN_KEY, null);
    },
  };
}
