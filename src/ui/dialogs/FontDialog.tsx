import { useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { AsciiFont } from "../ascii";
import { installedFonts } from "../fonts";

export const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const DEFAULT_SIZE = 14;
const SAMPLE = "@ d f . # | - + < > $ ) [ % ?";

interface Props {
  font: AsciiFont | null;
  /** null for the default font; undefined to keep the font as it was. */
  onDone(font: AsciiFont | null | undefined): void;
}

export function FontDialog({ font, onDone }: Props) {
  // a saved font no longer installed stays listed, so the list shows what's chosen
  const families = useMemo(() => {
    const found = installedFonts();
    return font && !found.includes(font.family) ? [font.family, ...found] : found;
  }, []);
  const [family, setFamily] = useState(font?.family ?? "");
  const [size, setSize] = useState(font?.size ?? DEFAULT_SIZE);
  const chosen = family ? { family, size } : null;
  // the game doesn't hear keys while this is open
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      // Return on a button presses it
      if (e.key === "Enter" && (e.target as Element).closest?.("button")) return;
      if (e.key === "Escape") onDone(undefined);
      else if (e.key === "Enter") onDone(chosen);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <div class="dialog-backdrop">
      <div class="dialog font-dialog" role="dialog" aria-label="ASCII map font">
        <div class="dialog-title">ASCII map font</div>
        <div class="font-choice">
          <select aria-label="Font" value={family} onChange={(e) => setFamily((e.target as HTMLSelectElement).value)}>
            <option value="">Default</option>
            {families.map((f) => (
              <option value={f}>{f}</option>
            ))}
          </select>
          <select aria-label="Size" value={size} disabled={!family} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))}>
            {SIZES.map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div class="font-sample" style={chosen ? { font: `${size}px "${family}", monospace` } : undefined}>
          {SAMPLE}
        </div>
        <div class="dialog-buttons">
          <button onClick={() => onDone(undefined)}>Cancel</button>
          <button class="primary" onClick={() => onDone(chosen)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
