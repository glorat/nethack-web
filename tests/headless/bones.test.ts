import { expect, test } from "vitest";
import { replayRecording, Session, type SessionOptions } from "./harness";

const dead = { name: "Ghost", wizard: true, keepWizardBones: true, pageSeed: 5, seedsVary: true };

/** Dies by a wished-for wand of death on the first level, saying yes to bones. */
async function die(options: SessionOptions): Promise<Session> {
  const g = await (await Session.start(options)).skipText();
  await g.send("\x17");
  await g.getlin("wand of death");
  while (g.prompt && g.prompt.kind !== "poskey") await (g.prompt.kind === "text" ? g.dismiss() : g.yn("n"));
  await g.send("z");
  await g.yn(g.state.inventory.find((i) => /wand/.test(i.text))!.accelerator);
  await g.yn(".");
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/^die\?|bones/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else if (p?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
  return g;
}

const bare = (g: Session) => g.recorded.map((l) => l.replace(/^\d+ /, ""));

/** A new game that loads the bones in `saves`, looking through seeds for one that rolls to look for them. */
async function haunted(saves: Map<string, Uint8Array>, resume = false) {
  for (let pageSeed = 100; pageSeed < 200; pageSeed++) {
    const options = { pageSeed, seedsVary: true, options: "time", saves: new Map(saves), resume };
    const g = await (await Session.start(options)).skipText();
    if (bare(g).some((l) => /^bones bonD0\.1 [0-9a-f]{64}$/.test(l))) return { g, options };
  }
  throw new Error("no seed loaded the bones");
}

test("bones go to the host, not the core's own files, and are waiting for the next game", async () => {
  const saves = (await die(dead)).saves();
  const name = [...saves.keys()].find((k) => /^bones\/bon/.test(k))!;
  expect(name).toBe("bones/bonD0.1");
  const hash = new TextDecoder().decode(saves.get(name));
  expect(saves.has(`bones/${hash}`)).toBe(true);
  expect([...saves.keys()].filter((k) => /^bon[^e]/.test(k))).toEqual([]);
});

test("the page keeps no bones from a debug-mode game", async () => {
  const saves = (await die({ ...dead, keepWizardBones: false })).saves();
  expect([...saves.keys()].filter((k) => k.startsWith("bones/"))).toEqual([]);
});

test("a game loads bones from the host, which only it gets", async () => {
  const saves = (await die(dead)).saves();
  const { g } = await haunted(saves);
  expect(g.messages.join(" ")).not.toMatch(/discarding/i);
  await g.send("s");
  const left = g.persisted;
  expect(left.has("bones/bonD0.1")).toBe(false);
  expect(left.has(`bones/${new TextDecoder().decode(saves.get("bones/bonD0.1"))}`)).toBe(true);
  expect([...left.keys()].filter((k) => /^bon[^e]/.test(k))).toEqual([]);
});

test("a game that loaded bones replays them from the database, but not without it", async () => {
  const saves = (await die(dead)).saves();
  const { g } = await haunted(saves);
  await g.send("ss");
  const text = [...g.persisted].filter(([k]) => k.startsWith("replay/")).map(([, v]) => new TextDecoder().decode(v)).join("");
  expect(text.length).toBeLessThan(20000);

  expect((await replayRecording(text, g.persisted)).error).toBeNull();
  expect((await replayRecording(text)).error?.message).toMatch(/bones aren't kept/);
});

test("a game on bones comes back by replay, with no other game able to take them meanwhile", async () => {
  const saves = (await die(dead)).saves();
  const { g, options } = await haunted(saves);
  await g.send("sss");

  const next = await (await Session.start({ ...options, saves: g.persisted, resume: true })).skipText();
  expect(next.resumeFailure).toBeNull();
  expect(next.rng).toBe(g.rng);
  expect(next.hero).toEqual(g.hero);
  expect(next.persisted.has("bones/bonD0.1")).toBe(false);
});

test("a debug-mode game leaves waiting bones for a real game", async () => {
  const saves = (await die(dead)).saves();
  const g = await (await Session.start({ name: "Tester2", wizard: true, pageSeed: 9, saves: new Map(saves) })).skipText();
  await g.send("s");
  expect(g.prompt).toBeNull();
  expect(g.persisted.has("bones/bonD0.1")).toBe(true);
  expect(bare(g).filter((l) => l.startsWith("bones "))).toEqual([]);
});

test("a look for bones that finds none is recorded", async () => {
  const g = await (await Session.start({ pageSeed: 104, seedsVary: true })).skipText();
  await g.send("s");
  expect(bare(g).filter((l) => l.startsWith("bones ")).every((l) => / -$/.test(l))).toBe(true);
});
