import { useLayoutEffect } from "preact/hooks";

interface Props {
  lines: { attr: number; text: string }[];
  onDone(): void;
}

const ATR_BOLD = 1;
const ATR_INVERSE = 7;

export function TextDialog({ lines, onDone }: Props) {
  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <div class="dialog-backdrop">
      <div class="dialog text-dialog" role="dialog">
        <pre class="text-body">
          {lines.map((l) => (
            <div class={l.attr === ATR_BOLD || l.attr === ATR_INVERSE ? "strong" : undefined}>{l.text || " "}</div>
          ))}
        </pre>
        <div class="dialog-buttons">
          <button class="primary" onClick={onDone}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
