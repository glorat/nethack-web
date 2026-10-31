import { expect, test } from "vitest";
import { BonesDb } from "../../src/worker/bones";
import type { NetHackModule } from "../../src/worker/memory";

function db(): BonesDb {
  const files = new Map<string, string | Uint8Array>();
  return new BonesDb({
    analyzePath: (path: string) => ({ exists: files.has(path) }),
    mkdir: (path: string) => void files.set(path, ""),
    writeFile: (path: string, data: string | Uint8Array) => void files.set(path, data),
    readFile: (path: string) => files.get(path),
    unlink: (path: string) => void files.delete(path),
  } as unknown as NetHackModule["FS"]);
}

const first = Uint8Array.of(1, 2, 3);
const second = Uint8Array.of(4, 5, 6);

test("bones left for a level go to the next game there, and only that one", () => {
  const bones = db();
  bones.keep("bonD0.5", first);
  expect(bones.take("bonD0.5")).toEqual(first);
  expect(bones.take("bonD0.5")).toBeNull();
  expect(bones.take("bonD0.6")).toBeNull();
});

test("the first bones left for a level stay until a game takes them, then others can wait", () => {
  const bones = db();
  bones.keep("bonD0.5", first);
  bones.keep("bonD0.5", second);
  expect(bones.take("bonD0.5")).toEqual(first);
  bones.keep("bonD0.5", second);
  expect(bones.take("bonD0.5")).toEqual(second);
});

test("bones taken can still be found by their hash, for replays", () => {
  const bones = db();
  bones.keep("bonD0.5", first);
  bones.take("bonD0.5");
  const sha = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
  expect(bones.get(sha)).toEqual(first);
  expect(bones.get("0".repeat(64))).toBeUndefined();
});
