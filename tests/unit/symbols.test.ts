import { expect, test } from "vitest";
import { symbolText } from "../../src/port/symbols";

test("ASCII symbols are themselves", () => {
  expect(symbolText("@".charCodeAt(0), false)).toBe("@");
  expect(symbolText("#".charCodeAt(0), true)).toBe("#");
});

test("IBM graphics symbols are read as code page 437", () => {
  expect(symbolText(0x01, false)).toBe("☺");
  expect(symbolText(0xb3, false)).toBe("│");
  expect(symbolText(0xc4, false)).toBe("─");
  expect(symbolText(0xfa, false)).toBe("·");
  expect(symbolText(0xf7, false)).toBe("≈");
});

test("DEC graphics symbols are read as DEC line drawing", () => {
  expect(symbolText(0x80 | "x".charCodeAt(0), true)).toBe("│");
  expect(symbolText(0x80 | "q".charCodeAt(0), true)).toBe("─");
  expect(symbolText(0x80 | "l".charCodeAt(0), true)).toBe("┌");
  expect(symbolText(0x80 | "~".charCodeAt(0), true)).toBe("·");
  expect(symbolText(0x80 | "a".charCodeAt(0), true)).toBe("▒");
});

test("every byte has one character", () => {
  for (let c = 0; c < 256; c++) {
    expect([...symbolText(c, false)]).toHaveLength(1);
    expect([...symbolText(c, true)]).toHaveLength(1);
  }
});
