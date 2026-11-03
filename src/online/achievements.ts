// A player's achievements, as the server lists them: its whole catalogue, with when each was earned, by its replays.

export type Achievement =
  | { id: string; name: string; description: string; group: string; earned?: { at: number; game: string; turn: number } }
  /** Hidden until earned: the server says nothing else of it. */
  | { hidden: true };

export type Shown = Exclude<Achievement, { hidden: true }>;

export const earned = (list: Achievement[]): Shown[] => list.filter((a): a is Shown => "earned" in a && a.earned !== undefined);

/** The latest earned first. */
export const latest = (list: Achievement[], count: number): Shown[] => earned(list).sort((a, b) => b.earned!.at - a.earned!.at).slice(0, count);

/** Those the server shows, under their headings in its order, and how many it keeps hidden. */
export function grouped(list: Achievement[]): { groups: { name: string; items: Shown[] }[]; hidden: number } {
  const groups = new Map<string, Shown[]>();
  let hidden = 0;
  for (const a of list) {
    if ("hidden" in a) hidden++;
    else groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  }
  return { groups: [...groups].map(([name, items]) => ({ name, items })), hidden };
}
