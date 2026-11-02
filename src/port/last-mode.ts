// Which mode was played last, so the landing page knows what to offer first.

const LAST_MODE_KEY = "nethack-web.lastMode";

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
  } catch {}
}
