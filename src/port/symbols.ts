// A map symbol as text. With symset:IBMGraphics the core's ttychar is a code page 437 byte, as Cocoa reads it;
// with DECgraphics it is a DEC line-drawing character with the high bit set; with Enhanced1/2 the core has a
// UTF-8 codepoint in glyph_map.u, not in ttychar.

const LOW = " ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼";
const HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
// DEC special graphics for '_' through '~'
const DEC = " ◆▒␉␌␍␊°±␤␋┘┐┌└┼⎺⎻─⎼⎽├┤┴┬│≤≥π≠£·";

export function symbolText(ch: number, dec: boolean, utf8 = false): string {
  if (utf8) return String.fromCodePoint(ch);
  const c = ch & 0xff;
  if (dec && c >= 0xdf && c <= 0xfe) return [...DEC][c - 0xdf];
  if (c < 0x20) return [...LOW][c];
  if (c < 0x7f) return String.fromCharCode(c);
  if (c === 0x7f) return "⌂";
  return [...HIGH][c - 0x80];
}
