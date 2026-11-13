import type { GameState } from "../port/state";
import type { Watched } from "../worker/watch";
import type { Step } from "./metric";

/** The hero's square, by the core's mark on it (MG_HERO); the cursor wanders, as onto a monster being looked at. */
export function heroAt(state: GameState, mgHero: number): { x: number; y: number } | null {
  const cell = state.map.find((c) => c !== null && (c.glyphFlags & mgHero) !== 0);
  return cell ? { x: cell.x, y: cell.y } : null;
}

/**
 * Turns what a replay shows before each answer into the steps metrics read, for one game: call it once a game and
 * feed it every stop in order. `glyphFlags` is the core's MG table (display.h; nethackGlobal.constants.MG where the core
 * runs), and `monsterName` names the monster a glyph shows, from the game's data.
 */
export function stepper(glyphFlags: Record<string, number>, monsterName: (glyph: number) => string | null): (seen: Watched) => Step {
  if (!glyphFlags.MG_HERO) throw new Error("no MG_HERO in the glyph flags given");
  const glyphFlag = Object.fromEntries(Object.entries(glyphFlags).map(([k, v]) => [k.replace(/^MG_/, ""), v]));
  let lastMessageId = -1;
  let lastTurn = -1;
  let index = 0;
  return ({ state, answer, events }) => {
    const turn = Number(state.status.BL_TIME?.text ?? -1);
    const fresh = state.messages.filter((m) => m.id > lastMessageId);
    if (fresh.length) lastMessageId = fresh[fresh.length - 1].id;
    // the frontend's line between turns' messages isn't one the game showed
    const messages = fresh.filter((m) => !m.separator);
    const step: Step = {
      state,
      turn,
      level: (state.status.BL_LEVELDESC?.text ?? "").trim(),
      dungeon: (state.status.dungeon_name?.text ?? "").trim(),
      hero: heroAt(state, glyphFlags.MG_HERO),
      messages,
      newTurn: turn !== lastTurn,
      events,
      answer,
      index: index++,
      monsterName,
      glyphFlag,
    };
    lastTurn = turn;
    return step;
  };
}
