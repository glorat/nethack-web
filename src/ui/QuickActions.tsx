import { toolbarActions } from "../port/here-actions";

/** What the hero can do where they stand, as buttons over the map's bottom-left corner. */
export function QuickActions({ names, onRun }: { names: string; onRun(name: string): void }) {
  const actions = toolbarActions(names);
  if (!actions.length) return null;
  return (
    <div class="quick-actions" role="group" aria-label="What you can do here">
      {actions.map((a) => (
        <button key={a.name} onClick={() => onRun(a.name)}>
          {a.label}
          <span class="quick-key" aria-hidden="true">
            {a.key}
          </span>
        </button>
      ))}
    </div>
  );
}
