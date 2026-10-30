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
