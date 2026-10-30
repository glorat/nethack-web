// A map symbol as text. With symset:IBMGraphics the core's ttychar is a code page 437 byte, as Cocoa reads it;
// with DECgraphics it is a DEC line-drawing character with the high bit set.

const LOW = " ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼";
const HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
// DEC special graphics for '_' through '~'
const DEC = " ◆▒␉␌␍␊°±␤␋┘┐┌└┼⎺⎻─⎼⎽├┤┴┬│≤≥π≠£·";

export function symbolText(ch: number, dec: boolean): string {
  const c = ch & 0xff;
  if (dec && c >= 0xdf && c <= 0xfe) return [...DEC][c - 0xdf];
  if (c < 0x20) return [...LOW][c];
  if (c < 0x7f) return String.fromCharCode(c);
  if (c === 0x7f) return "⌂";
  return [...HIGH][c - 0x80];
}
