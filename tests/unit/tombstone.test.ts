import { expect, test } from "vitest";
import { tombstone } from "../../src/port/tombstone";

test("the stone is engraved with who, the score, the death in lines of 16, and the year on its bottom line, with its walls in line", () => {
  const rows = tombstone({ who: "glorat", points: 48210, death: "killed by a soldier ant", year: 2026 }).map((r) => `${r.before}${r.engraved ?? ""}${r.after ?? ""}`);
  const face = rows.filter((r) => r.startsWith("    |"));
  expect(face.map((r) => r.slice(5, 23).trim())).toEqual(["glorat", "48,210 points", "killed by a", "soldier ant", "", "", "2026"]);
  for (const row of face) expect(row.lastIndexOf("|")).toBe(23);
  expect(rows.at(-2)!.indexOf("|")).toBe(4);
  expect(rows.at(-1)!.indexOf(")")).toBe(4);
  expect(rows.at(-1)!.lastIndexOf("|")).toBe(23);
});

test("only four lines of a long death fit, and nothing is required but who", () => {
  const engraved = tombstone({ who: "x", death: "killed by the Wizard of Yendor, while frozen by a potion, while praying" }).flatMap((r) => (r.engraved ? [r.engraved.trim()] : []));
  expect(engraved).toEqual(["x", "", "killed by the", "Wizard of", "Yendor, while", "frozen by a", ""]);
});
