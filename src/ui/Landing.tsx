import { useEffect, useRef, useState } from "preact/hooks";
import { WIKI_URL } from "../port/describe";
import { playerName, PLAY_PATH, savedName, saveName } from "../port/name";
import { type GameSummary, onlineAddress, onlineWanted, zoneChoices, zoneLabel } from "../port/online";
import { saveOptions, savedOptions } from "../port/options";
import { listOnlineGames } from "../server/upload";
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

export function Landing() {
  const [remembered] = useState(savedName);
  const [changing, setChanging] = useState(!remembered);
  const [name, setName] = useState(remembered);
  const [editingOptions, setEditingOptions] = useState(false);
  const [about, setAbout] = useState(false);
  const [choosingOnline, setChoosingOnline] = useState(false);
  const [offered] = useState(onlineOffered);
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
      <main class="landing-main">
        <section class="landing-hero">
          <form
            class="start-card"
            onSubmit={(e) => {
              e.preventDefault();
              // Enter does what's highlighted
              if (offered) chooseOnline();
              else playOffline();
            }}
          >
            <h1>NetHack</h1>
            <p class="start-sub">
              {offered
                ? "The classic dungeon crawl, in your browser. Play online to have your games kept for you, or offline with no connection at all."
                : "The classic dungeon crawl, played entirely on your device. No account, no server, and no connection needed once it's loaded."}
            </p>
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
                {offered ? (
                  <button type="submit" class="primary" disabled={!valid} ref={playButton}>
                    {changing ? "Play Online" : `Play Online as ${remembered}`}
                  </button>
                ) : null}
                <button type={offered ? "button" : "submit"} class={offered ? undefined : "primary"} disabled={!valid} onClick={offered ? playOffline : undefined}>
                  {changing ? "Play Offline" : `Play Offline as ${remembered}`}
                </button>
                {changing ? null : (
                  <button type="button" onClick={() => setChanging(true)}>
                    Change Name
                  </button>
                )}
                <button type="button" onClick={() => setEditingOptions(true)}>
                  Edit Options File...
                </button>
              </>
            )}
            {offlineReady ? <p class="landing-ready">✓ Ready to play offline</p> : null}
          </form>
          <img class="landing-shot" src={`${import.meta.env.BASE_URL}screenshot.jpg`} alt="A NetHack game: the dungeon map in painted tiles, with stats, equipment, messages and inventory around it" />
        </section>
        <section class="landing-panels">
          {offered ? (
            <div class="landing-panel">
              <h2>Play online</h2>
              <p>We keep your games for you, so there's nothing to lose by closing the tab.</p>
              <ul>
                <li>Start as many games as you like, and pick any of them up again.</li>
                <li>You need a connection while you play. If it drops, you may lose your last few moves.</li>
                <li>Your games stay linked to this browser for now, and clearing this site's data loses access to them.</li>
                <li>We keep a record of every game. Shared high scores and more are on the way, and fair play will count.</li>
              </ul>
            </div>
          ) : null}
          <div class="landing-panel">
            <h2>Play offline</h2>
            <p>The whole game runs on this device. Nothing is uploaded anywhere, and you don't need an account or a connection.</p>
            <ul>
              <li>Your first visit downloads the game, about 10 MB. After that it opens and plays with no connection, even on a plane.</li>
              <li>You can close the tab at any time. Your game comes back when you next press Play Offline under that name.</li>
              <li>Saved games stay in this browser on this device, and clearing this site's data deletes them.</li>
              <li>No shared high scores.</li>
            </ul>
          </div>
          <div class="landing-panel">
            <h2>Playing</h2>
            <ul>
              <li>Move with the arrow keys or <kbd>h j k l</kbd>, and <kbd>y u b n</kbd> for diagonals.</li>
              <li>Click the map to walk somewhere, and right-click to look at it.</li>
              <li>Every command is in the menus, with its key beside it.</li>
              <li><kbd>?</kbd> opens the game's help, and <kbd>S</kbd> saves and brings you back here.</li>
            </ul>
            <p>New to the game? The <a href={WIKI_URL} target="_blank" rel="noopener">NetHack Wiki</a> covers everything.</p>
          </div>
          <div class="landing-panel">
            <h2>About this site</h2>
            <p>This is an unofficial web port, not affiliated with the NetHack DevTeam. The official NetHack is at <a href="https://www.nethack.org/" target="_blank" rel="noopener">nethack.org</a>.</p>
            <p>
              Please report problems with this site on <a href="https://github.com/glorat/nethack-web/issues" target="_blank" rel="noopener">its issue tracker</a>, not to the DevTeam. Its <a href="https://github.com/glorat/nethack-web" target="_blank" rel="noopener">source code</a> and the game are under the <a href={`${import.meta.env.BASE_URL}license.txt`} target="_blank" rel="noopener">NetHack General Public License</a>. It also includes <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener">other open source software</a>.
            </p>
          </div>
        </section>
      </main>
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
