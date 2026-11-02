import { describe, expect, test } from "vitest";
import { HANDLE_FORMAT, type Profile, requestNote } from "../../src/online/account";

const profile = (over: Partial<Profile>): Profile => ({ signedIn: true, handle: null, request: null, ...over });

describe("accounts", () => {
  test.each([
    ["taken", "Agnes is taken. Choose another."],
    ["refused", "Agnes can't be used. Choose another."],
    ["granted", null],
  ] as const)("says why a request that was %s gave no handle", (outcome, note) => {
    expect(requestNote(profile({ request: { handle: "Agnes", outcome } }))).toBe(note);
  });

  test("says nothing once there's a handle", () => {
    expect(requestNote(profile({ handle: "Bert", request: { handle: "Agnes", outcome: "has a handle" } }))).toBeNull();
  });

  test("checks handles as the server does", () => {
    expect(HANDLE_FORMAT.test("Agnes2")).toBe(true);
    for (const h of ["ab", "1ab", "a-b-c", "a_b", "a".repeat(21)]) expect(HANDLE_FORMAT.test(h)).toBe(false);
  });
});
