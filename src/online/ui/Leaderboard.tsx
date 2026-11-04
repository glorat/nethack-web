import { useEffect, useState } from "preact/hooks";
import { ascended, type LeaderboardEntry, standing } from "../results";
import { loadLeaderboard } from "../server/api";

const endedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

/** Everyone's best online games, as the server's replay scored them. */
export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    loadLeaderboard().then(setEntries, (e) => console.warn("couldn't load the leaderboard", e));
  }, []);
  if (!entries) return null;
  return (
    <section class="landing-panel landing-device secondary">
      <h2>Online high scores</h2>
      {entries.length ? (
        <ol class="device-scores leaderboard">
          {entries.map((entry, i) => (
            <li key={i} class={[ascended(entry.result) && "ascended", entry.yours && "yours"].filter(Boolean).join(" ") || undefined}>
              <small>{i + 1}</small>
              <strong>{entry.result.points?.toLocaleString() ?? "–"}</strong>
              <span>
                {standing(entry)}
                {entry.yours ? <em> (yours)</em> : null}
              </span>
              <small>{entry.endedAt !== undefined ? endedOn(entry.endedAt) : null}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>No online games have been scored yet.</p>
      )}
    </section>
  );
}
