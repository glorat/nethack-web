import { expect, test } from "vitest";
import { chaptersOf, startingLine } from "../../src/online/story";

test("each chronicle entry is a chapter, its kind from what the core says of it", () => {
  const chapters = chaptersOf([
    { turn: 1, line: 17, flags: 0x2, text: "Glorat the lawful human Valkyrie entered the dungeon" },
    { turn: 211, line: 263, flags: 0x8000, text: "entered level 2, the Dungeons of Doom" },
    { turn: 242, line: 305, flags: 0x5000, text: "entered the Gnomish Mines" },
    { turn: 407, line: 633, flags: 0x20, text: "eschewed atheism, by dropping a lichen corpse on an altar" },
    { turn: 527, line: 914, flags: 0x4000, text: "killed by a dwarf" },
  ]);
  expect(chapters.map((c) => c.kind)).toEqual(["feat", "descent", "feat", "event", "end"]);
  expect(chapters[4]).toEqual({ turn: 527, line: 914, text: "Killed by a dwarf", kind: "end" });
  // only the last entry is the end
  expect(chaptersOf([{ turn: 1, line: 1, flags: 0x4000, text: "x" }, { turn: 2, line: 2, flags: 0x20, text: "y" }]).map((c) => c.kind)).toEqual(["event", "event"]);
});

test("a link names the recording line to start at, or none", () => {
  expect(startingLine("?game=g&line=914")).toBe(914);
  for (const search of ["?game=g", "?line=0", "?line=-3", "?line=2.5", "?line=x"]) expect(startingLine(search), search).toBeNull();
});
