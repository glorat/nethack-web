// The hero's cursor shows how hurt they are, as Cocoa's does, with its whole-number percentage.
export function cursorColor(hp: number, max: number): string {
  const percent = max > 0 && Number.isFinite(hp) ? Math.trunc((hp * 100) / max) : 100;
  if (percent > 75) return "rgba(0, 204, 0, 0.9)";
  if (percent > 50) return "rgba(204, 204, 0, 0.9)";
  return "rgba(204, 0, 0, 0.9)";
}
