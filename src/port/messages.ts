// How Cocoa's message window shows a message (iHack/NhWindow.m addLine:attr:).

const ATR_NONE = 0;
const ATR_BOLD = 1;
const ATR_DIM = 2;
const ATR_ULINE = 4;
const ATR_BLINK = 5;
const ATR_INVERSE = 7;
const ATR_URGENT = 16;
const ATR_NOHISTORY = 32;

export type MessageLook = "hero" | "bold" | "underline" | "inverse" | null;

const alnum = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);

/** Whether the core marked a message urgent: a warning it never lets the player skip, such as a countdown to death. */
export function isUrgent(attr: number): boolean {
  return (attr & ATR_URGENT) !== 0;
}

/**
 * Whether an urgent message is kept in view as newer ones scroll past: until the player has acted twice since it
 * came, the first time perhaps before reading it, or until they let it go.
 */
export function isPinned(message: { attr: number; batch: number; id: number }, batch: number, letGo: number): boolean {
  return isUrgent(message.attr) && message.batch >= batch - 1 && message.id > letGo;
}

/** Whether the first "you" in the text is the word "you" or "your", as Cocoa checks. */
export function referencesHero(text: string): boolean {
  const at = text.toLowerCase().indexOf("you");
  if (at < 0 || alnum(text[at - 1])) return false;
  let end = at + 3;
  if (text[end] === "r") end++;
  return !alnum(text[end]);
}

export function messageLook(text: string, attr: number): MessageLook {
  switch (attr & ~(ATR_URGENT | ATR_NOHISTORY)) {
    case ATR_NONE:
      return referencesHero(text) ? "hero" : null;
    case ATR_BOLD:
      return "bold";
    case ATR_DIM:
    case ATR_ULINE:
      return "underline";
    case ATR_BLINK:
    case ATR_INVERSE:
      return "inverse";
    default:
      return null;
  }
}
