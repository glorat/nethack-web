// A finished online game's ID in a share link: its UUID as 22 base64url characters. nethack-server builds this file into
// its functions, so it imports nothing.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function shortId(game: string): string {
  const hex = game.replace(/-/g, "");
  let bytes = "";
  for (let i = 0; i < 32; i += 2) bytes += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The game a link names, by its short form or its UUID; null if it names none. */
export function gameOf(id: string): string | null {
  if (UUID.test(id)) return id;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const bytes = atob(id.replace(/-/g, "+").replace(/_/g, "/") + "==");
  const hex = [...bytes].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  const game = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return shortId(game) === id ? game : null;
}
