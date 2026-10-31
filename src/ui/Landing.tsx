import { useEffect, useRef, useState } from "preact/hooks";
import { WIKI_URL } from "../port/describe";
import { playerName, PLAY_PATH, savedName, saveName } from "../port/name";
import { lastGame } from "../port/recording";
import { saveOptions, savedOptions } from "../port/options";
import { updateWhenIdle } from "../sw/register";
import { AboutDialog } from "./dialogs/AboutDialog";
import { OptionsDialog } from "./dialogs/OptionsDialog";

export function Landing() {
  const [remembered] = useState(savedName);
  const [changing, setChanging] = useState(!remembered);
  const [name, setName] = useState(remembered);
  const [editingOptions, setEditingOptions] = useState(false);
  const [about, setAbout] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [replayable] = useState(() => lastGame() !== null);
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
              const n = playerName(name);
              if (!n) return;
              // where the browser won't keep the name, the address carries it to the game
              location.assign(saveName(n) ? PLAY_PATH : `${PLAY_PATH}?name=${encodeURIComponent(n)}`);
            }}
          >
            <h1>NetHack</h1>
            <p class="start-sub">The classic dungeon crawl, played entirely on your device. No account, no server, and no connection needed once it's loaded.</p>
            {changing ? (
              <>
                <label for="name">Who are you?</label>
                <input id="name" value={name} autofocus maxLength={31} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              </>
            ) : null}
            <button type="submit" class="primary" disabled={!valid}>
              {changing ? "Play" : `Play as ${remembered}`}
            </button>
            {changing ? null : (
              <button type="button" onClick={() => setChanging(true)}>
                Change Name
              </button>
            )}
            <button type="button" onClick={() => setEditingOptions(true)}>
              Edit Options File...
            </button>
            {replayable ? (
              <button type="button" onClick={() => location.assign(`${PLAY_PATH}?replay`)}>
                Replay Last Game
              </button>
            ) : null}
            {offlineReady ? <p class="landing-ready">✓ Ready to play offline</p> : null}
          </form>
          <img class="landing-shot" src={`${import.meta.env.BASE_URL}screenshot.jpg`} alt="A NetHack game: the dungeon map in painted tiles, with stats, equipment, messages and inventory around it" />
        </section>
        <section class="landing-panels">
          <div class="landing-panel">
            <h2>Plays offline</h2>
            <p>The whole game runs in your browser, on this device. No server plays it for you and your games aren't uploaded anywhere.</p>
            <ul>
              <li>Your first visit downloads the game, about 10 MB. After that it opens and plays with no connection, even on a plane.</li>
              <li>You can close the tab at any time. Your game comes back when you next press Play.</li>
              <li>There's nothing online to join: no multiplayer and no shared high scores.</li>
            </ul>
          </div>
          <div class="landing-panel">
            <h2>Your saved games</h2>
            <p>A game is saved under your character's name, and playing under that name again restores it.</p>
            <p class="landing-warning">Saved games are kept only in this browser on this device. They don't follow you to other devices, and clearing this site's data deletes them.</p>
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
