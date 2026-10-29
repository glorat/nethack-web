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
