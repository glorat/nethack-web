import { useState } from "preact/hooks";

const NAME_KEY = "nethack-web.name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

// options the core reads before the first window opens; commas and colons would break NETHACKOPTIONS
function cleanName(name: string): string {
  return name.replace(/[,:=]/g, "").trim().slice(0, 31);
}

export function StartScreen({ onStart }: { onStart(name: string): void }) {
  const [name, setName] = useState(savedName);
  const valid = cleanName(name).length > 0;
  return (
    <div class="start">
      <form
        class="start-card"
        onSubmit={(e) => {
          e.preventDefault();
          const n = cleanName(name);
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
      </form>
    </div>
  );
}
