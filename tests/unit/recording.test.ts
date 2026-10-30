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
    expect(parseAnswer("getlin", recording.sessions[0].lines[0].rest)).toEqual({ kind: "getlin", text });
  }
  expect(parseRecording(head).utcOffset).toBe(11 * 3600);
});

test("menu answers keep an empty choice apart from a cancelled menu", () => {
  const request = { kind: "menu" as const, how: "any" as const, prompt: "", items: [], unlisted: "" };
  for (const selection of [[], [{ identifier: -5, count: -1 }, { identifier: 12, count: 3 }]]) {
    const rest = answerLine(request, { kind: "menu", selection }).slice(2);
    expect(parseAnswer("menu", rest)).toEqual({ kind: "menu", selection });
  }
  // the game takes no answer and no selection alike, as cancelling
  expect(parseAnswer("menu", answerLine(request, { kind: "menu", selection: null }).slice(2))).toBeNull();
});
