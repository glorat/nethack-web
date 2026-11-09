import { ACTION_HINTS } from "../port/hints";
import { toolbarActions } from "../port/here-actions";
import type { HintMarker } from "./hints";

/** What the hero can do where they stand, as buttons over the map's bottom-left corner. */
export function QuickActions({
  names,
  leavesDungeon,
  onRun,
  hint,
}: {
  names: string;
  leavesDungeon: boolean;
  onRun(name: string): void;
  hint: HintMarker;
}) {
  const actions = toolbarActions(names, leavesDungeon);
  if (!actions.length) return null;
  return (
    <div class="quick-actions" role="group" aria-label="What you can do here">
      {actions.map((a) => (
        <span key={a.name} class="quick-action">
          <button onClick={() => onRun(a.name)}>
            {a.label}
            <span class="quick-key" aria-hidden="true">
              {a.key}
            </span>
          </button>
          {hint(ACTION_HINTS[a.name] ?? null)}
        </span>
      ))}
    </div>
  );
}
