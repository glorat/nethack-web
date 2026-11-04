import { LogUploader, type LogPosition, type UploadDeps, type WriteResult } from "../upload";
import type { Profile } from "../account";
import type { Achievement } from "../achievements";
import type { FinishedGame, LeaderboardEntry } from "../results";
import { type GameSummary, loadGames, type OnlineDeps, OnlineSession } from "../session";

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

/** The player's finished games, latest first; asking waits for no one, as there's nothing to hold up. */
export const listFinishedGames = async (): Promise<FinishedGame[]> => (await (await server()).finishedGames({ sentAt: Date.now() })).games;

/** Deletes a finished online game, or says it's still being saved and can't be yet. One already gone counts as deleted. */
export async function deleteFinishedGame(game: string): Promise<"deleted" | "unsaved"> {
  try {
    await (await server()).deleteGame({ game, sentAt: Date.now() });
    return "deleted";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "functions/failed-precondition") return "unsaved";
    if (code === "functions/not-found") return "deleted";
    throw e;
  }
}

/** The best-scoring games on the server, best first. */
export const loadLeaderboard = async (): Promise<LeaderboardEntry[]> => (await (await server()).leaderboard({ sentAt: Date.now() })).entries;

/** The server's achievements, with when the player earned each. */
export const loadAchievements = async (): Promise<Achievement[]> => (await (await server()).achievements()).achievements;

/** A finished game's recording, or null if the server won't give one. */
export const finishedGameRecording = async (game: string): Promise<string | null> =>
  (await (await server()).gameRecording({ game, sentAt: Date.now() }))?.recording ?? null;

/** Whether the player is signed in, their handle, and their latest request for one. */
export const loadProfile = async (): Promise<Profile> => (await server()).profile();

export const signInWithGoogle = async (): Promise<void> => (await server()).signInWithGoogle();

export const finishSignIn = async (): Promise<boolean> => (await server()).finishSignIn();

export const signOut = async (): Promise<void> => (await server()).signOut();

/** Asks for a handle, which the server grants or not in its own time; the profile says which. */
export const askForHandle = async (handle: string): Promise<void> => {
  await (await server()).requestHandle({ handle, sentAt: Date.now() });
};
