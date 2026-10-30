import { useLayoutEffect } from "preact/hooks";
import { keyCode, type KeyLike } from "../../port/keys";
import { keyLike } from "../keyevent";

interface Props {
  lines: { attr: number; text: string }[];
  /** next: a key that closed the window, for the game to have next. */
  onDone(next?: KeyLike): void;
}

// Return, ^J, ^C, space and Esc
const DISMISS = [13, 10, 3, 32, 27];
const ATR_BOLD = 1;
const ATR_INVERSE = 7;

export function TextDialog({ lines, onDone }: Props) {
  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyLike(e);
      const code = keyCode(k);
      if (code === null) return;
      e.preventDefault();
      e.stopPropagation();
      // a dismiss key passed on would answer the game's next prompt; any other is the player playing on
      if (DISMISS.includes(code)) return onDone();
      // but not a key typed before the window opened, replayed into it: the window waits to be seen
      if (!e.isTrusted) return;
      onDone(k);
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
          <button class="primary" onClick={() => onDone()}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
