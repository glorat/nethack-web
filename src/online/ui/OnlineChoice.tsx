import { useEffect, useRef, useState } from "preact/hooks";
import { PLAY_PATH } from "../../port/name";
import { listOnlineGames, loadProfile } from "../server/api";
import { type GameSummary, onlineAddress } from "../session";
import { zoneChoices, zoneLabel } from "../zones";

const browserZone = () => -new Date().getTimezoneOffset() * 60;

function playedOn(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Where an online game starts: the player's games still in flight, or a new one. */
export function OnlineChoice({ name, onBack }: { name: string; onBack: () => void }) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [zone, setZone] = useState(browserZone);
  const load = () => {
    setFailed(false);
    setGames(null);
    listOnlineGames().then(setGames, (e) => {
      console.warn("couldn't list online games", e);
      setFailed(true);
    });
  };
  useEffect(load, []);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    loadProfile().then(
      (p) => setSignedIn(p.signedIn),
      (e) => console.warn("couldn't read the profile", e),
    );
  }, []);
  const panel = useRef<HTMLDivElement>(null);
  // the button that opened this has gone, and focus with it
  useEffect(() => panel.current?.focus(), [games, failed]);
  if (failed)
    return (
      <div class="online-choice" ref={panel} tabIndex={-1}>
        <p role="alert">Can't reach the server. Online games need a connection; offline play still works.</p>
        <button type="button" class="primary" onClick={load}>
          Try Again
        </button>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    );
  if (!games)
    return (
      <div class="online-choice" ref={panel} tabIndex={-1}>
        <p role="status">Connecting…</p>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    );
  return (
    <div class="online-choice" ref={panel} tabIndex={-1}>
      {games.length ? (
        <>
          <h2>Your games in progress</h2>
          <ul class="online-games">
            {games.map((g) => (
              <li key={g.game}>
                <a href={onlineAddress(PLAY_PATH, g.name, { game: g.game })}>
                  <strong>{g.name}</strong>
                  <small>Last played {playedOn(g.lastPlayedAt)}</small>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h2>New game</h2>
      <label for="zone">Time zone</label>
      <select id="zone" value={zone} onChange={(e) => setZone(Number((e.target as HTMLSelectElement).value))}>
        {zoneChoices(browserZone()).map((z) => (
          <option key={z} value={z}>
            {zoneLabel(z)}
          </option>
        ))}
      </select>
      <p class="start-sub">Sets the date and hour in your game, which the moon and some monsters care about. It can't change once the game has started.</p>
      <p class="start-sub">If your connection drops, you may lose your last few moves.</p>
      <button type="button" class="primary" onClick={() => location.assign(onlineAddress(PLAY_PATH, name, { utcOffset: zone }))}>
        Start New Game as {name}
      </button>
      <button type="button" onClick={onBack}>
        Back
      </button>
      {/* below the buttons, as it arrives late and mustn't move them */}
      {signedIn === false ? <p class="start-sub">Until you sign in, your online games are kept for this browser only, and clearing this site's data loses them.</p> : null}
    </div>
  );
}
