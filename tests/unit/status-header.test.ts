import { expect, test } from "vitest";
import { heroText, levelText } from "../../src/port/status-header";

test("the hero's line gives alignment, race and form", () => {
  expect(heroText("Neutral", "human valkyrie")).toBe("Neutral human valkyrie");
  expect(heroText("Neutral", "(human) newt")).toBe("Neutral (human) newt");
  expect(heroText("Neutral", "")).toBe("Neutral");
});

test("the level's line names the dungeon, and its own level where that differs from the depth", () => {
  expect(levelText("Dlvl:5", "The Dungeons of Doom", 5)).toBe("The Dungeons of Doom: level 5");
  expect(levelText("Dlvl:5", "The Gnomish Mines", 3)).toBe("The Gnomish Mines 3: level 5");
  expect(levelText("Dlvl: 12", "Sokoban", 4)).toBe("Sokoban 4: level 12");
  expect(levelText("Home 1", "The Quest", 1)).toBe("The Quest: Home 1");
  expect(levelText("Fort Ludios", "Fort Ludios", 1)).toBe("Fort Ludios");
  expect(levelText("Earth", "The Elemental Planes", 1)).toBe("The Elemental Planes: Earth");
  expect(levelText("Dlvl:1", "", 0)).toBe("Dlvl:1");
});
