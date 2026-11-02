// Which mode was played last, so the landing page knows what to offer first.

const LAST_MODE_KEY = "nethack-web.lastMode";
const PLAYED_ONLINE_KEY = "nethack-web.playedOnline";

export type GameMode = "online" | "offline";

export function lastMode(): GameMode | null {
  try {
    const mode = localStorage.getItem(LAST_MODE_KEY);
    return mode === "online" || mode === "offline" ? mode : null;
  } catch {
    return null;
  }
}

export function keepLastMode(mode: GameMode): void {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
    if (mode === "online") localStorage.setItem(PLAYED_ONLINE_KEY, "1");
  } catch {}
}

/** Whether this browser has ever played online, so has games on the server worth asking after. */
export function playedOnline(): boolean {
  try {
    return localStorage.getItem(PLAYED_ONLINE_KEY) !== null || lastMode() === "online";
  } catch {
    return false;
  }
}
