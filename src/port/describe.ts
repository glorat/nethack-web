// Farlook's text for a map square, cut down to a tooltip as Cocoa does:
// "d        a dog or other canine (tame little dog)" -> "tame little dog".

export function tooltipText(farlook: string): string {
  // the square's symbol, then a run of spaces
  const body = /^\S? {6}/.test(farlook) ? farlook.slice(1) : farlook;
  const open = body.lastIndexOf("(");
  if (open < 0) return body.trim();
  const close = body.indexOf(")", open);
  if (close < 0) return body.slice(open + 1).trim();
  return (body.slice(open + 1, close) + body.slice(close + 1)).trim();
}

const NOT_SEARCHED = ["tame", "invisible", "peaceful", "a", "an", "the"];

/** What Cocoa searches the wiki for: the tooltip without its [notes] or the words that aren't the thing's name. */
export function wikiTerm(farlook: string): string {
  let words = tooltipText(farlook).split("[")[0].split(/\s+/).filter(Boolean);
  for (const word of NOT_SEARCHED) {
    const at = words.findIndex((w) => w.toLowerCase() === word);
    if (at >= 0) words = [...words.slice(0, at), ...words.slice(at + 1)];
  }
  return words.join(" ");
}

export const WIKI_URL = "https://nethackwiki.com/";

export function wikiUrl(term: string): string {
  return `${WIKI_URL}mediawiki/index.php?search=${encodeURIComponent(term)}`;
}
