import { expect, test } from "vitest";

const files = import.meta.glob<string>("../../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
/** The only common files that may choose a mode. */
const CHOOSERS = new Set(["ui/App.tsx", "ui/Landing.tsx", "worker/worker.ts"]);

const modeOf = (path: string) => /^(online|offline)(?:\/|$)/.exec(path)?.[1] ?? null;

function crossings(): string[] {
  return Object.entries(files).flatMap(([key, text]) => {
    const from = key.replace("../../src/", "");
    const specifiers = [...text.matchAll(/(?:from\s+|import\s*\(?\s*)"(\.[^"]+)"/g)].map((m) => m[1]);
    return specifiers.flatMap((specifier) => {
      const to = new URL(specifier, `file:///${from}`).pathname.slice(1);
      const target = modeOf(to);
      if (!target || target === modeOf(from) || CHOOSERS.has(from)) return [];
      return [`${from} imports ${to}`];
    });
  });
}

test("online and offline code stay apart, and common code doesn't depend on either", () => {
  expect(Object.keys(files).length).toBeGreaterThan(50);
  expect(crossings()).toEqual([]);
});
