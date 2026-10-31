import { expect, test } from "vitest";
import { Shadow } from "../../src/worker/shadow";
import type { ShadowStatus } from "../../src/protocol";
import { headlessBoot, Session, type SessionOptions } from "./harness";

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A shadow given a game's lines as the page gives them, one batch at a time; two cores can't run at once here. */
async function shadowOf(g: Session, tamper: (line: string) => string = (l) => l) {
  const statuses: ShadowStatus[] = [];
  const shadow = new Shadow((await headlessBoot())(() => true), () => undefined, (s) => statuses.push(s));
  if (g.before) shadow.before(g.before);
  for (const { lines, atPrompt } of g.batches) {
    shadow.add(lines.map(tamper), atPrompt);
    await settled();
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  return statuses;
}

const options: SessionOptions = { pageSeed: 7, seedsVary: true, options: "time", shadowed: true };

async function quit(g: Session): Promise<void> {
  await g.send("#");
  if (g.prompt?.kind !== "ext_cmd") throw new Error("no extended command prompt");
  await g.answer({ kind: "ext_cmd", index: g.prompt.commands.find((c) => c.name === "quit")!.index });
  while (!g.ended) {
    const p = g.prompt;
    if (p?.kind === "yn") await g.yn(/really quit/i.test(p.query) ? "y" : "n");
    else if (p?.kind === "text") await g.dismiss();
    else if (p?.kind === "menu") await g.answer({ kind: "menu", selection: [] });
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
}

test("a shadow follows a game as it's played, waiting at the end of the lines so far", async () => {
  const g = await (await Session.start(options)).skipText();
  await g.send("s".repeat(25));
  const statuses = await shadowOf(g);
  expect(statuses.at(-1)).toMatchObject({ state: "following" });
  expect(statuses.at(-1)!.turn).toBeGreaterThan(20);
});

test("a shadow matches a game to its end", async () => {
  const g = await (await Session.start(options)).skipText();
  await g.send("s".repeat(25));
  await quit(g);
  expect((await shadowOf(g)).at(-1)).toMatchObject({ state: "ended" });
});

test("a shadow follows a game that came back, from what its recording held", async () => {
  const first = await (await Session.start(options)).skipText();
  await first.send("s".repeat(12));
  await first.send("S");
  const g = await (await Session.start({ ...options, saves: first.saves() })).skipText();
  await g.send("s".repeat(25));
  expect(g.before).toMatch(/ end save\n$/);
  expect((await shadowOf(g)).at(-1)).toMatchObject({ state: "following" });

  const back = await (await Session.start({ ...options, saves: g.persisted, resume: true })).skipText();
  await back.send("s".repeat(5));
  expect(back.batches.flatMap((b) => b.lines).some((l) => / back /.test(l))).toBe(true);
  expect((await shadowOf(back)).at(-1)).toMatchObject({ state: "following" });
});

test("a shadow gets past a session that was cut short, to follow the game recovered from it", async () => {
  const first = await (await Session.start(options)).skipText();
  await first.send("s".repeat(45));
  const g = await (await Session.start({ ...options, saves: first.persisted })).skipText();
  await g.send("s".repeat(30));
  expect(g.before).not.toBeNull();
  expect(g.recorded.some((l) => / session recover /.test(l))).toBe(true);
  const last = (await shadowOf(g)).at(-1)!;
  expect(last.state).toBe("following");
  expect(last.turn).toBeGreaterThan(60);
});

test("a shadow says where the game went differently, with its files", async () => {
  const g = await (await Session.start(options)).skipText();
  await g.send("s".repeat(45));
  // the second one, past what the shadow starts with; nothing else can show a difference this slight
  let checks = 0;
  const statuses = await shadowOf(g, (l) => (/^\d+ lv /.test(l) && ++checks === 2 ? l.replace(/ [0-9a-f]{16}$/, ` ${"0".repeat(16)}`) : l));
  const last = statuses.at(-1)!;
  expect(last.state).toBe("mismatch");
  expect(last.message).toMatch(/^line \d+ \(lv /);
  expect(Object.keys(last.files!)).toContain("0Tester.0");
});
