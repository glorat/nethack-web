import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { sha256 } from "../../src/worker/sha256";

test("hashes as SHA-256 does, at every length around a block's padding", () => {
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 70000]) {
    const data = Uint8Array.from({ length }, (_, i) => (i * 31) & 255);
    expect(sha256(data)).toBe(createHash("sha256").update(data).digest("hex"));
  }
});
