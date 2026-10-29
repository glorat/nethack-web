import { expect, test } from "vitest";
import { commandToRun, listCommands } from "../../src/port/extcmd";
import type { ExtCommand } from "../../src/protocol";

const cmd = (index: number, name: string, description: string, autocompletes = true): ExtCommand => ({ index, name, description, autocompletes });
const pray = cmd(0, "pray", "pray to the gods for help");
const pickup = cmd(1, "pickup", "pick up things at the current location");
const terrain = cmd(2, "terrain", "view map without monsters or objects obstructing", false);
const overview = cmd(3, "overview", "show a summary of the explored dungeon, its terrain", true);
const all = [pray, pickup, terrain, overview];

test("nothing typed lists every command that autocompletes", () => {
  expect(listCommands(all, "")).toEqual([pray, pickup, overview]);
});

test("a prefix filters by name ignoring case, before matches in the help", () => {
  expect(listCommands(all, "P")).toEqual([pray, pickup]);
  // terrain doesn't autocomplete, so only typing it in full finds it
  expect(listCommands(all, "terr")).toEqual([overview]);
});

test("a name typed in full runs even without autocomplete, and beats the highlighted row", () => {
  expect(commandToRun(all, " Terrain ", overview)).toBe(terrain);
});

test("otherwise the highlighted row runs, and nothing highlighted cancels", () => {
  expect(commandToRun(all, "pr", pray)).toBe(pray);
  expect(commandToRun(all, "zzz", undefined)).toBeNull();
});
