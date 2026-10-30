import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { commandToRun, completionOf, listCommands } from "../../port/extcmd";
import type { ExtCommand } from "../../protocol";

interface Props {
  commands: ExtCommand[];
  initial?: string;
  onDone(index: number): void;
}

export function ExtCommandDialog({ commands, initial = "", onDone }: Props) {
  // what the player typed, which the list follows; the field also holds any completion
  const [filter, setFilter] = useState(initial);
  const typed = useRef(initial);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // layout effect: focus before the dialog is painted, or keys typed fast after # are lost
  useLayoutEffect(() => {
    const field = input.current!;
    field.focus();
    show(field, initial, completionOf(commands, initial, ""));
  }, []);

  const type = (text: string) => {
    typed.current = text;
    setFilter(text);
    setActive(0);
  };

  // the completed part stays selected, so typing on replaces it
  const show = (field: HTMLInputElement, text: string, completion: string | null) => {
    field.value = completion ?? text;
    field.setSelectionRange(text.length, field.value.length);
  };

  const shown = listCommands(commands, filter);
  const pick = shown[Math.min(active, shown.length - 1)];

  return (
    <div class="dialog-backdrop">
      <div class="dialog ext-dialog" role="dialog">
        <div class="dialog-title">#</div>
        <input
          ref={input}
          defaultValue={initial}
          autocomplete="off"
          placeholder="Extended command"
          onInput={(e) => {
            const field = e.currentTarget;
            const text = field.value;
            if (!(e as InputEvent).isComposing) {
              const completion = completionOf(commands, text, typed.current);
              if (completion) show(field, text, completion);
            }
            type(text);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.isComposing) return;
            const field = e.currentTarget;
            // as tty, Esc clears what's typed before it cancels
            if (e.key === "Escape" && field.value) {
              field.value = "";
              type("");
            } else if (e.key === "Escape") onDone(-1);
            else if (e.key === "Enter") onDone(commandToRun(commands, field.value, pick)?.index ?? -1);
            // choosing a row drops the completion, so Return runs the row
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              show(field, typed.current, null);
              setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, shown.length - 1) : Math.max(a - 1, 0)));
            }
            else return;
            e.preventDefault();
          }}
        />
        <div class="ext-list">
          {shown.map((c) => (
            <button class={c === pick ? "ext-item active" : "ext-item"} onClick={() => onDone(c.index)}>
              <span class="ext-name">{c.name}</span>
              <span class="ext-desc">{c.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
