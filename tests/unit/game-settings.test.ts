import { expect, test } from "vitest";
import { choose, chosen, GAME_SETTINGS } from "../../src/port/game-settings";
import { OPTIONS_TEMPLATE } from "../../src/port/options";

const [tutorial, numberPad] = GAME_SETTINGS;
const label = (file: string, setting = tutorial) => {
  const now = chosen(file, setting);
  return "choice" in now ? now.choice.label : `written: ${now.written}`;
};

test("a setting the file leaves alone shows the game's default", () => {
  expect(label(OPTIONS_TEMPLATE)).toBe("Ask at the start of each game");
  expect(label(OPTIONS_TEMPLATE, numberPad)).toBe("Letters (h j k l y u b n)");
});

test("each way a file may set a choice shows that choice", () => {
  expect(label("OPTIONS=notutorial")).toBe("Never");
  expect(label("OPTIONS=TUTORIAL")).toBe("Always play it first");
  expect(label("OPTIONS=number_pad", numberPad)).toBe("Number pad");
  expect(label("OPTIONS=!number_pad", numberPad)).toBe("Letters (h j k l y u b n)");
  expect(label("OPTIONS=number_pad: 3", numberPad)).toBe("Number pad, phone layout (1 2 3 on top)");
});

test("a setting written some other way, or more than once, shows as written", () => {
  expect(label("OPTIONS=number_pad:2", numberPad)).toBe("written: number_pad:2");
  expect(label("OPTIONS=tutorial\nOPTIONS=!tutorial")).toBe("written: tutorial, !tutorial");
});

test("choosing writes the file, and choosing the default takes the line out again", () => {
  const never = choose(OPTIONS_TEMPLATE, tutorial, tutorial.choices[2]);
  expect(never).toBe(`${OPTIONS_TEMPLATE}OPTIONS=!tutorial\n`);
  expect(label(never)).toBe("Never");
  expect(choose(never, tutorial, tutorial.choices[0])).toBe(OPTIONS_TEMPLATE);
});
