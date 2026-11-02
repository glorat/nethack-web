// Reading and saving a recording, whichever mode it came from.

export function lastTurnIn(text: string): number | null {
  // not ^ with the m flag, which also matches after a U+2028 in typed text
  const found = [...text.matchAll(/(?:^|\n)\d+ T (\d+)/g)].at(-1);
  return found ? Number(found[1]) : null;
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
