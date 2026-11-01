import { LogUploader, type LogPosition, type UploadDeps, type WriteResult } from "../port/upload";
import { type GameSummary, loadGames, type OnlineDeps, OnlineSession } from "../port/online";


/** Only ever loaded for an online game, so offline play never touches it. */
const server = () => import("./firebase");

export function createUploader(game: string, position: LogPosition, notice: UploadDeps["notice"]): LogUploader {
  let introduced = false;
  return new LogUploader(
    {
      now: () => Date.now(),
      notice,
      async write(game, id, lines, sentAt): Promise<WriteResult> {
        try {
          const firebase = await server();
          const result = await firebase.writeBatch(game, id, lines, sentAt);
          if (!introduced) {
            introduced = true;
            void firebase.whoami().then((uid) => (document.documentElement.dataset.serverUid = uid));
          }
          return result;
        } catch (e) {
          console.warn("upload failed", e);
          return "failed";
        }
      },
    },
    game,
    position,
  );
}

export function createOnlineSession(waiting: OnlineDeps["waiting"]): OnlineSession {
  return new OnlineSession({
    now: () => Date.now(),
    waiting,
    listGames: async (input) => (await server()).listGames(input),
    startGame: async (input) => (await server()).startGame(input),
    resumeGame: async (input) => (await server()).resumeGame(input),
    seed: async (input) => (await server()).seed(input),
  });
}

export const listOnlineGames = (): Promise<GameSummary[]> => loadGames({ now: () => Date.now(), listGames: async (input) => (await server()).listGames(input) });
