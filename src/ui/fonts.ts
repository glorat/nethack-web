// Monospaced fonts to offer for the ASCII map: the browser can't list the fonts installed, so these are
// the common ones, kept to those this machine has, plus the bundled map font.
const CANDIDATES = [
  "Menlo", "Monaco", "SF Mono", "Courier New", "Courier", "Andale Mono",
  "Consolas", "Cascadia Mono", "Lucida Console",
  "DejaVu Sans Mono", "Liberation Mono", "Ubuntu Mono", "Noto Sans Mono",
  "Fira Code", "Fira Mono", "JetBrains Mono", "Source Code Pro", "IBM Plex Mono", "Roboto Mono",
  "JuliaMono",
];

const SAMPLE = "mmmmmmmmmmlli@#.WW";

/** Fonts that ship with the page rather than the OS. */
const BUNDLED = ["JuliaMono"];

/** A font is installed if text in it measures differently from text in each fallback. */
export function installedFonts(): string[] {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const widthIn = (font: string) => {
    ctx.font = `32px ${font}`;
    return ctx.measureText(SAMPLE).width;
  };
  const fallbacks = ["monospace", "serif", "sans-serif"].map((f) => [f, widthIn(f)] as const);
  const found = CANDIDATES.filter((name) => fallbacks.some(([f, w]) => widthIn(`"${name}", ${f}`) !== w));
  // Measuring doesn't distinguish a bundled font from the generic fallback reliably.
  for (const name of BUNDLED) {
    if (!found.includes(name) && document.fonts.check(`32px "${name}"`)) found.push(name);
  }
  return found;
}
