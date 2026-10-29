import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  query: string;
  onDone(text: string | null): void;
}

export function InputDialog({ query, onDone }: Props) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div class="dialog-backdrop">
      <form
        class="dialog input-dialog"
        role="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(text);
        }}
      >
        <label class="dialog-title" for="getlin">
          {query}
        </label>
        <input
          id="getlin"
          ref={input}
          value={text}
          maxLength={255}
          autocomplete="off"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onDone(null);
          }}
        />
        <div class="dialog-buttons">
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" class="primary">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
