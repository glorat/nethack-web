import { useState } from "preact/hooks";
import { watchAddress } from "../../port/modes";
import { Grave } from "../../ui/landing/Grave";
import { lastGame } from "../last-game";
import { ascended, lastEnding, savedScores, scoreDate } from "../scores";

/** What this browser remembers of finished games. Offline games only, as online ones are the server's. */
export function DeviceGames() {
  const [scores] = useState(() => savedScores().slice(0, 5));
  const [last] = useState(lastEnding);
  const [replayable] = useState(() => lastGame() !== null);
  if (!scores.length && !replayable && !last) return null;
  return (
    <section class="frame landing-device" aria-labelledby="device-games">
      <h2 class="frame-label" id="device-games">
        {last ? "Your last game" : scores.length ? "Your best games on this device" : "On this device"}
      </h2>
      {last ? <Grave who={last.name} points={last.points} death={last.death} year={Math.floor(last.date / 10000)} /> : null}
      {scores.length ? (
        <>
          {last ? <h3>Your best games on this device</h3> : null}
          <ol class="device-scores">
            {scores.map((s, i) => (
              <li key={i} class={ascended(s) ? "ascended" : undefined}>
                <strong>{s.points.toLocaleString()}</strong>
                <span>
                  {s.name} ({s.role}-{s.race}): <span class="death">{s.death}</span>
                </span>
                <small>{scoreDate(s)}</small>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {replayable ? <a href={watchAddress("offline")}>Watch your last game</a> : null}
    </section>
  );
}
