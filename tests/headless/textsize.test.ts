import { expect, test } from "vitest";
import { Session } from "./harness";

test("font_size_message in the options sets the text size", async () => {
  const g = await (await Session.start({ options: "font_size_message:18" })).skipText();
  expect(g.state.textSize).toBe(18);
  const plain = await (await Session.start()).skipText();
  expect(plain.state.textSize).toBeNull();
});

test("font_size_status stands in for font_size_message", async () => {
  const g = await (await Session.start({ options: "font_size_status:16" })).skipText();
  expect(g.state.textSize).toBe(16);
});
