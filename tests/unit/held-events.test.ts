import { expect, test } from "vitest";
import { HeldEvents } from "../../src/port/held-events";
import { applyEvents, initialState, MAX_MESSAGES } from "../../src/port/state";
import type { GameEvent, MapCell } from "../../src/protocol";

const cell = (x: number, y: number, tile: number): MapCell => ({
  x, y, glyph: 0, tile, bgTile: -1, ch: 46, color: 7, glyphFlags: 0, marks: 0, symbol: ".",
});
const held = (events: GameEvent[]) => {
  const h = new HeldEvents();
  h.add(events);
  return h.all();
};
const withoutIds = (events: GameEvent[]) => {
  const { messages, nextMessageId: _, ...rest } = applyEvents(initialState(), events);
  return { ...rest, messages: messages.map(({ id: _id, ...m }) => m) };
};

test("the page comes to the same state as if it had seen every event", () => {
  const events: GameEvent[] = [
    { type: "tile_file", name: "a.bmp" },
    { type: "map", cells: [cell(1, 1, 1), cell(2, 2, 2)] },
    { type: "message", text: "first", attr: 0 },
    { type: "message", text: "  ", attr: 0 },
    { type: "cursor", x: 1, y: 1 },
    { type: "status", fields: { BL_HP: { text: "1", color: 0, percent: 0 } } },
    { type: "map_clear" },
    { type: "map", cells: [cell(3, 3, 3)] },
    { type: "map", cells: [cell(3, 3, 4)] },
    { type: "cursor", x: 3, y: 3 },
    { type: "status", fields: { BL_HP: { text: "2", color: 0, percent: 0 } } },
    { type: "inventory", items: [], equipment: [] },
    { type: "ascii_map", on: true },
    { type: "options_file", text: "old" },
    { type: "options_file", text: "new" },
    { type: "text_size", size: 12, atStart: true },
    { type: "text_size", size: 14, atStart: false },
    { type: "game_over", text: "bye" },
  ];
  expect(withoutIds(held(events))).toEqual(withoutIds(events));
});

test("however many events come, only the last of each kind is held", () => {
  const h = new HeldEvents();
  for (let i = 0; i < 10000; i++) {
    h.add([
      { type: "map", cells: [cell(i % 5, 0, i)] },
      { type: "cursor", x: i % 5, y: 0 },
      { type: "message", text: `m${i}`, attr: 0 },
    ]);
  }
  const all = h.all();
  const map = all.find((e) => e.type === "map");
  expect(map?.type === "map" && map.cells.length).toBe(5);
  expect(all.filter((e) => e.type === "cursor")).toHaveLength(1);
  const messages = all.filter((e) => e.type === "message");
  expect(messages).toHaveLength(MAX_MESSAGES);
  expect(messages.at(-1)).toMatchObject({ text: "m9999" });
});

test("a cell off the map doesn't take the place of one on it", () => {
  expect(held([{ type: "map", cells: [cell(79, 0, 1), cell(-1, 1, 2)] }])).toEqual([{ type: "map", cells: [cell(79, 0, 1)] }]);
});

test("a bell in the replay doesn't ring when the player takes over", () => {
  expect(held([{ type: "bell" }])).toEqual([]);
});

test("the options file and both kinds of text size still reach the page, as they do more than change its state", () => {
  expect(held([
    { type: "options_file", text: "old" },
    { type: "text_size", size: 10, atStart: true },
    { type: "text_size", size: 12, atStart: false },
    { type: "text_size", size: 14, atStart: false },
    { type: "options_file", text: "new" },
  ])).toEqual([
    { type: "options_file", text: "new" },
    { type: "text_size", size: 10, atStart: true },
    { type: "text_size", size: 14, atStart: false },
  ]);
});
