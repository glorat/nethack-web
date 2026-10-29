import { expect, test } from "vitest";
import { playerName } from "../../src/port/name";

test("letters, hyphens and at signs are kept", () => {
  expect(playerName("Agnes")).toBe("Agnes");
  expect(playerName("Mary-Jo@home")).toBe("Mary-Jo@home");
});

test("spaces and punctuation become underscores", () => {
  expect(playerName("Kevin Tam")).toBe("Kevin_Tam");
  expect(playerName("a,b:c=d")).toBe("a_b_c_d");
});

test("digits are kept except at the start", () => {
  expect(playerName("2nd")).toBe("_nd");
  expect(playerName("Agent47")).toBe("Agent47");
});

test("a long name is cut to fit, and nothing typed gives no name", () => {
  expect(playerName("x".repeat(40))).toHaveLength(31);
  expect(playerName("   ")).toBe("");
});
