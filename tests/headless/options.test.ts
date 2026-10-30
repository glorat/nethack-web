import { expect, test } from "vitest";
import { configFile } from "../../src/port/options";
import { Session } from "./harness";

test("the player's options override the game's in one file, with no complaint about either", async () => {
  const g = await (await Session.start({ config: configFile("time,showexp,!autopickup", "OPTIONS=!time,autopickup\n") })).skipText();
  expect([...g.output, ...g.messages].join("\n")).not.toMatch(/multiple times|error/i);
  // the player's
  expect(g.state.status.BL_TIME).toBeUndefined();
  // the game's
  expect(g.state.status.BL_EXP).toBeDefined();
});

test("tile_file in the options is passed on for the tile set", async () => {
  const g = await (await Session.start({ options: "tile_file:tiles16.bmp" })).skipText();
  expect(g.state.tileFile).toBe("tiles16.bmp");
  const plain = await (await Session.start()).skipText();
  expect(plain.state.tileFile).toBeNull();
});
