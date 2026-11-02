import { useEffect, useRef, useState } from "preact/hooks";
import { WIKI_URL } from "../port/describe";
import { playerName, PLAY_PATH, savedName, saveName } from "../port/name";
import { type GameSummary, onlineAddress, onlineWanted } from "../online/session";
import { zoneChoices, zoneLabel } from "../online/zones";
import { saveOptions, savedOptions } from "../port/options";
import { lastMode } from "../port/last-mode";
import { offlineGameUnder } from "../offline/progress";
import { lastGame } from "../offline/last-game";
import { ascended, savedScores, scoreDate } from "../offline/scores";
import { listOnlineGames } from "../online/server/api";
import { updateWhenIdle } from "../sw/register";
import { AboutDialog } from "./dialogs/AboutDialog";
import { OptionsDialog } from "./dialogs/OptionsDialog";

/** Online stays out of sight in a production build until it's ready for players; `?online` shows it, for trying it there. */
const onlineOffered = () => import.meta.env.DEV || onlineWanted(location.search);

const browserZone = () => -new Date().getTimezoneOffset() * 60;

function playedOn(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Where an online game starts: the player's games still in flight, or a new one. */
function OnlineChoice({ name, onBack }: { name: string; onBack: () => void }) {
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
      <button type="button" class="primary" onClick={() => location.assign(onlineAddress(PLAY_PATH, name, { utcOffset: zone }))}>
        Start New Game as {name}
      </button>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/** What this browser remembers of finished games. Offline games only, as online ones are the server's. */
function DeviceGames() {
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
      {replayable ? <a href={`${PLAY_PATH}?replay`}>Watch your last game</a> : null}
    </section>
  );
}

export function Landing() {
  const [remembered] = useState(savedName);
  const [changing, setChanging] = useState(!remembered);
  const [name, setName] = useState(remembered);
  const [editingOptions, setEditingOptions] = useState(false);
  const [about, setAbout] = useState(false);
  const [choosingOnline, setChoosingOnline] = useState(false);
  const [offered] = useState(onlineOffered);
  const [refused] = useState(() => new URLSearchParams(location.search).has("refused"));
  const [latestOnline, setLatestOnline] = useState<GameSummary | null>(null);
  const [returning] = useState(lastMode);
  useEffect(() => {
    // anyone else's visit doesn't touch the server
    // asking again would only be refused again, and send this page back to itself
    if (!offered || returning !== "online" || refused) return;
    listOnlineGames().then(
      (games) => setLatestOnline(games.reduce<GameSummary | null>((a, g) => (a && a.lastPlayedAt >= g.lastPlayedAt ? a : g), null)),
      (e) => console.warn("couldn't list online games", e),
    );
  }, []);
  const offlineInProgress = !changing && offlineGameUnder(remembered);
  const continueOnline = latestOnline && !changing ? () => location.assign(onlineAddress(PLAY_PATH, latestOnline.name, { game: latestOnline.game })) : null;
  const mainAction = continueOnline ?? (offlineInProgress || !offered ? "offline" : "online");
  const playButton = useRef<HTMLButtonElement>(null);
  const backFromOnline = () => {
    setChoosingOnline(false);
    setTimeout(() => playButton.current?.focus());
  };
  const playOffline = () => {
    const n = playerName(name);
    if (!n) return;
    // where the browser won't keep the name, the address carries it to the game
    location.assign(saveName(n) ? PLAY_PATH : `${PLAY_PATH}?name=${encodeURIComponent(n)}`);
  };
  const chooseOnline = () => {
    const n = playerName(name);
    if (!n) return;
    saveName(n);
    setChoosingOnline(true);
  };
  const [offlineReady, setOfflineReady] = useState(false);
  // a reload would lose what's being typed
  const busy = useRef(false);
  busy.current = editingOptions || name !== remembered;
  useEffect(() => {
    updateWhenIdle(() => busy.current);
    if (import.meta.env.PROD) navigator.serviceWorker?.ready.then(() => setOfflineReady(true));
  }, []);
  const valid = playerName(name).length > 0;
  return (
    <div class="landing">
      <header class="landing-bar">
        <span class="landing-title">NetHack</span>
        <button onClick={() => setAbout(true)}>About</button>
      </header>
      {refused && (
        <p class="server-waiting" role="alert">
          Online play isn't available in this browser right now, and your latest moves may not have been saved. Offline play still works.
        </p>
      )}
      <main class="landing-main">
        <section class="landing-hero">
          <form
            class="start-card"
            onSubmit={(e) => {
              e.preventDefault();
              // Enter does what's highlighted
              if (continueOnline) continueOnline();
              else if (mainAction === "online") chooseOnline();
              else playOffline();
            }}
          >
            <h1>NetHack</h1>
            <p class="start-sub">The classic dungeon crawl with painted tiles, in your browser. Nothing to install, and it plays even with no connection.</p>
            {choosingOnline ? (
              <OnlineChoice name={playerName(name)} onBack={backFromOnline} />
            ) : (
              <>
                {changing ? (
                  <>
                    <label for="name">Who are you?</label>
                    <input id="name" value={name} autofocus maxLength={31} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
                  </>
                ) : null}
                {continueOnline && latestOnline ? (
                  <button type="submit" class="primary">
                    Continue Online as {latestOnline.name}
                  </button>
                ) : null}
                {[
                  offered ? (
                    <button key="online" type={mainAction === "online" ? "submit" : "button"} class={mainAction === "online" ? "primary" : undefined} disabled={!valid} ref={playButton} onClick={mainAction === "online" ? undefined : chooseOnline}>
                      {changing ? "Play Online" : `Play Online as ${remembered}`}
                    </button>
                  ) : null,
                  <button key="offline" type={mainAction === "offline" ? "submit" : "button"} class={mainAction === "offline" ? "primary" : undefined} disabled={!valid} onClick={mainAction === "offline" ? undefined : playOffline}>
                    {changing ? "Play Offline" : `${offlineInProgress ? "Continue" : "Play"} Offline as ${remembered}`}
                  </button>,
                ].sort((a, b) => Number(b?.key === mainAction) - Number(a?.key === mainAction))}
                <div class="start-links">
                  {changing ? null : (
                    <button type="button" onClick={() => setChanging(true)}>
                      Change Name
                    </button>
                  )}
                  <button type="button" onClick={() => setEditingOptions(true)}>
                    Edit Options File...
                  </button>
                </div>
              </>
            )}
            {offlineReady ? <p class="landing-ready">✓ Ready to play offline</p> : null}
          </form>
          <img class="landing-shot" src={`${import.meta.env.BASE_URL}screenshot.jpg`} alt="A NetHack game: the dungeon map in painted tiles, with stats, equipment, messages and inventory around it" />
        </section>
        <DeviceGames />
        <section class="landing-panels">
          <div class="landing-panel">
            <h2>New to NetHack?</h2>
            <ul>
              <li>Move with the arrow keys or <kbd>h j k l</kbd>, and <kbd>y u b n</kbd> for diagonals.</li>
              <li>Click the map to walk somewhere, and right-click to look at it.</li>
              <li>Every command is in the menus, with its key beside it.</li>
              <li><kbd>?</kbd> opens the game's help, and <kbd>S</kbd> saves and brings you back here.</li>
            </ul>
            <p>The <a href={WIKI_URL} target="_blank" rel="noopener">NetHack Wiki</a> covers everything.</p>
          </div>
          <div class="landing-panel">
            <h2>{offered ? "Online or offline?" : "Where your game is kept"}</h2>
            {offered ? (
              <p>
                <strong>Online</strong> games are kept for you, so start as many as you like and pick any of them up again. You need a connection, and may lose your last few moves if it drops. They stay linked to this browser for now, so clearing this site's data loses access to them. Shared high scores are on the way, for online games only.
              </p>
            ) : null}
            <p>
              <strong>Offline</strong> games run entirely on this device, and nothing is uploaded. The first visit downloads about 10 MB, and after that you can play with no connection. Close the tab at any time and your game comes back under the same name. Clearing this site's data deletes it.
            </p>
          </div>
        </section>
      </main>
      <footer class="landing-footer">
        <p>NetHack {__NETHACK_VERSION__}. An unofficial web port, not affiliated with the NetHack DevTeam. The official NetHack is at <a href="https://www.nethack.org/" target="_blank" rel="noopener">nethack.org</a>.</p>
        <p>
          Report problems on <a href="https://github.com/glorat/nethack-web/issues" target="_blank" rel="noopener">this site's issue tracker</a>, not to the DevTeam. <a href="https://github.com/glorat/nethack-web" target="_blank" rel="noopener">Source code</a>, <a href={`${import.meta.env.BASE_URL}license.txt`} target="_blank" rel="noopener">NetHack General Public License</a>, and <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener">other open source software</a>.
        </p>
      </footer>
      {editingOptions ? (
        <OptionsDialog
          text={savedOptions()}
          onDone={(text) => {
            if (text !== null && !saveOptions(text)) return false;
            setEditingOptions(false);
            return true;
          }}
        />
      ) : null}
      {about ? <AboutDialog onClose={() => setAbout(false)} /> : null}
    </div>
  );
}
