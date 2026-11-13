import type { Metric } from "./metric";

/** Each change of encumbrance, with the level it happened on: [turn, level, cap], cap "" when unencumbered. */
export const encumbrance: Metric = {
  name: "encumbrance",
  tier: "visible",
  create() {
    const changes: [number, string, string][] = [];
    let last: string | null = null;
    return {
      step(s) {
        const cap = (s.state.status.BL_CAP?.text ?? "").trim();
        if (cap === last) return;
        last = cap;
        changes.push([s.turn, s.level, cap]);
      },
      result: () => changes,
    };
  },
};
