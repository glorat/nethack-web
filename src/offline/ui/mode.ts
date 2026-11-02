// An offline game, from the page's side: the browser keeps everything, and nothing goes anywhere.
import type { PageMode } from "../../ui/mode";
import { SAVED_FAREWELL } from "../../ui/mode";
import { gameAuthority } from "../fixed-inputs";
import { keepLastGame } from "../last-game";
import { offlineGameEnded, offlineGameStarted } from "../progress";
import { keepScores } from "../scores";

export function offlineMode(): PageMode {
  let name = "";
  return {
    kind: "offline",
    dropsUnseenKeys: false,
    async start(game) {
      name = game.name;
      offlineGameStarted(name);
      return { assetBase: game.assetBase, options: game.options, config: game.config, shadowed: game.shadowed, authority: gameAuthority() };
    },
    events(events) {
      for (const e of events) {
        if (e.type === "scores") keepScores(e.text);
        if (e.type === "game_over" && e.text !== SAVED_FAREWELL) offlineGameEnded(name);
      }
    },
    finished: keepLastGame,
    seed: async () => null,
    leaving: async () => {},
    closing() {},
    newGameAddress: () => location.pathname,
  };
}
