import { expect, test } from "vitest";
import { ArrowChords, keyCode, takeLine, type KeyLike } from "../../src/port/keys";

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

test("keys typed ahead into a line prompt make its text", () => {
  const press = (...keys: string[]) => keys.map((key) => ({ key, ctrlKey: false, altKey: false, metaKey: false }));
  expect(takeLine(press("p", "r", "a", "y", "Enter", "l"))).toEqual({ text: "pray", end: "return" });
  expect(takeLine(press("p", "x", "Backspace", "r"))).toEqual({ text: "pr", end: null });
  expect(takeLine(press("a", "Escape"))).toEqual({ text: "a", end: "escape" });

  const rest = press("y", "Enter", "j");
  takeLine(rest);
  expect(rest).toEqual(press("j"));
});

const event = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, altKey: false, metaKey: false, ...mods });
const typed = (keys: KeyLike[]) => keys.map((e) => String.fromCharCode(keyCode(e)!)).join("");

test("two arrows pressed together move diagonally", () => {
  const chords = new ArrowChords();
  expect(chords.down(event("ArrowLeft"))).toEqual([]);
  expect(typed(chords.down(event("ArrowUp")))).toBe("y");
  expect(chords.up()).toEqual([]);
  expect(chords.up()).toEqual([]);
  chords.down(event("ArrowDown"));
  expect(typed(chords.down(event("ArrowRight")))).toBe("n");
});

test("an arrow alone moves when released", () => {
  const chords = new ArrowChords();
  expect(chords.down(event("ArrowRight"))).toEqual([]);
  expect(typed(chords.up())).toBe("l");
});

test("a held arrow repeats, and other keys are typed at once, after any held arrow", () => {
  const chords = new ArrowChords();
  chords.down(event("ArrowUp"));
  expect(typed(chords.down(event("ArrowUp")))).toBe("kk");
  expect(chords.up()).toEqual([]);
  expect(typed(chords.down(event("s")))).toBe("s");
  chords.down(event("ArrowLeft"));
  expect(typed(chords.down(event("ArrowRight")))).toBe("hl");
  chords.down(event("ArrowLeft"));
  expect(typed(chords.down(event("s")))).toBe("hs");
});

test("an arrow with a modifier is neither held nor part of a diagonal", () => {
  const chords = new ArrowChords();
  expect(chords.down(event("ArrowLeft", { ctrlKey: true }))).toHaveLength(1);
  chords.down(event("ArrowLeft"));
  expect(chords.down(event("ArrowUp", { altKey: true })).map((e) => e.key)).toEqual(["ArrowLeft", "ArrowUp"]);
});
