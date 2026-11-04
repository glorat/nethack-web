import { type GameSummary, onlineAddress } from "../session";

const playedOn = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The player's online games still in flight, the latest played first. */
export function GamesInProgress({ games }: { games: GameSummary[] }) {
  return (
    <section class="landing-panel landing-device">
      <h2>Your online games in progress</h2>
      <ol class="device-scores in-progress">
        {[...games]
          .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
          .map((g) => (
            <li key={g.game}>
              <strong>{g.name}</strong>
              <small>Last played {playedOn(g.lastPlayedAt)}</small>
              <a href={onlineAddress(g.name, { game: g.game })} aria-label={`Continue ${g.name}, last played ${playedOn(g.lastPlayedAt)}`}>
                Continue
              </a>
            </li>
          ))}
      </ol>
    </section>
  );
}
