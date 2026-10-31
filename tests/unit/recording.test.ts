import { expect, test } from "vitest";
import { answerLine } from "../../src/worker/recorder";
import { parseAnswer, parseRecording } from "../../src/worker/replayer";

const head = '1 nhrec 1\n2 session new 2026-01-26T12:00:00.000Z tz=+11:00\n3 opt "name:A"\n4 rc ""\n';

test("text holding any character reads back as it was written", () => {
  const request = { kind: "getlin" as const, query: "" };
  for (const text of ['say "hi"\\', "line break ", "", " "]) {
    const line = answerLine(request, { kind: "getlin", text });
    const recording = parseRecording(`${head}5 ${line}\r\n`);
    expect(recording.sessions[0].lines[0].tag).toBe("l");
    expect(parseAnswer(request, recording.sessions[0].lines[0].rest)).toEqual({ kind: "getlin", text });
  }
  expect(parseRecording(head).utcOffset).toBe(11 * 3600);
});

const item = (identifier: number, text: string) =>
  ({ identifier, text, accelerator: "", groupAccelerator: "", attr: 0, color: 0, tile: -1, preselected: false });
const menu = (items: ReturnType<typeof item>[]) => ({ kind: "menu" as const, how: "any" as const, prompt: "", items, unlisted: "?" });

test("menu answers keep an empty choice apart from a cancelled menu", () => {
  const request = menu([]);
  expect(parseAnswer(request, answerLine(request, { kind: "menu", selection: [] }).slice(2))).toEqual({ kind: "menu", selection: [] });
  // the game takes no answer and no selection alike, as cancelling
  expect(parseAnswer(request, answerLine(request, { kind: "menu", selection: null }).slice(2))).toBeNull();
});

test("a menu answer finds its items by their text, whatever number the core gives them now", () => {
  const then = menu([item(0, "Weapons"), item(5000, "a sword"), item(5008, "an apple"), item(5016, "an apple")]);
  const rest = answerLine(then, { kind: "menu", selection: [{ identifier: 5016, count: 3 }, { identifier: 5000, count: -1 }, { identifier: 63, count: 1 }] }).slice(2);
  expect(rest).not.toMatch(/50\d\d/);

  const now = menu([item(0, "Weapons"), item(0, "an apple"), item(7000, "a new thing"), item(7008, "an apple"), item(7016, "a sword"), item(7024, "an apple")]);
  expect(parseAnswer(now, rest)).toEqual({ kind: "menu", selection: [{ identifier: 7024, count: 3 }, { identifier: 7016, count: -1 }, { identifier: 63, count: 1 }] });
  expect(() => parseAnswer(menu([item(1, "an apple")]), rest)).toThrow(/no item/);
});

const command = (c: { index: number; name: string }) => ({ ...c, description: "", autocompletes: false });

test("an extended command is named, so a command added before it doesn't change what's replayed", () => {
  const then = { kind: "ext_cmd" as const, commands: [{ index: 0, name: "pray" }, { index: 1, name: "quit" }].map(command) };
  const rest = answerLine(then, { kind: "ext_cmd", index: 1 }).slice(2);
  expect(rest).toBe('"quit"');
  const now = { kind: "ext_cmd" as const, commands: [{ index: 0, name: "new" }, { index: 1, name: "pray" }, { index: 2, name: "quit" }].map(command) };
  expect(parseAnswer(now, rest)).toEqual({ kind: "ext_cmd", index: 2 });
  expect(() => parseAnswer({ ...now, commands: [] }, rest)).toThrow(/no command/);
  expect(parseAnswer(now, answerLine(then, { kind: "ext_cmd", index: -1 }).slice(2))).toBeNull();
});

test("a character is named, so a role added before it doesn't change what's replayed", () => {
  const named = (name: string) => ({ name, femaleName: name, tile: 0, femaleTile: 0 });
  const choices = (roles: string[], races: string[]) => ({
    roles: roles.map(named),
    races: races.map(named),
    validRace: [],
    validGender: [],
    validAlign: [],
    chosen: { role: -1, race: -1, gender: -1, align: -1 },
  });
  const then = { kind: "player" as const, choices: choices(["Archeologist", "Valkyrie"], ["human", "dwarf"]) };
  const rest = answerLine(then, { kind: "player", role: 1, race: 1, gender: 1, align: 0 }).slice(2);
  expect(JSON.parse(rest)).toEqual(["Valkyrie", "dwarf", "female", "lawful"]);
  const now = { kind: "player" as const, choices: choices(["New", "Archeologist", "Valkyrie"], ["human", "dwarf"]) };
  expect(parseAnswer(now, rest)).toEqual({ kind: "player", role: 2, race: 1, gender: 1, align: 0 });
  expect(() => parseAnswer({ ...now, choices: choices(["New"], ["human", "dwarf"]) }, rest)).toThrow(/no choice/);
  // ROLE_NONE and ROLE_RANDOM do different things in the core
  const left = answerLine(then, { kind: "player", role: -2, race: -1, gender: 0, align: 0 }).slice(2);
  expect(parseAnswer(now, left)).toEqual({ kind: "player", role: -2, race: -1, gender: 0, align: 0 });
});
