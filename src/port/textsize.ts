// Text sizes in points, stepped as Cocoa's View menu steps them; the UI is drawn at 13.
export const DEFAULT_TEXT_SIZE = 13;
const STEPS = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28];

export function biggerTextSize(size: number): number {
  return STEPS.find((s) => s > size) ?? STEPS[STEPS.length - 1];
}

export function smallerTextSize(size: number): number {
  return [...STEPS].reverse().find((s) => s < size) ?? STEPS[0];
}

/** The step nearest a size asked for, such as font_size_message's. */
export function nearestTextSize(size: number): number {
  return STEPS.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best));
}

/**
 * The size the options' font_size_message asks for, as Cocoa takes it: as the game starts it picks the
 * size only if none was chosen here; changed in the options menu, it applies. Null to leave the size be.
 */
export function textSizeFromOptions(size: number, atStart: boolean, chosen: number | null): number | null {
  if (atStart && chosen !== null) return null;
  return nearestTextSize(size);
}
