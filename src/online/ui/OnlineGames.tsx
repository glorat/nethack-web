import { useEffect, useState } from "preact/hooks";
import { PLAY_PATH } from "../../port/name";
import { ascended, type FinishedGame, watchAddress } from "../results";
import { listFinishedGames } from "../server/api";

const SHOWN = 10;

const endedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The player's finished online games, with each one's result once the server has replayed it. */
export function OnlineGames() {
  const [games, setGames] = useState<FinishedGame[] | null>(null);
  useEffect(() => {
    listFinishedGames().then(
      (found) => setGames(found.slice(0, SHOWN)),
      // offline play has to work without the server, so this says nothing
      (e) => console.warn("couldn't list finished online games", e),
    );
  }, []);
  if (!games?.length) return null;
  return (
    <section class="landing-panel landing-device">
      <h2>Your online games</h2>
      <ol class="device-scores online-scores">
        {games.map(({ game, name, endedAt, result }) => (
          <li key={game} class={ascended(result) ? "ascended" : undefined}>
            <strong>{result?.points !== undefined ? result.points.toLocaleString() : "–"}</strong>
            <span>
              {result
                ? `${name} (${result.role}-${result.race}): ${result.death}${result.turns !== undefined ? `, turn ${result.turns.toLocaleString()}` : ""}`
                : `${name}: scored once the server has replayed the game, within a few hours`}
            </span>
            <small>{endedOn(endedAt)}</small>
            <a href={watchAddress(PLAY_PATH, game)}>Watch</a>
          </li>
        ))}
      </ol>
    </section>
  );
}
