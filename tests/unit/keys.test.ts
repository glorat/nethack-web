import { expect, test } from "vitest";
import { keyCode } from "../../src/port/keys";

const k = (key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
  keyCode({ key, ctrlKey: false, altKey: false, metaKey: false, ...mods });

test("printable keys pass through", () => {
  expect(k("a")).toBe(97);
  expect(k("Z")).toBe(90);
  expect(k(".")).toBe(46);
});

test("arrows and navigation keys become vi-keys", () => {
  expect(k("ArrowLeft")).toBe("h".charCodeAt(0));
  expect(k("PageDown")).toBe("n".charCodeAt(0));
});

test("control and meta combinations", () => {
  expect(k("d", { ctrlKey: true })).toBe(4);
  expect(k("x", { altKey: true })).toBe(0x80 | 120);
  expect(k("c", { metaKey: true })).toBeNull();
});

test("special keys and ignored keys", () => {
  expect(k("Enter")).toBe(13);
  expect(k("Escape")).toBe(27);
  expect(k("Shift")).toBeNull();
  expect(k("F5")).toBeNull();
});
