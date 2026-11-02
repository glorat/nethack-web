import type { AuthorityChoice, FixedInputs } from "../protocol";

const KEY = "nethack.fixedInputs";

/** The browser's own answers, unless the tests have set their own; never in a production build. */
export function gameAuthority(): AuthorityChoice {
  const saved = import.meta.env.DEV ? localStorage.getItem(KEY) : null;
  return saved ? { kind: "fixed", inputs: JSON.parse(saved) as FixedInputs } : { kind: "browser" };
}
