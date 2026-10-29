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
