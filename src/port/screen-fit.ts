// Below this width the game's layout drops the inventory and squeezes the map; styles.css has the same breakpoint.
export const NARROWEST = 900;
// every iPad is at least this long on its long side, and no phone is
const TABLET_LONG_SIDE = 1024;

/**
 * What a touch screen this narrow needs before a game: a tablet turned sideways, or, on a phone, something
 * bigger. A desktop window can just be widened, so it needs nothing.
 */
export function screenAdvice(windowWidth: number, screenLongSide: number, touch: boolean): "none" | "turn" | "bigger" {
  if (windowWidth > NARROWEST || !touch) return "none";
  return screenLongSide >= TABLET_LONG_SIDE ? "turn" : "bigger";
}

export const PLAY_ANYWAY_KEY = "nethack.playOnSmallScreen";
