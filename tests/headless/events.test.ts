import { expect, test } from "vitest";
import { replayRecording, Session } from "./harness";

const ACH_AMUL = 6;
const ACH_NOVL = 20;
const LL_WISH = 0x1;
const WISHLESS = 1 << 9;

async function settle(g: Session): Promise<void> {
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
}

async function quit(g: Session): Promise<void> {
  await g.send("#");
  if (g.prompt?.kind === "ext_cmd") await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  while (!g.ended && g.prompt) {
    const p = g.prompt;
    if (p.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else await g.dismiss();
  }
}

test("a replay reports what the core does as it happens, with its turn and line", async () => {
  const g = await (await Session.start({ wizard: true, pageSeed: 5, seedsVary: true })).skipText();
  await g.send("\x17");
  await g.getlin("Amulet of Yendor");
  // the Amulet grants a wish of its own on arrival
  await g.getlin("novel");
  await settle(g);
  await g.send("r");
  await g.yn(g.state.inventory.find((i) => /novel|paperback/i.test(i.text))!.accelerator);
  await settle(g);
  await quit(g);
  const { error, events } = await replayRecording(g.recording!);
  expect(error).toBeNull();
  const achieved = events.filter((e) => e.kind === "achievement").map((e) => e.id);
  expect(achieved).toEqual(expect.arrayContaining([ACH_AMUL, ACH_NOVL]));
  expect(events).toContainEqual(expect.objectContaining({ kind: "chronicle", format: "made %s first wish - %s" }));
  expect(events.some((e) => e.kind === "chronicle" && (e.flags & LL_WISH) !== 0 && /Amulet of Yendor/.test(e.text))).toBe(true);
  expect(events).toContainEqual(expect.objectContaining({ kind: "uevent", field: "amulet_wish", value: 1 }));
  expect(events).toContainEqual(expect.objectContaining({ kind: "uevent", field: "read_tribute", value: 1 }));

  const end = events.at(-1)!;
  expect(end).toMatchObject({ kind: "end", session: 0 });
  expect(end.kind === "end" && end.conduct & WISHLESS).toBe(0);
  expect(events.every((e) => e.turn >= 1 && e.line > 0)).toBe(true);
  const lines = events.map((e) => e.line);
  expect(lines).toEqual([...lines].sort((a, b) => a - b));
});

test("what changes just before a save is reported in that session, not lost to the restore", async () => {
  const options = { wizard: true, pageSeed: 5, seedsVary: true };
  const first = await (await Session.start(options)).skipText();
  await first.send("\x17");
  await first.getlin("Amulet of Yendor");
  await first.getlin("apple");
  await first.send("S");
  const second = await Session.start({ ...options, saves: first.saves() });
  // debug mode asks this on every restore
  await second.yn("n");
  await quit(await second.skipText());

  const { error, events } = await replayRecording(second.recording!);
  expect(error).toBeNull();
  expect(events.filter((e) => e.kind === "uevent")).toEqual([expect.objectContaining({ field: "amulet_wish", value: 1, session: 0 })]);
  expect(events.filter((e) => e.kind === "end")).toEqual([expect.objectContaining({ session: 1 })]);
});
