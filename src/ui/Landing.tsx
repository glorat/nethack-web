import { useEffect, useRef, useState } from "preact/hooks";
import { WIKI_URL } from "../port/describe";
import { playerName, PLAY_PATH, savedName, saveName } from "../port/name";
import { type GameSummary, onlineAddress, onlineWanted } from "../online/session";
import { OnlineChoice } from "../online/ui/OnlineChoice";
import { OnlineGames } from "../online/ui/OnlineGames";
import { saveOptions, savedOptions } from "../port/options";
import { keepLastMode, lastMode } from "../port/last-mode";
import type { Profile } from "../online/account";
import { AccountBar, HandlePrompt } from "../online/ui/Account";
import { offlineGameUnder } from "../offline/progress";
import { DeviceGames } from "../offline/ui/DeviceGames";
import { listOnlineGames, loadProfile, signInWithGoogle } from "../online/server/api";
import { updateWhenIdle } from "../sw/register";
import { AboutDialog } from "./dialogs/AboutDialog";
import { OptionsDialog } from "./dialogs/OptionsDialog";

/** Online stays out of sight in a production build until it's ready for players; `?online` shows it, for trying it there. */
const onlineOffered = () => import.meta.env.DEV || onlineWanted(location.search);

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  useEffect(() => {
    // anyone else's visit doesn't touch the server
    // asking again would only be refused again, and send this page back to itself
    if (!offered || returning !== "online" || refused) return;
    listOnlineGames().then(
      (games) => setLatestOnline(games.reduce<GameSummary | null>((a, g) => (a && a.lastPlayedAt >= g.lastPlayedAt ? a : g), null)),
      (e) => console.warn("couldn't list online games", e),
    );
    loadProfile().then(setProfile, (e) => console.warn("couldn't read the profile", e));
  }, []);
  const signIn = () => {
    setSigningIn(true);
    setSignInFailed(false);
    signInWithGoogle().then(
      () => {
        // the account's games and handle are the server's to show, which this page asks for after an online game
        keepLastMode("online");
        location.reload();
      },
      (e) => {
        setSigningIn(false);
        if ((e as { code?: string }).code === "auth/popup-closed-by-user") return;
        console.warn("couldn't sign in", e);
        setSignInFailed(true);
      },
    );
  };
  // a character's name is the player's choice, and their handle a good start for one
  useEffect(() => {
    if (profile?.handle && !name) setName(profile.handle);
  }, [profile?.handle]);
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
        <span class="landing-bar-end">
          {offered && !refused ? <AccountBar profile={profile} onSignIn={signIn} signingIn={signingIn} /> : null}
          <button onClick={() => setAbout(true)}>About</button>
        </span>
      </header>
      {signInFailed && (
        <p class="server-waiting" role="alert">
          Couldn't sign in. Try again, or keep playing as you are.
        </p>
      )}
      {refused && (
        <p class="server-waiting" role="alert">
          Online play isn't available in this browser right now, and your latest moves may not have been saved. Offline play still works.
        </p>
      )}
      <main class="landing-main">
        {offered && !refused && profile?.signedIn && !profile.handle ? <HandlePrompt profile={profile} onProfile={setProfile} /> : null}
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
        {offered && returning === "online" && !refused ? <OnlineGames /> : null}
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
                <strong>Online</strong> games are kept for you, so start as many as you like and pick any of them up again. You need a connection, and may lose your last few moves if it drops. Sign in to keep them with your account, and to choose the handle your scores are shown under; until then they stay linked to this browser, so clearing this site's data loses access to them. Shared high scores are on the way, for online games only.
              </p>
            ) : null}
            <p>
              <strong>Offline</strong> games run entirely on this device, and nothing is uploaded. The first visit downloads about 10 MB, and after that you can play with no connection. Close the tab at any time and your game comes back under the same name. Clearing this site's data deletes it, and so can the browser, if the device runs short of space or, in Safari, after a week away.{offered ? " A game you can't afford to lose is safer played online." : ""}
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
