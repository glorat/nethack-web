import { expect, test } from "vitest";
import { configFile, OPTIONS_TEMPLATE, optionNames } from "../../src/port/options";

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
