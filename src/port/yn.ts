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
