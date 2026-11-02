// The last finished game's recording, which /play/?replay plays.

const LAST_GAME_KEY = "nethack.lastGame";

export function lastGame(): string | null {
  try {
    return localStorage.getItem(LAST_GAME_KEY);
  } catch {
    return null;
  }
}

/** False if the browser wouldn't keep it, as it won't one too big, or it couldn't replay, which leaves the last game that can. */
export function keepLastGame(text: string): boolean {
  if (/^\d+ session (?:unrecorded|recover) /m.test(text)) return false;
  try {
    localStorage.setItem(LAST_GAME_KEY, text);
    return true;
  } catch {
    return false;
  }
}
