import type { Metric } from "./metric";

/** The messages matching the pattern given (BOT_PATTERN), with their turns: [turn, text]. */
export const messages: Metric = {
  name: "messages",
  tier: "visible",
  create({ pattern }) {
    const kept: [number, string][] = [];
    return {
      step(s) {
        if (!pattern) return;
        for (const m of s.messages) if (pattern.test(m.text)) kept.push([s.turn, m.text]);
      },
      result: () => kept,
    };
  },
};
