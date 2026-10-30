import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { keyCode } from "../../port/keys";
import { answerLabel, answersInRow, countKey, visibleAnswers } from "../../port/yn";

interface Props {
  query: string;
  choices: string;
  defaultChoice: string;
  /** count: with '#', how many a counted answer takes. */
  onDone(key: string | null, count?: number): void;
}

export function YesNoDialog({ query, choices, defaultChoice, onDone }: Props) {
  const keys = visibleAnswers(choices);
  const labels = keys.map((k) => answerLabel(choices, k));
  const inRow = answersInRow(labels);
  // every button shows its key, so players learn to answer from the keyboard
  const button = (k: string, n: number) => (
    <button class={[inRow ? "" : "answer", k === defaultChoice ? "primary" : ""].join(" ").trim()} onClick={() => answer(k)}>
      <span class="answer-key">{k}</span>
      {labels[n] !== k ? <span> {labels[n]}</span> : null}
    </button>
  );
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
        {inRow || !keys.length ? (
          <div class="dialog-buttons">
            {/* the first answer rightmost, as Cocoa lays them out */}
            {keys.map(button).reverse()}
            {!keys.length ? <span class="hint">Press a key</span> : null}
          </div>
        ) : (
          <div class="answers">{keys.map(button)}</div>
        )}
      </div>
    </div>
  );
}
