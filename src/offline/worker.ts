// An offline game, from the worker's side: everything is kept in this browser.
import type { AuthorityChoice } from "../protocol";
import { placeGameFiles } from "../worker/resume";
import type { WorkerMode } from "../worker/mode";
import { browserAuthority, fixedAuthority } from "./authority";
import { BonesDb } from "./bones";

export function offlineWorker(choice: Exclude<AuthorityChoice, { kind: "online" }>): WorkerMode {
  return {
    authority: (files) => (import.meta.env.DEV && choice.kind === "fixed" ? fixedAuthority(choice.inputs, files) : browserAuthority(files)),
    keptHere: true,
    recording: "",
    wantsRecordingSoFar: false,
    bones: (files) => (hash) => new BonesDb(files()).get(hash),
    place: placeGameFiles,
    scores(m) {
      const read = (file: string) => {
        try {
          return m.FS.readFile(`/save/${file}`, { encoding: "utf8" }) as string;
        } catch {
          // a game scoring nothing may leave no file
          return null;
        }
      };
      const record = read("record");
      if (record === null) return null;
      return { record, last: read("xlogfile")?.trimEnd().split("\n").pop() || null };
    },
  };
}
