import { expect, test } from "vitest";
import { configFile, OPTIONS_TEMPLATE, optionNames, optionSettings, savedOptionsFile, withOption } from "../../src/port/options";

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

test("an option is read as written, past !, no and spaces, in any case", () => {
  const file = "#OPTIONS=tutorial\nOPTIONS=time, notutorial\noptions = Number_pad:3\n";
  expect(optionSettings(file, "tutorial")).toEqual(["notutorial"]);
  expect(optionSettings(file, "number_pad")).toEqual(["Number_pad:3"]);
  expect(optionSettings(file, "autodig")).toEqual([]);
});

test("an option is changed where the file sets it, keeping the rest of the line and file", () => {
  const file = "# mine\nOPTIONS=time, !tutorial,autodig\nOPTIONS=fruit:slime mold\n";
  expect(withOption(file, "tutorial", "tutorial")).toBe("# mine\nOPTIONS=time, tutorial,autodig\nOPTIONS=fruit:slime mold\n");
  expect(withOption(file, "tutorial", null)).toBe("# mine\nOPTIONS=time,autodig\nOPTIONS=fruit:slime mold\n");
  expect(withOption(file, "fruit", null)).toBe("# mine\nOPTIONS=time, !tutorial,autodig\n");
});

test("an option the file doesn't set goes on a line at the end", () => {
  expect(withOption("# mine\nOPTIONS=time", "tutorial", "!tutorial")).toBe("# mine\nOPTIONS=time\nOPTIONS=!tutorial\n");
  expect(withOption("", "tutorial", "!tutorial")).toBe("OPTIONS=!tutorial\n");
  expect(withOption(OPTIONS_TEMPLATE, "number_pad", null)).toBe(OPTIONS_TEMPLATE);
});

test("an option set more than once is left set once, where it was first", () => {
  expect(withOption("OPTIONS=number_pad:1\nOPTIONS=autodig,number_pad:3\n", "number_pad", "number_pad:-1")).toBe(
    "OPTIONS=number_pad:-1\nOPTIONS=autodig\n",
  );
});
