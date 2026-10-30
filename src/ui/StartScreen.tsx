import { useState } from "preact/hooks";
import { playerName } from "../port/name";

const NAME_KEY = "nethack-web.name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}


export function StartScreen({ onStart, onOptions }: { onStart(name: string): void; onOptions(): void }) {
  const [name, setName] = useState(savedName);
  const valid = playerName(name).length > 0;
  return (
    <div class="start">
      <form
        class="start-card"
        onSubmit={(e) => {
          e.preventDefault();
          const n = playerName(name);
          if (!n) return;
          try {
            localStorage.setItem(NAME_KEY, n);
          } catch {
            // private mode: the name just isn't remembered
          }
          onStart(n);
        }}
      >
        <h1>NetHack</h1>
        <p class="start-sub">A saved game under this name is restored.</p>
        <label for="name">Who are you?</label>
        <input id="name" value={name} autofocus maxLength={31} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button type="submit" class="primary" disabled={!valid}>
          Play
        </button>
        <button type="button" onClick={onOptions}>
          Edit Options File...
        </button>
      </form>
    </div>
  );
}
