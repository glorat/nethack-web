// yn_function's answer rules, which the core leaves to each window port; these follow tty's.

const ESC = 27;
const QUIT_KEYS = " \n\r";

/** The answer the core gets for a key, or for null when the prompt was closed. */
export function ynAnswer(key: string | null, choices: string, defaultChoice: string): number {
  const fallback = defaultChoice ? defaultChoice.charCodeAt(0) : ESC;
  // with no choices any key is the answer, Escape included
  if (!choices) return key ? key.charCodeAt(0) : ESC;
  if (key === null || key === "\x1b") {
    if (choices.includes("q")) return "q".charCodeAt(0);
    if (choices.includes("n")) return "n".charCodeAt(0);
    return fallback;
  }
  if (QUIT_KEYS.includes(key)) return fallback;
  const preserveCase = /[A-Z]/.test(choices);
  return (preserveCase ? key : key.toLowerCase()).charCodeAt(0);
}

/** The question as tty shows it: "Really save? [yn] (n)". Choices after an ESC are accepted but not shown. */
export function ynQuestion(query: string, choices: string, defaultChoice: string): string {
  const shown = choices.split("\x1b")[0];
  return query + (shown ? ` [${shown}]` : "") + (defaultChoice ? ` (${defaultChoice})` : "");
}

/** The core's key2txt(). */
export function keyText(code: number): string {
  switch (code) {
    case 32:
      return "<space>";
    case ESC:
      return "<esc>";
    case 10:
      return "<enter>";
    case 127:
      return "<del>";
  }
  if (code < 32) return `^${String.fromCharCode(code + 64)}`;
  if (code >= 128) return `M-${keyText(code & 0x7f)}`;
  return String.fromCharCode(code);
}

// as Cocoa caps it
const MOST_COUNT = 100000000;

export type CountStep = { count: number | null } | { answer: string; count?: number };

/**
 * A key at a question that allows a count: digits (and '#') build the count, Backspace takes a digit back,
 * Escape drops it, and Return, space or y answers '#' with it. Null for a key that isn't about a count.
 */
export function countKey(count: number | null, key: string): CountStep | null {
  if (/^[0-9#]$/.test(key)) {
    const n = count ?? 0;
    return { count: key === "#" || n >= MOST_COUNT ? n : n * 10 + Number(key) };
  }
  if (count === null) return null;
  if (key === "Backspace" || key === "Delete") return { count: count >= 10 ? Math.floor(count / 10) : null };
  if (key === "Enter" || key === " " || key === "y" || key === "Y") return count > 0 ? { answer: "#", count } : { answer: "n" };
  // Escape, or anything else, stops counting
  return { count: null };
}

/** The answers a question shows as buttons: its choices before any ESC, without '#', and not pickup's " or ?" word. */
export function visibleAnswers(choices: string): string[] {
  const answers: string[] = [];
  for (const word of choices.split("\x1b")[0].split(" ")) {
    if (word === "or") continue;
    for (const c of word) if (c !== "#" && !answers.includes(c)) answers.push(c);
  }
  return answers;
}

const CONTAINER: Record<string, string> = {
  ":": "Look inside", o: "Take something out", i: "Put something in", b: "Both: take out, then put in",
  r: "Reversed: put in, then take out", s: "Stash one item", n: "Next container", q: "Quit", "?": "Help",
};
const YES_NO: Record<string, string> = { y: "Yes", n: "No", a: "All", q: "Quit", m: "Menu" };

/** A button's label, as Cocoa names the answers of the questions it knows; else the key. */
export function answerLabel(choices: string, key: string): string {
  const answers = visibleAnswers(choices);
  const labels: Record<string, string> = choices.includes(":")
    ? CONTAINER
    : choices === "rl"
      ? { r: "Right", l: "Left" }
      : choices === "ynr"
        ? { y: "Destroy", r: "Recover", n: "Cancel" }
        : choices.startsWith("hs")
          ? { h: "Hide", s: "Spin a web", q: "Quit" }
          : answers.every((a) => a in YES_NO)
            ? YES_NO
            : {};
  return labels[key] ?? key;
}

/** Up to three short answers sit in a row; more, or a long one, stack as full-width buttons. */
export function answersInRow(labels: string[]): boolean {
  return labels.length <= 3 && labels.every((l) => l.length <= 12);
}
