import { expect, test } from "vitest";
import { TURN_SEPARATOR } from "../../src/port/state";
import { Session } from "./harness";

test("the core clears the message window between commands, so their messages are separated", async () => {
  const g = await (await Session.start({ options: "pettype:none" })).skipText();
  await g.send(":");
  await g.send(":");
  const texts = g.state.messages.map((m) => m.text);
  expect(texts.slice(-3)).toEqual([texts.at(-1), TURN_SEPARATOR, texts.at(-1)]);
  expect(texts.at(-1)).not.toBe(TURN_SEPARATOR);
});
