const KEY = "nethack.shadow";

/** Whether a developer has asked for the game to be shadowed, by /play/?shadow; ?shadow=0 stops it. */
export function shadowWanted(): boolean {
  const asked = new URLSearchParams(location.search).get("shadow");
  try {
    if (asked === "0") localStorage.removeItem(KEY);
    else if (asked !== null) localStorage.setItem(KEY, "1");
    return localStorage.getItem(KEY) === "1";
  } catch {
    return asked !== null && asked !== "0";
  }
}
