import { toolbarActions } from "../port/here-actions";

/** What the hero can do where they stand, as buttons over the map's bottom-left corner. */
export function QuickActions({ letters, onRun }: { letters: string; onRun(letter: string): void }) {
  const actions = toolbarActions(letters);
  if (!actions.length) return null;
  return (
    <div class="quick-actions" role="group" aria-label="What you can do here">
      {actions.map((a) => (
        <button key={a.letter} onClick={() => onRun(a.letter)}>
          {a.label}
          <span class="quick-key" aria-hidden="true">
            {a.key}
          </span>
        </button>
      ))}
    </div>
  );
}
