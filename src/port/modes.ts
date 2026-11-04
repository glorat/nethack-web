// The two modes, each under its own address, and the one the site's root opens.

export type GameMode = "online" | "offline";
export type Page = "home" | "play" | "watch";

const BASE = import.meta.env.BASE_URL;
const MODE_KEY = "nethack-web.lastMode";

export const homeAddress = (mode: GameMode) => `${BASE}${mode}/`;
export const playAddress = (mode: GameMode) => `${BASE}${mode}/play/`;
export const watchAddress = (mode: GameMode) => `${BASE}${mode}/watch/`;

/** Which mode and page an address is, or null for one outside both, such as the root. */
export function placeOf(pathname: string): { mode: GameMode; page: Page } | null {
  const match = new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(online|offline)(?:/(?:(play|watch)/?)?)?$`).exec(pathname);
  return match ? { mode: match[1] as GameMode, page: (match[2] as Page | undefined) ?? "home" } : null;
}

/** The mode last visited, for the root to open; null for a first visit or a browser that keeps nothing. */
export function lastMode(): GameMode | null {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    return mode === "online" || mode === "offline" ? mode : null;
  } catch {
    return null;
  }
}

export function keepLastMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}
