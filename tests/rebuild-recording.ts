/** The recording a game's batches make, sorted by ID: each starts at its line number, replacing anything already from there on. */
export function rebuildRecording(batches: { id: string; lines: string }[]): string {
  const lines: string[] = [];
  for (const { id, lines: text } of batches) {
    lines.length = Math.min(lines.length, Number(id.split("-")[1]) - 1);
    lines.push(...text.split("\n"));
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}
