// The last finished game's recording, kept for replaying straight away.

const LAST_GAME_KEY = "nethack.lastGame";

export function lastGame(): string | null {
  try {
    return localStorage.getItem(LAST_GAME_KEY);
  } catch {
    return null;
  }
}

/** False if the browser wouldn't keep it, as it won't one too big. */
export function keepLastGame(text: string): boolean {
  try {
    localStorage.setItem(LAST_GAME_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** The last turn the recording reached. */
export function lastTurn(text: string): number {
  let last = 0;
  for (const m of text.matchAll(/^\d+ T (\d+) /gm)) last = Math.max(last, Number(m[1]));
  return last;
}

/** A file name for the recording: the hero's name and when the game started. */
export function recordingFileName(text: string): string {
  const name = /^\d+ opt ".*?\bname:([^,"]*)/m.exec(text)?.[1] || "game";
  const started = /^\d+ session new (\d{4}-\d\d-\d\d)/m.exec(text)?.[1] ?? "";
  return `nethack-${name}${started ? `-${started}` : ""}.txt`;
}

export function downloadRecording(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = recordingFileName(text);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
