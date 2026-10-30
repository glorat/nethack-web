import { useLayoutEffect, useRef, useState } from "preact/hooks";

interface Props {
  text: string;
  /** null to keep the file as it was; false back if the text couldn't be kept. */
  onDone(text: string | null): boolean;
}

export function OptionsDialog({ text, onDone }: Props) {
  const [value, setValue] = useState(text);
  const [failed, setFailed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => area.current?.focus(), []);
  // keys typed here are text, not commands for the game, which listens on window
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape" && !e.isComposing) onDone(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <div class="dialog-backdrop">
      <div class="dialog options-dialog" role="dialog" aria-label="Options file">
        <div class="dialog-title">Options file</div>
        <textarea ref={area} class="options-text" spellcheck={false} value={value} onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)} />
        <div class="dialog-buttons">
          <span class="hint">
            {failed ? "This browser won't keep the file; copy it somewhere safe." : "Changes take effect when you start a new game."}
          </span>
          <button onClick={() => onDone(null)}>Cancel</button>
          <button class="primary" onClick={() => setFailed(!onDone(value))}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
