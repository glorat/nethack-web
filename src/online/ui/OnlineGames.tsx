import { useEffect, useState } from "preact/hooks";
import { PLAY_PATH } from "../../port/name";
import { ascended, type FinishedGame, outcome, watchAddress } from "../results";
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
        {games.map((g) => (
          <Row key={g.game} {...g} />
        ))}
      </ol>
    </section>
  );
}

function Row(g: FinishedGame) {
  const { game, name, endedAt, result } = g;
  return (
    <li class={ascended(result) ? "ascended" : undefined}>
      <strong>{result?.points !== undefined ? result.points.toLocaleString() : "–"}</strong>
      <span>{outcome(g)}</span>
      <small>{endedOn(endedAt)}</small>
      <a href={watchAddress(PLAY_PATH, game)} aria-label={`Watch ${name}'s game of ${endedOn(endedAt)}`}>
        Watch
      </a>
    </li>
  );
}
