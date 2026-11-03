// A player's achievements, as the server lists them: its whole catalogue, with when each was earned, by its replays.

export type Achievement =
  | { id: string; name: string; description: string; earned?: { at: number; game: string; turn: number } }
  /** Hidden until earned: the server says nothing else of it. */
  | { hidden: true };

export const earned = (list: Achievement[]) => list.filter((a) => "earned" in a && a.earned);

/** Earned first, latest first, then the rest in the server's order, hidden last. */
export function ordered(list: Achievement[]): Achievement[] {
  const at = (a: Achievement) => ("earned" in a && a.earned ? a.earned.at : null);
  const rank = (a: Achievement) => (at(a) !== null ? 0 : "hidden" in a ? 2 : 1);
  return list
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || (at(y.a) ?? 0) - (at(x.a) ?? 0) || x.i - y.i)
    .map(({ a }) => a);
}
