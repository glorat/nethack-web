// A typed character name made safe as tty and Cocoa make it: the name becomes part of the
// save file's name, a leading digit would run into the uid before it, and NETHACKOPTIONS
// can't carry commas or colons.

const PL_NSIZ = 32;

export function playerName(typed: string): string {
  return [...typed.trim().slice(0, PL_NSIZ - 1)]
    .map((c, i) => (/[A-Za-z@-]/.test(c) || (/[0-9]/.test(c) && i > 0) ? c : "_"))
    .join("");
}

export const PLAY_PATH = `${import.meta.env.BASE_URL}play/`;

const NAME_KEY = "nethack-web.name";

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** False if the browser wouldn't keep it. */
export function saveName(name: string): boolean {
  try {
    localStorage.setItem(NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}
