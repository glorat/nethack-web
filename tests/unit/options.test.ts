import { expect, test } from "vitest";
import { configFile, OPTIONS_TEMPLATE, optionNames, savedOptionsFile } from "../../src/port/options";

test("the game's options go after the player's, leaving out any the player sets, so theirs win without a duplicate", () => {
  expect(configFile("time,!autopickup,menucolors", "OPTIONS=autopickup,pickup_types:$\nOPTIONS=!time\n")).toBe(
    "OPTIONS=autopickup,pickup_types:$\nOPTIONS=!time\nOPTIONS=menucolors\n",
  );
  expect(configFile("time", "OPTIONS=notime")).toBe("OPTIONS=notime");
  expect(configFile("time", "")).toBe("\nOPTIONS=time\n");
});

test("an OPTIONS line's names are read past ! and values, and comments are skipped", () => {
  expect([...optionNames("OPTIONS=!time, fruit:slime mold\n#OPTIONS=autodig\noptions = Number_pad:1")]).toEqual(["time", "fruit", "number_pad"]);
});

test("the template sets nothing until a line is uncommented", () => {
  expect(OPTIONS_TEMPLATE.split("\n").filter((l) => l && !l.startsWith("#"))).toEqual([]);
});

test("a file #saveoptions wrote keeps the player's menu colors but not the game's own", () => {
  const saved = 'OPTIONS=autodig\nMENUCOLOR="cursed"=blue\nMENUCOLOR=" blessed "=green\nMENUCOLOR=" unholy water"=red\n';
  expect(savedOptionsFile(saved, "")).toBe('OPTIONS=autodig\nMENUCOLOR="cursed"=blue\n');
});

test("a saved file leaves the game's own options, the name and ascii_map to the game, and keeps the player's opt-outs", () => {
  // as the core writes it: only what differs from its defaults, so the player's !time and autopickup show as absences
  const saved = "# NetHack config\nOPTIONS=name:Agnes\nOPTIONS=role:random\nOPTIONS=ascii_map\nOPTIONS=menucolors\nOPTIONS=autodig\n";
  expect(savedOptionsFile(saved, "time,!autopickup,menucolors")).toBe(
    "# NetHack config\nOPTIONS=role:random\nOPTIONS=autodig\nOPTIONS=!time,autopickup\n",
  );
});
