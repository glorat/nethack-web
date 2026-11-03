// An offline game, from the page's side: the browser keeps everything, and nothing goes anywhere.
import type { PageMode } from "../../ui/mode";
import { SAVED_FAREWELL } from "../../ui/mode";
import { gameAuthority } from "../fixed-inputs";
import { keepLastGame } from "../last-game";
import { offlineGameEnded, offlineGameStarted } from "../progress";
import { keepScores } from "../scores";

export const SAVE_FAILING = "Your game isn't being saved right now. If you close this page, you may lose your latest moves.";

export function offlineMode(notice: (text: string | null) => void): PageMode {
  let name = "";
  return {
    kind: "offline",
    dropsUnseenKeys: false,
    async start(game) {
      name = game.name;
      offlineGameStarted(name);
      // best-effort storage can be cleared by the browser, which would take the game with it
      void navigator.storage?.persist?.().catch(() => false);
      return { assetBase: game.assetBase, options: game.options, config: game.config, shadowed: game.shadowed, authority: gameAuthority() };
    },
    events(events) {
      for (const e of events) {
        if (e.type === "scores") keepScores(e.text);
        if (e.type === "game_over" && e.text !== SAVED_FAREWELL) offlineGameEnded(name);
        if (e.type === "save_failing") notice(e.failing ? SAVE_FAILING : null);
      }
    },
    finished(text) {
      keepLastGame(text);
    },
    replayAddress: () => `${location.pathname}?replay`,
    seed: async () => null,
    leaving: async () => {},
    closing() {},
    newGameAddress: () => location.pathname,
  };
}
