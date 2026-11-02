// The time zone a player chooses for an online game, which the moon and some monsters care about.

export function chosenZone(search: string, browser: number): number {
  const tz = new URLSearchParams(search).get("tz");
  return tz !== null && Number.isInteger(Number(tz)) && tz !== "" ? Number(tz) : browser;
}

export function zoneLabel(seconds: number): string {
  const minutes = Math.abs(seconds) / 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `UTC${seconds < 0 ? "−" : "+"}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Every whole hour, and the browser's own zone among them, in order. */
export function zoneChoices(browser: number): number[] {
  const hours = Array.from({ length: 27 }, (_, i) => (i - 12) * 3600);
  return [...new Set([...hours, browser])].sort((a, b) => a - b);
}
