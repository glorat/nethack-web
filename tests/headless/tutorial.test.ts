import { expect, test } from "vitest";
import { savedOptionsFile } from "../../src/port/options";
import { replayRecording, Session } from "./harness";

async function quit(g: Session) {
  await g.send("#");
  await g.answer({ kind: "ext_cmd", index: (g.prompt as { commands: { name: string; index: number }[] }).commands.find((c) => c.name === "quit")!.index });
  while (!g.ended) await (g.prompt?.kind === "yn" ? g.yn(/really quit/i.test(g.prompt.query) ? "y" : "n") : g.dismiss());
}

test("the tutorial question offers not asking again, and says where to change it", async () => {
  const g = await (await Session.start({ askTutorial: true })).skipText();
  expect(g.prompt).toMatchObject({ kind: "menu", prompt: "Do you want a tutorial?" });
  const items = (g.prompt as { items: { accelerator: string; text: string }[] }).items;
  expect(items.filter((i) => i.accelerator).map((i) => [i.accelerator, i.text])).toEqual([
    ["y", "Yes, do a tutorial"],
    ["n", "No, just start play"],
    ["d", "No, and don't ask again"],
  ]);
  expect(items.map((i) => i.text)).toContain("You can change this in Game Settings.");
});

test("not asking again starts play, has the page keep !tutorial, and replays", async () => {
  // seeds from the page, which the recording keeps, so it can be replayed
  const g = await (await Session.start({ askTutorial: true, pageSeed: 3 })).skipText();
  await g.pick(/don't ask again/);
  await g.skipText();
  expect(g.state.status.dungeon_name?.text).toBe("The Dungeons of Doom");
  expect(g.keptOptions).toEqual(["!tutorial"]);

  await quit(g);
  const replayed = await replayRecording(g.recording!);
  expect(replayed.error).toBeNull();
  expect(replayed.state.status).toEqual(g.state.status);
});

test("the other answers keep nothing, and the tutorial's portal leads back to regular play", async () => {
  const no = await (await Session.start({ askTutorial: true })).skipText();
  await no.pick(/just start play/);
  expect(no.keptOptions).toEqual([]);

  const g = await (await Session.start({ askTutorial: true, wizard: true })).skipText();
  await g.pick(/do a tutorial/);
  await g.skipText();
  expect(g.keptOptions).toEqual([]);
  expect(g.state.status.dungeon_name?.text).toBe("The Tutorial");
  // beside the first portal, which is at the map's 4,4 where the hero starts at 9,3; ^T won't land on a trap
  const { x, y } = g.hero;
  await g.teleport(x - 5, y + 2);
  await g.send("k");
  await g.yn("y");
  await g.skipText();
  expect(g.messages).toContain("Resuming regular play.");
  expect(g.state.status.dungeon_name?.text).toBe("The Dungeons of Doom");
});

test("after not asking again, #saveoptions in the same game keeps !tutorial", async () => {
  const g = await (await Session.start({ askTutorial: true })).skipText();
  await g.pick(/don't ask again/);
  await g.skipText();
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "saveoptions")!.index });
  await g.getlin("yes");
  expect(savedOptionsFile(g.state.optionsFile!, "")).toMatch(/^OPTIONS=.*!tutorial/m);
});
