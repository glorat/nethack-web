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
 * The id of the urgent message kept in view, if any: the newest, until two later turns' messages have followed it,
 * the first perhaps before it was read, or until the player lets it go.
 */
export function pinnedMessage(messages: { id: number; attr: number; separator?: boolean }[], letGo: number): number | null {
  let turns = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.separator) {
      if (++turns > 1) return null;
    } else if (isUrgent(m.attr)) return m.id > letGo ? m.id : null;
  }
  return null;
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
