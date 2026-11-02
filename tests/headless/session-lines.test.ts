import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { type Line, parseLine, parseRecording } from "../../src/worker/replayer";

const golden = (name: string) => readFileSync(resolve(__dirname, `golden/${name}.txt`), "utf8");
const head = '1 nhrec 1\n2 session new 2026-01-26T12:00:00.000Z tz=+00:00\n3 opt "name:A"\n4 rc ""\n5 alone 1\n';

/** Each session's lines as parsing every line up front gives them. */
function eachLineParsed(text: string): Line[][] {
  const sessions: Line[][] = [];
  for (const [i, raw] of text.split("\n").entries()) {
    if (!raw) continue;
    const line = parseLine(raw, i + 1);
    if (line.tag === "session") sessions.push([]);
    else if (!["nhrec", "opt", "rc", "alone"].includes(line.tag)) sessions.at(-1)!.push(line);
  }
  return sessions;
}

function readBack(text: string): Line[][] {
  return parseRecording(text).sessions.map((s) => Array.from({ length: s.recorded.length }, (_, i) => s.recorded.get(i)!));
}

test("a session's lines read back as parsing them all up front gives them", () => {
  const awkward = `${head}6 k 108\r\n\n\n9 l "a b"\n10 y "y"\n11 session restore 2026-01-27T12:00:00.000Z\n12 opt "name:A"\n13 rc ""\n14 k 46`;
  for (const text of [golden("valkyrie"), golden("archeologist"), awkward]) expect(readBack(text)).toEqual(eachLineParsed(text));
});

test("a line that can't be read fails the recording before any replay, wherever it is", () => {
  const lines = Array.from({ length: 3000 }, (_, i) => `${i + 6} k 108`);
  lines[2500] = "not a line";
  expect(() => parseRecording(`${head}${lines.join("\n")}\n`)).toThrow(/unreadable line: not a line/);
});

test("a recording's lines take less memory than its text", () => {
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc") as () => void;
  const used = () => {
    gc();
    gc();
    // typed arrays' contents are outside the heap
    const { heapUsed, arrayBuffers } = process.memoryUsage();
    return heapUsed + arrayBuffers;
  };
  const lines = Array.from({ length: 300_000 }, (_, i) => `${1_793_448_638 + i} k 108`);
  const text = `${head}${lines.join("\n")}\n`;
  const before = used();
  const recording = parseRecording(text);
  const kept = used() - before;
  expect(recording.sessions[0].recorded.length).toBe(lines.length);
  expect(kept).toBeLessThan(text.length);
});
