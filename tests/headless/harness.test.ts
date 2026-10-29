import { expect, test } from "vitest";
import { Session } from "./harness";

const tiles = (g: Session) => g.state.map.map((c) => c?.tile ?? null);

test("the same seed makes the same game, and another seed a different one", async () => {
  const play = async (seed: number) => (await (await Session.start({ seed })).skipText()).send("hjkl");
  const [a, b, c] = [await play(3), await play(3), await play(4)];
  expect(tiles(a)).toEqual(tiles(b));
  expect(a.state.status).toEqual(b.state.status);
  expect(tiles(a)).not.toEqual(tiles(c));
});

test("debug mode lets a test wish for an item", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("long sword");
  expect(g.state.inventory.find((i) => /long sword/.test(i.text))?.accelerator).toBe("e");
});
