import { expect, test } from "vitest";
import { onlineWorker } from "../../src/online/worker";
import type { NetHackModule } from "../../src/worker/memory";

const core = (files: Record<string, string>) =>
  ({
    FS: {
      readFile(path: string) {
        if (!(path in files)) throw new Error(`no ${path}`);
        return files[path];
      },
    },
  }) as unknown as NetHackModule;

test("an online game hands the page the line the game itself logged as it ended, and no high score file", () => {
  const mode = onlineWorker({ kind: "online", game: "g", utcOffset: 0, recording: "", now: 0 });
  expect(mode.scores(core({ "/save/xlogfile": "points=1\tname=a\npoints=3288\tname=b\n" }))).toEqual({ record: "", last: "points=3288\tname=b" });
  expect(mode.scores(core({}))).toBeNull();
});
