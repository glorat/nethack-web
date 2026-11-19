import { expect, test } from "vitest";
import { centerOn, clipAround } from "../../src/ui/scroll";

const view = (scrollLeft: number, scrollTop: number) => ({ scrollLeft, scrollTop, clientWidth: 1000, clientHeight: 600 });

test("a hero well inside the view doesn't scroll it", () => {
  const el = view(0, 0);
  clipAround(el, 15, 9, 32, 32);
  expect(el).toEqual(view(0, 0));
});

test("a hero near an edge scrolls only far enough for 8 squares beyond", () => {
  const el = view(0, 0);
  clipAround(el, 40, 9, 32, 32);
  expect(el.scrollLeft).toBe(40.5 * 32 + 8 * 32 - 1000);
  expect(el.scrollTop).toBe(0);
  // the browser clamps this to 0
  clipAround(el, 2, 9, 32, 32);
  expect(el.scrollLeft).toBe(2.5 * 32 - 8 * 32);
});

test("the border is at most 40% of the view", () => {
  const el = view(0, 0);
  clipAround(el, 30, 15, 64, 64);
  expect(el.scrollLeft).toBe(30.5 * 64 + 400 - 1000);
  expect(el.scrollTop).toBe(15.5 * 64 + 240 - 600);
});

test("the hero is centered while the map overflows", () => {
  const el = { scrollLeft: 0, scrollTop: 0, clientWidth: 1000, clientHeight: 600, scrollWidth: 2560, scrollHeight: 672 };
  centerOn(el, 40, 10, 32, 32);
  expect(el.scrollLeft).toBe(40.5 * 32 - 500);
  expect(el.scrollTop).toBe(10.5 * 32 - 300);
});

test("the hero's center stops at the map's edges", () => {
  const el = { scrollLeft: 100, scrollTop: 100, clientWidth: 1000, clientHeight: 600, scrollWidth: 2560, scrollHeight: 672 };
  centerOn(el, 2, 0, 32, 32);
  expect(el.scrollLeft).toBe(0);
  expect(el.scrollTop).toBe(0);
});

test("centerOn leaves a map that fits alone", () => {
  const el = { scrollLeft: 0, scrollTop: 0, clientWidth: 1000, clientHeight: 600, scrollWidth: 800, scrollHeight: 500 };
  centerOn(el, 40, 10, 32, 32);
  expect(el).toEqual({ scrollLeft: 0, scrollTop: 0, clientWidth: 1000, clientHeight: 600, scrollWidth: 800, scrollHeight: 500 });
});
