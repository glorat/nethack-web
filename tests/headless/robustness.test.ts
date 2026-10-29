import { expect, test } from "vitest";
import { Session } from "./harness";

test("an error in the window code costs what it was showing, not the game", async () => {
  const g = await (await Session.start()).skipText();
  g.failPost = (events) => events.some((e) => e.type === "message" && /here/.test(e.text));
  await g.send(":");
  await g.send(":");
  expect(g.messages.at(-1)).toMatch(/here/);
}, 10_000);
