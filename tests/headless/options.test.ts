import { expect, test } from "vitest";
import { configFile, savedOptionsFile } from "../../src/port/options";
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

test("the options file #saveoptions writes is passed on to be kept", async () => {
  const g = await (await Session.start({ config: configFile("time,menucolors", "OPTIONS=autodig\n") })).skipText();
  expect(g.state.optionsFile).toBeNull();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "saveoptions")!.index });
  await g.getlin("yes");
  expect(g.state.optionsFile).toMatch(/^OPTIONS=autodig$/m);
  expect(g.state.optionsFile).toMatch(/NetHack config, saved/);
});

test("a saved options file, made the player's again, gives the same options next game", async () => {
  const base = "time,showexp,menucolors";
  const first = await (await Session.start({ config: configFile(base, "OPTIONS=!time,autodig\n") })).skipText();
  await first.send("#");
  if (first.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await first.answer({ kind: "ext_cmd", index: first.prompt.commands.find((c) => c.name === "saveoptions")!.index });
  await first.getlin("yes");
  const kept = savedOptionsFile(first.state.optionsFile!, base);

  const next = await (await Session.start({ config: configFile(base, kept) })).skipText();
  expect(next.state.status.BL_TIME).toBeUndefined();
  expect(next.state.status.BL_EXP).toBeDefined();
  expect([...next.output, ...next.messages].join("\n")).not.toMatch(/multiple times|error/i);
});
