// Reading and saving a recording, whichever mode it came from.

export function lastTurnIn(text: string): number | null {
  // not ^ with the m flag, which also matches after a U+2028 in typed text
  let last: string | undefined;
  for (const found of text.matchAll(/(?:^|\n)\d+ T (\d+)/g)) last = found[1];
  return last === undefined ? null : Number(last);
}

/** What the last `reseed` line holds after its seed, or null if there's none. */
export function lastInjectionIn(text: string): string | null {
  let last: string | undefined;
  for (const found of text.matchAll(/(?:^|\n)\d+ reseed \d+ ?([^\n]*)/g)) last = found[1];
  return last ?? null;
}

/** False for a game whose start wasn't recorded, or one continued from a checkpoint, which never replay. */
export function replayable(text: string): boolean {
  return !/^\d+ session (?:unrecorded|recover) /m.test(text);
}

export function linesIn(text: string): number {
  return text ? text.split("\n").length - 1 : 0;
}

/** A file name for the recording: the hero's name and when the game started. */
export function recordingFileName(text: string): string {
  const name = /^\d+ opt ".*?\bname:([^,"]*)/m.exec(text)?.[1] || "game";
  const started = /^\d+ session (?:new|unrecorded) (\d{4}-\d\d-\d\d)/m.exec(text)?.[1] ?? "";
  return `nethack-${name}${started ? `-${started}` : ""}.txt`;
}

export function downloadRecording(text: string): void {
  downloadText(text, recordingFileName(text));
}

export function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
