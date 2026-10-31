import { expect, test } from "vitest";
import { PAGE_UUID, Session } from "./harness";

const tiles = (g: Session) => g.state.map.map((c) => c?.tile ?? null);

test("the same seed makes the same game, and another seed a different one", async () => {
  const play = async (seed: number) => (await (await Session.start({ seed })).skipText()).send("hjkl");
  const [a, b, c] = [await play(3), await play(3), await play(4)];
  expect(tiles(a)).toEqual(tiles(b));
  expect(a.state.status).toEqual(b.state.status);
  expect(tiles(a)).not.toEqual(tiles(c));
});

test("the page's seeds make the game", async () => {
  const play = async (pageSeed: number) => (await (await Session.start({ pageSeed })).skipText()).send("hjkl");
  const [a, b, c] = [await play(3), await play(3), await play(4)];
  expect(tiles(a)).toEqual(tiles(b));
  expect(tiles(a)).not.toEqual(tiles(c));
});

test("the page's clock is the game's", async () => {
  const moon = async (date?: string) =>
    (await (await Session.start({ date })).skipText()).messages.some((t) => /full moon tonight/i.test(t));
  expect(await moon("2024-01-25T12:00:00Z")).toBe(true);
  expect(await moon()).toBe(false);
});

test("the page names the game", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "wizshownhuuid")!.index });
  expect(g.messages).toContain(`The NHUUID for this game is { ${PAGE_UUID} }.`);
});

test("debug mode lets a test wish for an item", async () => {
  const g = await (await Session.start({ wizard: true })).skipText();
  await g.send("\x17");
  await g.getlin("long sword");
  expect(g.state.inventory.find((i) => /long sword/.test(i.text))?.accelerator).toBe("e");
});
