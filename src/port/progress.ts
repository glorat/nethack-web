// What the landing page offers to carry on with. Only ever a hint: the game page finds out for itself what there is to play.

const OFFLINE_KEY = "nethack-web.offlineGames";
const LAST_MODE_KEY = "nethack-web.lastMode";

export type GameMode = "online" | "offline";

function offlineGames(): string[] {
  try {
    const names: unknown = JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]");
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function keepOfflineGames(names: string[]): void {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(names));
  } catch {}
}

export const offlineGameUnder = (name: string): boolean => offlineGames().includes(name);

export function offlineGameStarted(name: string): void {
  if (!offlineGameUnder(name)) keepOfflineGames([...offlineGames(), name]);
}

export function offlineGameEnded(name: string): void {
  keepOfflineGames(offlineGames().filter((n) => n !== name));
}

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
