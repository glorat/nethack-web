import type { FixedInputs } from "../protocol";

const KEY = "nethack.fixedInputs";

/** What the tests have asked a game to take in place of the machine's own; never in a production build. */
export function fixedInputs(): FixedInputs | undefined {
  if (!import.meta.env.DEV || typeof document === "undefined") return undefined;
  const saved = localStorage.getItem(KEY);
  return saved ? (JSON.parse(saved) as FixedInputs) : undefined;
}
