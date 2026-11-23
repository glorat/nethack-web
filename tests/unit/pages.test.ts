import { expect, test } from "vitest";
import { scrollPoints, type MenuRow } from "../../src/port/pages";

const row = (top: number, height = 24, more: Partial<MenuRow> = {}): MenuRow => ({
  height,
  selectable: true,
  heading: false,
  contentTop: top + 3,
  contentBottom: top + height - 3,
  ...more,
});

test("the first selectable row whose content is cut off starts the next page", () => {
  const points = scrollPoints([row(0), row(24), row(48), row(72)], 60);
  expect(points).toEqual([
    { row: 0, top: 0 },
    { row: 2, top: 51 },
  ]);
});

test("a row cut only through its padding is still fully visible", () => {
  const points = scrollPoints([row(0), row(24), row(48)], 45);
  expect(points.map((point) => point.row)).toEqual([0, 2]);
});

test("a page starting inside a section clears the pinned heading", () => {
  const heading = row(0, 20, { selectable: false, heading: true, contentTop: 0, contentBottom: 0 });
  const points = scrollPoints([heading, row(20), row(44), row(68)], 80);
  expect(points[1]).toEqual({ row: 3, top: 51 });
});

test("pages are not capped; all rows that fit stay on one page", () => {
  const points = scrollPoints(Array.from({ length: 54 }, (_, i) => row(i * 24)), 2000);
  expect(points).toEqual([{ row: 0, top: 0 }]);
});

test("a page never starts without making progress", () => {
  const points = scrollPoints([row(0, 200), row(200), row(224)], 10);
  expect(points).toEqual([
    { row: 0, top: 0 },
    { row: 1, top: 203 },
    { row: 2, top: 227 },
  ]);
});

test("a menu with nothing selectable has no page after the top", () => {
  const points = scrollPoints([row(0, 24, { selectable: false })], 100);
  expect(points).toEqual([{ row: 0, top: 0 }]);
});

test("read-only lines page even though none of them is selectable", () => {
  const rows = [row(0, 24, { selectable: false }), row(24, 24, { selectable: false }), row(48, 24, { selectable: false })];
  expect(scrollPoints(rows, 60, false).map((point) => point.row)).toEqual([0, 2]);
});
