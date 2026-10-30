// NetHack's 16 colors (CLR_BLACK .. CLR_WHITE), tuned for a dark background.
export const NH_COLORS = [
  "#5c5c5c", "#d23c3c", "#3cb043", "#b5852a",
  "#4a6fd8", "#b84ac0", "#2fb3b3", "#c8c8c8",
  "#888888", "#ff8040", "#5cf05c", "#f0e040",
  "#7aa0ff", "#ff70ff", "#70ffff", "#ffffff",
];

const NO_COLOR = 8;

export function nhColor(color: number): string | undefined {
  const c = color & 0xff;
  return c === NO_COLOR || c >= NH_COLORS.length ? undefined : NH_COLORS[c];
}

const ATR_BOLD = 1;
const ATR_DIM = 2;
const ATR_ITALIC = 3;
const ATR_ULINE = 4;
const ATR_BLINK = 5;
const ATR_INVERSE = 7;
const ATR_URGENT = 16;
const ATR_NOHISTORY = 32;

/** A menu line's color and attribute (ATR_*, as a MENUCOLOR rule sets them) as CSS. */
export function textStyle(color: number, attr: number): Record<string, string> {
  const style: Record<string, string> = {};
  const c = nhColor(color);
  if (c) style.color = c;
  switch (attr & ~(ATR_URGENT | ATR_NOHISTORY)) {
    case ATR_BOLD:
    case ATR_BLINK:
      style.fontWeight = "700";
      break;
    case ATR_DIM:
      style.opacity = "0.55";
      break;
    case ATR_ITALIC:
      style.fontStyle = "italic";
      break;
    case ATR_ULINE:
      style.textDecoration = "underline";
      break;
    case ATR_INVERSE:
      style.background = "color-mix(in srgb, currentColor 20%, transparent)";
      break;
  }
  return style;
}
