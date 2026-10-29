import { useLayoutEffect } from "preact/hooks";
import { keyCode } from "../../port/keys";

interface Props {
  query: string;
  choices: string;
  defaultChoice: string;
  onDone(key: string | null): void;
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
  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return onDone(null);
      if (e.key === "Enter" || e.key === " ") return onDone(defaultChoice || null);
      // with no choices any key answers, as for "In what direction?", so arrows map to hjkl as in play
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
        <div class="dialog-buttons">
          {keys.map((k) => (
            <button class={k === defaultChoice ? "primary" : undefined} onClick={() => onDone(k)}>
              {named[k] ?? LABELS[k] ?? k}
            </button>
          ))}
          {!keys.length ? <span class="hint">Press a key</span> : null}
        </div>
      </div>
    </div>
  );
}
