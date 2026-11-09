// An online game, from the worker's side: the server holds it, so nothing is kept here and it comes back by replay.
import type { AuthorityChoice } from "../protocol";
import { writeSaveFiles } from "../worker/replayer";
import type { WorkerMode } from "../worker/mode";
import { onlineAuthority } from "./authority";

export function onlineWorker(choice: Extract<AuthorityChoice, { kind: "online" }>): WorkerMode {
  return {
    authority: (_files, askSeed) => onlineAuthority(choice.game, choice.utcOffset, choice.now, choice.recording, askSeed),
    keptHere: false,
    recording: choice.recording,
    wantsRecordingSoFar: true,
    // until the server has its own, so none cross over from offline games
    bones: () => () => undefined,
    place: (m, _name, files) => writeSaveFiles(m, files),
    scores: () => null,
  };
}
