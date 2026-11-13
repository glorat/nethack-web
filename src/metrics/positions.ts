import type { Metric } from "./metric";

/** Each change of the hero's square or level: [turn, level, dungeon, x, y], x and y null when nothing marks her. */
export const positions: Metric = {
  name: "positions",
  tier: "visible",
  create() {
    const changes: [number, string, string, number | null, number | null][] = [];
    let last = "";
    return {
      step(s) {
        const key = `${s.level}/${s.dungeon}/${s.hero?.x}/${s.hero?.y}`;
        if (key === last) return;
        last = key;
        changes.push([s.turn, s.level, s.dungeon, s.hero?.x ?? null, s.hero?.y ?? null]);
      },
      result: () => changes,
    };
  },
};
