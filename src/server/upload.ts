import { localUploadStore, LogUploader, type WriteResult } from "../port/upload";

export { uploadWanted } from "../port/upload";

/** A failure here only delays the upload: the game never waits on it, and plays the same with no connection. */
export function createUploader(): LogUploader {
  let introduced = false;
  return new LogUploader({
    store: localUploadStore,
    now: () => Date.now(),
    async write(game, id, lines, sentAt): Promise<WriteResult> {
      if (!import.meta.env.DEV) return "failed";
      try {
        const server = await import("./firebase");
        const result = await server.writeBatch(game, id, lines, sentAt);
        if (!introduced) {
          introduced = true;
          void server.whoami().then((uid) => (document.documentElement.dataset.serverUid = uid));
        }
        return result;
      } catch (e) {
        console.warn("upload failed", e);
        return "failed";
      }
    },
  });
}
