// An online game, from the page's side: the server holds it, so the page opens it there and sends it on as it's played.
import type { PageMode } from "../../ui/mode";
import { linesIn } from "../../port/recording";
import { pointsIn } from "../../port/xlog";
import { expectedScoringMs, scoreGame } from "../score";
import { createOnlineSession, createUploader, loadProfile, scoreFinishedGame } from "../server/api";
import { homeAddress } from "../../port/modes";
import { type GameResult, gameWatchAddress } from "../results";
import type { OnlineSession } from "../session";
import type { LogUploader, UploadNotice } from "../upload";
import { JUST_FINISHED, type JustFinished } from "../share";
import { warmUpGamePage } from "../story";
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
  /** Asked for at the first wait with the game over, where the server ends the game: the batch that got there, and its score. */
  let early: { through: Promise<string | null>; scored: Promise<{ result?: GameResult }> } | null = null;
  /** The points the game itself counted as it ended. */
  let ownPoints: number | undefined;
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
          uploader?.add(e.lines, e.atPrompt, e.over);
          if (e.over && uploader && gameId && !early) {
            const up = uploader;
            const id = gameId;
            // scored while the player is still at the questions, as nothing they answer there changes it
            const through = up.settled().then(() => up.lastBatch());
            const scored = through.then((t) => (t ? scoreFinishedGame(id, t) : Promise.reject(new Error("nothing was sent"))));
            scored.catch(() => {});
            early = { through, scored };
            warmUpGamePage(id).catch((err) => console.warn("couldn't warm up the game's page", err));
          }
        }
        if (e.type === "scores" && e.last) ownPoints = pointsIn(e.last);
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
        const sent = early?.through ?? up.settled().then(() => up.lastBatch());
        const through = await Promise.race([sent, new Promise<string | null>((r) => setTimeout(() => r(up.lastBatch()), giveUpMs))]);
        if (!through) return { kind: "later" as const };
        let first = early?.scored ?? null;
        const [scored, profile] = await Promise.all([
          scoreGame(id, location.origin, giveUpMs, {
            ask: () => {
              const asked = first ?? scoreFinishedGame(id, through);
              first = null;
              return asked;
            },
            sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
            now: () => Date.now(),
          }),
          loadProfile().catch((e) => console.warn("couldn't read the profile", e)),
        ]);
        const done = scored.kind === "scored" && profile && !profile.signedIn ? { ...scored, signIn: `${homeAddress("online")}?signin` } : scored;
        if (done.kind === "scored") {
          const finished: JustFinished = { game: id, again: location.pathname + location.search, ...(done.signIn ? { signIn: done.signIn } : {}) };
          try {
            sessionStorage.setItem(JUST_FINISHED, JSON.stringify(finished));
          } catch {}
        }
        return done;
      })();
      return { expectedMs, ...(ownPoints === undefined ? {} : { preview: ownPoints }), score };
    },
    replayAddress() {
      return gameWatchAddress(new URLSearchParams(location.search).get("game") ?? "");
    },
    async seed(turn) {
      if (!session) return null;
      return session.seed(turn).catch((e) => {
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
