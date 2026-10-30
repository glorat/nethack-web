import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { keyCode } from "../../port/keys";
import { countKey } from "../../port/yn";

interface Props {
  query: string;
  choices: string;
  defaultChoice: string;
  /** count: with '#', how many a counted answer takes. */
  onDone(key: string | null, count?: number): void;
}

const LABELS: Record<string, string> = { y: "Yes", n: "No", q: "Quit", a: "All" };

// choices may carry a count marker after ESC ("yn#\033..."); only the letters before it are buttons
function buttons(choices: string): string[] {
  const visible = choices.split("\x1b")[0];
  return [...visible].filter((c) => c !== "#");
}

// a query such as "Destroy [y], Recover [r], or Cancel [n]?" names its own answers
function namedAnswers(query: string): Record<string, string> {
  return Object.fromEntries([...query.matchAll(/(\w+) \[(\w)\]/g)].map((m) => [m[2], m[1]]));
}

export function YesNoDialog({ query, choices, defaultChoice, onDone }: Props) {
  const keys = buttons(choices);
  const named = namedAnswers(query);
  // with '#' in the choices, digits typed first take only that many; a ref, for keys typed ahead
  const allowsCount = choices.includes("#");
  const count = useRef<number | null>(null);
  const [, rerender] = useState(0);
  const setCount = (n: number | null) => {
    count.current = n;
    rerender((r) => r + 1);
  };
  // Yes while counting takes the count, as the y key does
  const answer = (k: string) => {
    const step = k === "y" && count.current !== null ? countKey(count.current, "y") : null;
    if (step && "answer" in step) return onDone(step.answer, step.count);
    onDone(k);
  };
  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      e.preventDefault();
      e.stopPropagation();
      const step = allowsCount ? countKey(count.current, e.key) : null;
      if (step && "answer" in step) return onDone(step.answer, step.count);
      if (step) return setCount(step.count);
      if (e.key === "Escape") return onDone(null);
      if (e.key === "Enter" || e.key === " ") return onDone(defaultChoice || null);
      // with no choices any key answers, as for "Open where? [.>]", so arrows map to hjkl as in play
      if (!keys.length) {
        const code = keyCode(e);
        if (code !== null && code < 128) onDone(String.fromCharCode(code));
        return;
      }
      if (e.key.length === 1 && choices.includes(e.key)) onDone(e.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div class="dialog-backdrop">
      <div class="dialog yn-dialog" role="dialog">
        <div class="dialog-title">{query}</div>
        {allowsCount ? (
          <div class="hint">
            {count.current !== null ? `Count: ${count.current}. Press Return to take that many.` : "Type a number first to take only that many."}
          </div>
        ) : null}
        <div class="dialog-buttons">
          {keys.map((k) => (
            <button class={k === defaultChoice ? "primary" : undefined} onClick={() => answer(k)}>
              {named[k] ?? LABELS[k] ?? k}
            </button>
          ))}
          {!keys.length ? <span class="hint">Press a key</span> : null}
        </div>
      </div>
    </div>
  );
}
