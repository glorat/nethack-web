// A player's account as the server last projected it: signed in or not, and their public handle once they have one.

export type Outcome = "granted" | "taken" | "refused" | "has a handle";

export interface Profile {
  signedIn: boolean;
  handle: string | null;
  /** What a new online game's character is called: the handle, or a name made from the uid. */
  name: string;
  request: { handle: string; outcome: Outcome } | null;
}

/** As the server checks it. No `-`, which the core reads as the start of a role or race. */
export const HANDLE_FORMAT = /^[A-Za-z][A-Za-z0-9]{2,19}$/;

export const HANDLE_HINT = "3 to 20 letters and digits, starting with a letter";

/** The name the server gives a player with no handle yet, which no handle can be. */
export const anonymous = (name: string): boolean => name.startsWith("an_");

/** A character's name as shown: one made from a uid says nothing to anyone. */
export const shownName = (name: string): string => (anonymous(name) ? "Anonymous" : name);

/** Why the latest request didn't give the player a handle, if it didn't. */
export function requestNote(profile: Profile): string | null {
  const { handle, request } = profile;
  if (handle || !request) return null;
  if (request.outcome === "taken") return `${request.handle} is taken. Choose another.`;
  if (request.outcome === "refused") return `${request.handle} can't be used. Choose another.`;
  return null;
}
