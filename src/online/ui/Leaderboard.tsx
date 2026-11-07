import { useEffect, useState } from "preact/hooks";
import { ascended, type LeaderboardEntry, standing } from "../results";
import { loadLeaderboard } from "../server/api";
import { shareAddress } from "../share";

const endedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

/** Everyone's best online games, as the server's replay scored them. */
export function Leaderboard({ reload }: { reload: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    loadLeaderboard().then(setEntries, (e) => console.warn("couldn't load the leaderboard", e));
  }, [reload]);
  if (!entries) return null;
  return (
    <section class="frame landing-device" aria-labelledby="high-scores">
      <h2 class="frame-label" id="high-scores">
        High scores
      </h2>
      {entries.length ? (
        <>
          <div class="leaderboard-head" aria-hidden="true">
            <small>No</small>
            <small>Points</small>
            <small>Name</small>
          </div>
          <ol class="device-scores leaderboard">
          {entries.map((entry, i) => (
            <li key={i} class={[ascended(entry.result) && "ascended", entry.yours && "yours"].filter(Boolean).join(" ") || undefined}>
              <small>{i + 1}</small>
              <strong>{entry.result.points?.toLocaleString() ?? "–"}</strong>
              <span>
                {entry.game ? <a href={shareAddress("", entry.game)}>{standing(entry)}</a> : standing(entry)}
                {entry.yours ? <em> (yours)</em> : null}
              </span>
              <small>{entry.endedAt !== undefined ? endedOn(entry.endedAt) : null}</small>
            </li>
          ))}
          </ol>
        </>
      ) : (
        <p>No one is on the high scores yet. You hear the footsteps of a guard on patrol.</p>
      )}
    </section>
  );
}
