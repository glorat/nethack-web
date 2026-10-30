import { expect, test } from "vitest";
import { Session } from "./harness";

const CLR_RED = 1;
const CLR_GREEN = 2;
const CLR_BLUE = 4;
// a priest sees whether everything is blessed or cursed
const PRIEST = "role:Priest,race:human,gender:female,align:neutral";

async function wish(g: Session, item: string) {
  await g.send("\x17");
  await g.getlin(item);
}

const colorOf = (g: Session, match: RegExp) => g.state.inventory.find((i) => match.test(i.text))?.color;

test("blessed items are green and cursed ones red, holy and unholy water too", async () => {
  const g = await (await Session.start({ wizard: true, character: PRIEST, options: "menucolors" })).skipText();
  await wish(g, "blessed scroll of light");
  await wish(g, "cursed scroll of fire");
  await wish(g, "blessed potion of water");
  await wish(g, "cursed potion of water");
  expect(colorOf(g, /blessed scroll/)).toBe(CLR_GREEN);
  expect(colorOf(g, /cursed scroll/)).toBe(CLR_RED);
  expect(colorOf(g, / holy water/)).toBe(CLR_GREEN);
  expect(colorOf(g, /unholy water/)).toBe(CLR_RED);
  expect(colorOf(g, /uncursed/)).not.toBe(CLR_RED);
});

test("the player's own menu colors come first", async () => {
  const g = await (await Session.start({ wizard: true, character: PRIEST, options: "menucolors", config: 'MENUCOLOR=" blessed "=blue\n' })).skipText();
  await wish(g, "blessed scroll of light");
  await wish(g, "cursed scroll of fire");
  expect(colorOf(g, /blessed scroll/)).toBe(CLR_BLUE);
  expect(colorOf(g, /cursed scroll/)).toBe(CLR_RED);
});

test("the default colors leave menucolors off when the player has it off", async () => {
  const g = await (await Session.start({ wizard: true, character: PRIEST })).skipText();
  await wish(g, "blessed scroll of light");
  expect(colorOf(g, /blessed scroll/)).toBe(8);
});
