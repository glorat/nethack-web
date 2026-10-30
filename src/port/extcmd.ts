// The # command list, with the rules of Cocoa's ExtCommandInput (and tty's autocompletion).
import type { ExtCommand } from "../protocol";

/** Commands that autocomplete and start with what's typed, then any whose help mentions it. */
export function listCommands(commands: ExtCommand[], typed: string): ExtCommand[] {
  const t = typed.trim().toLowerCase();
  const byName = commands.filter((c) => c.autocompletes && c.name.length > 1 && c.name.toLowerCase().startsWith(t));
  const byHelp = t.length > 1 ? commands.filter((c) => !byName.includes(c) && c.description.toLowerCase().includes(t)) : [];
  return [...byName, ...byHelp];
}

/** As tty, a prefix only one command starts with completes to its name, but not while deleting. */
export function completionOf(commands: ExtCommand[], typed: string, before: string): string | null {
  if (!typed || typed.length <= before.length) return null;
  const t = typed.toLowerCase();
  const named = commands.filter((c) => c.autocompletes && c.name.length > 1 && c.name.toLowerCase().startsWith(t));
  return named.length === 1 && named[0].name.length > typed.length ? named[0].name : null;
}

/** A name typed in full runs, even one that doesn't autocomplete; otherwise the highlighted row. */
export function commandToRun(commands: ExtCommand[], typed: string, highlighted: ExtCommand | undefined): ExtCommand | null {
  const t = typed.trim().toLowerCase();
  if (t) {
    const exact = commands.find((c) => c.name.toLowerCase() === t);
    if (exact) return exact;
  }
  return highlighted ?? null;
}
