// An online game, from the page's side: the server holds it, so the page opens it there and sends it on as it's played.
import type { PageMode } from "../../ui/mode";
import { linesIn } from "../../port/recording";
import { expectedScoringMs, scoreGame } from "../score";
import { createOnlineSession, createUploader, scoreFinishedGame } from "../server/api";
import { gameWatchAddress } from "../results";
import type { OnlineSession } from "../session";
import type { LogUploader, UploadNotice } from "../upload";
import { chosenZone } from "../zones";

/** How long Save & Quit waits for the save to reach the server, as a player offline can't be kept here. */
const SAVE_SEND_MS = 5000;
/** The least time a finished game's player waits for its score before being told it will come later. */
const SCORE_WAIT_MS = 60_000;

/** What to tell the player about the server, or null for nothing. */
export type ServerNotice = string | null;

export function onlineMode(notice: (text: ServerNotice) => void): PageMode {
  let session: OnlineSession | null = null;
  let uploader: LogUploader | null = null;
  let waiting = false;
  let unsent: UploadNotice | null = null;
  let refused = false;
  let gameId: string | null = null;
  let ended: string | null = null;
  const show = () =>
    notice(
      refused
        ? "The server can't continue this game"
        : waiting
          ? "Waiting for the server"
          : unsent === "elsewhere"
            ? "This game is being played elsewhere, so your moves here aren't being saved"
            : unsent
              ? "Not connected: your latest moves aren't saved yet"
              : null,
    );
  const refuse = () => {
    refused = true;
    show();
  };
  return {
    kind: "online",
    dropsUnseenKeys: true,
    async start(game) {
      session = createOnlineSession((on) => {
        waiting = on;
        show();
      });
      const params = new URLSearchParams(location.search);
      const utcOffset = chosenZone(location.search, -new Date().getTimezoneOffset() * 60);
      const build = { version: __NETHACK_VERSION__, core: __CORE_COMMIT__ };
      waiting = true;
      show();
      const opened = await session
        .open({ name: game.name, utcOffset, options: game.options, config: game.config, build }, { game: params.get("game") ?? undefined, fresh: params.has("new") })
        .catch((e) => {
          console.warn("the server refused the game", e);
          return null;
        });
      waiting = false;
      show();
      if (!opened) {
        refuse();
        return null;
      }
      // a reload comes back to this game, not to whichever is latest
      params.set("game", opened.game);
      params.delete("new");
      // New Game reloads this address, and keeps to the zone chosen
      params.set("tz", String(opened.utcOffset));
      history.replaceState(null, "", `${location.pathname}?${params}`);
      document.documentElement.dataset.serverGame = opened.game;
      gameId = opened.game;
      uploader = createUploader(opened.game, { generation: opened.generation, sent: linesIn(opened.recording) }, (n) => {
        unsent = n;
        show();
      });
      return {
        assetBase: game.assetBase,
        options: opened.options,
        config: opened.config,
        shadowed: game.shadowed,
        authority: { kind: "online", game: opened.game, utcOffset: opened.utcOffset, recording: opened.recording, now: opened.now },
      };
    },
    events(events) {
      for (const e of events) {
        if (e.type === "recorded") {
          session?.recorded(e.lines.join("\n"));
          uploader?.add(e.lines, e.atPrompt);
        }
        if (e.type === "recorded_before") {
          session?.recorded(e.text);
          uploader?.before(e.text);
        }
      }
    },
    finished(text) {
      uploader?.finished(text);
      ended = text;
    },
    score() {
      const up = uploader;
      const id = gameId;
      // only a game that's over, not one saved to come back to
      if (!up || !id || ended === null || !/(^|\n)\d+ end over\n?$/.test(ended)) return null;
      const expectedMs = expectedScoringMs(linesIn(ended));
      const giveUpMs = Math.max(SCORE_WAIT_MS, 3 * expectedMs);
      const score = (async () => {
        await Promise.race([up.settled(), new Promise((r) => setTimeout(r, giveUpMs))]);
        const through = up.lastBatch();
        if (!through) return { kind: "later" as const };
        return scoreGame(id, location.origin, giveUpMs, {
          ask: () => scoreFinishedGame(id, through),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
          now: () => Date.now(),
        });
      })();
      return { expectedMs, score };
    },
    replayAddress() {
      return gameWatchAddress(new URLSearchParams(location.search).get("game") ?? "");
    },
    async seed() {
      if (!session) return null;
      return session.seed().catch((e) => {
        console.warn("the server refused a seed", e);
        refuse();
        return null;
      });
    },
    async leaving() {
      // the server holds the only copy, so the save has to get there
      if (uploader) await Promise.race([uploader.settled(), new Promise((r) => setTimeout(r, SAVE_SEND_MS))]);
    },
    closing() {
      uploader?.flushNow();
    },
    newGameAddress() {
      const params = new URLSearchParams(location.search);
      params.delete("game");
      params.set("new", "");
      return `${location.pathname}?${params}`;
    },
  };
}
