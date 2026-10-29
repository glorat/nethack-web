import { expect, test } from "vitest";
import { applyEvents, cellAt, initialState, MAX_MESSAGES, nextBatch } from "../../src/port/state";
import type { MapCell } from "../../src/protocol";

const cell = (x: number, y: number, tile = 1): MapCell => ({
  x, y, glyph: 0, tile, bgTile: -1, ch: 46, color: 7, glyphFlags: 0, marks: 0,
});

test("map batches update cells and map_clear empties the map", () => {
  let s = applyEvents(initialState(), [{ type: "map", cells: [cell(3, 4, 9), cell(5, 6)] }]);
  expect(cellAt(s, 3, 4)?.tile).toBe(9);
  s = applyEvents(s, [{ type: "map", cells: [cell(3, 4, 12)] }]);
  expect(cellAt(s, 3, 4)?.tile).toBe(12);
  expect(cellAt(s, 5, 6)?.tile).toBe(1);
  s = applyEvents(s, [{ type: "map_clear" }, { type: "map", cells: [cell(1, 1)] }]);
  expect(cellAt(s, 3, 4)).toBeNull();
  expect(cellAt(s, 1, 1)).not.toBeNull();
});

test("out-of-range cells are ignored", () => {
  const s = applyEvents(initialState(), [{ type: "map", cells: [cell(80, 0), cell(0, 21), cell(-1, 2)] }]);
  expect(s.map.every((c) => c === null)).toBe(true);
});

test("messages skip blanks, carry their batch and are capped", () => {
  let s = applyEvents(initialState(), [
    { type: "message", text: "Hello", attr: 0 },
    { type: "message", text: "   ", attr: 0 },
  ]);
  expect(s.messages.map((m) => m.text)).toEqual(["Hello"]);
  s = nextBatch(s);
  s = applyEvents(s, [{ type: "message", text: "Again", attr: 0 }]);
  expect(s.messages.map((m) => m.batch)).toEqual([0, 1]);
  const many = Array.from({ length: MAX_MESSAGES + 5 }, (_, i) => ({ type: "message" as const, text: `m${i}`, attr: 0 }));
  s = applyEvents(s, many);
  expect(s.messages).toHaveLength(MAX_MESSAGES);
  expect(s.messages.at(-1)?.text).toBe(`m${MAX_MESSAGES + 4}`);
});

test("unchanged state is returned for no-op events", () => {
  const s = initialState();
  expect(applyEvents(s, [{ type: "bell" }])).toBe(s);
});
