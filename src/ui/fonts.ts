// Monospaced fonts to offer for the ASCII map: the browser can't list the fonts installed, so these are
// the common ones, kept to those this machine has.
const CANDIDATES = [
  "Menlo", "Monaco", "SF Mono", "Courier New", "Courier", "Andale Mono",
  "Consolas", "Cascadia Mono", "Lucida Console",
  "DejaVu Sans Mono", "Liberation Mono", "Ubuntu Mono", "Noto Sans Mono",
  "Fira Code", "Fira Mono", "JetBrains Mono", "Source Code Pro", "IBM Plex Mono", "Roboto Mono",
];

const SAMPLE = "mmmmmmmmmmlli@#.WW";

/** A font is installed if text in it measures differently from text in each fallback. */
export function installedFonts(): string[] {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const widthIn = (font: string) => {
    ctx.font = `32px ${font}`;
    return ctx.measureText(SAMPLE).width;
  };
  const fallbacks = ["monospace", "serif", "sans-serif"].map((f) => [f, widthIn(f)] as const);
  return CANDIDATES.filter((name) => fallbacks.some(([f, w]) => widthIn(`"${name}", ${f}`) !== w));
}
