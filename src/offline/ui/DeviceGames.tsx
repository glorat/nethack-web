import { useState } from "preact/hooks";
import { watchAddress } from "../../port/modes";
import { lastGame } from "../last-game";
import { ascended, savedScores, scoreDate } from "../scores";

/** What this browser remembers of finished games. Offline games only, as online ones are the server's. */
export function DeviceGames() {
  const [scores] = useState(() => savedScores().slice(0, 5));
  const [replayable] = useState(() => lastGame() !== null);
  if (!scores.length && !replayable) return null;
  return (
    <section class="landing-panel landing-device">
      <h2>{scores.length ? "Your best games on this device" : "On this device"}</h2>
      {scores.length ? (
        <ol class="device-scores">
          {scores.map((s, i) => (
            <li key={i} class={ascended(s) ? "ascended" : undefined}>
              <strong>{s.points.toLocaleString()}</strong>
              <span>
                {s.name} ({s.role}-{s.race}): {s.death}
              </span>
              <small>{scoreDate(s)}</small>
            </li>
          ))}
        </ol>
      ) : null}
      {replayable ? <a href={watchAddress("offline")}>Watch your last game</a> : null}
    </section>
  );
}
