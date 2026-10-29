import { expect, test } from "vitest";
import { Session } from "./harness";

/** Quits through #quit, declining the end-of-game questions; returns the text windows shown. */
async function quit(g: Session): Promise<string[]> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  const shown: string[] = [];
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") {
      shown.push(...p.lines.map((l) => l.text));
      await g.dismiss();
    } else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
  return shown;
}

test("a game left unfinished is offered for recovery and comes back", async () => {
  const left = await (await Session.start()).skipText();
  await left.send("llll");

  const next = await Session.start({ saves: left.saves() });
  expect(next.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/old game in progress/i) });
  await (await next.yn("r")).skipText();
  expect(next.messages.some((t) => /welcome back/i.test(t))).toBe(true);
});

test("restoring a save removes it, leaving the game to recovery", async () => {
  const saved = await (await Session.start()).skipText();
  await saved.send("S");
  await saved.yn("y");

  const restored = await (await Session.start({ saves: saved.saves() })).skipText();
  expect(restored.messages.some((t) => /welcome back/i.test(t))).toBe(true);
  expect([...restored.saves().keys()]).not.toContain("0Tester");

  const next = await Session.start({ saves: restored.saves() });
  expect(next.prompt).toMatchObject({ kind: "yn", query: expect.stringMatching(/old game in progress/i) });
});

test("the high score list is kept between games", async () => {
  // seed 3 starts the hero beside some gold, and net gold counts as points
  const first = await (await Session.start({ seed: 3 })).skipText();
  await first.send("h,");
  expect(Number(first.state.status.BL_GOLD?.text.replace(/\D/g, ""))).toBeGreaterThan(1);
  await quit(first);
  expect(first.saves().get("record")?.length).toBeGreaterThan(0);

  const second = await (await Session.start({ saves: first.saves(), name: "Other" })).skipText();
  const scores = await quit(second);
  expect(scores.some((line) => /Tester-Val/.test(line))).toBe(true);
});
