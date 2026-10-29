import { useEffect, useRef, useState } from "preact/hooks";
import { commandToRun, listCommands } from "../../port/extcmd";
import type { ExtCommand } from "../../protocol";

interface Props {
  commands: ExtCommand[];
  initial?: string;
  onDone(index: number): void;
}

export function ExtCommandDialog({ commands, initial = "", onDone }: Props) {
  const [filter, setFilter] = useState(initial);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const shown = listCommands(commands, filter);
  const pick = shown[Math.min(active, shown.length - 1)];

  return (
    <div class="dialog-backdrop">
      <div class="dialog ext-dialog" role="dialog">
        <div class="dialog-title">#</div>
        <input
          ref={input}
          value={filter}
          autocomplete="off"
          placeholder="Extended command"
          onInput={(e) => {
            setFilter((e.target as HTMLInputElement).value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onDone(-1);
            else if (e.key === "Enter") onDone(commandToRun(commands, filter, pick)?.index ?? -1);
            else if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, shown.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
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
