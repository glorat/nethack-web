import { useEffect, useRef, useState } from "preact/hooks";
import { WIKI_URL } from "../port/describe";
import { playerName, savedName, saveName } from "../port/name";
import { type GameMode, homeAddress, keepLastMode, lastMode, placeOf, playAddress } from "../port/modes";
import { type GameSummary, onlineAddress } from "../online/session";
import { OnlineChoice } from "../online/ui/OnlineChoice";
import { Leaderboard } from "../online/ui/Leaderboard";
import { OnlineGames } from "../online/ui/OnlineGames";
import { GamesInProgress } from "../online/ui/GamesInProgress";
import { Achievements } from "../online/ui/Achievements";
import { saveOptions, savedOptions } from "../port/options";
import type { Profile } from "../online/account";
import { AccountBar, HandlePrompt } from "../online/ui/Account";
import { offlineGameUnder } from "../offline/progress";
import { DeviceGames } from "../offline/ui/DeviceGames";
import { finishSignIn, listOnlineGames, loadProfile, signInWithGoogle, signOut } from "../online/server/api";
import { updateWhenIdle } from "../sw/register";
import { AboutDialog } from "./dialogs/AboutDialog";
import { GameSettingsDialog } from "./dialogs/GameSettingsDialog";

// each mode's home loads this; only the online one reaches the network
// an address it doesn't know is taken as offline, which reaches nothing
const MODE: GameMode = placeOf(location.pathname)?.mode ?? "offline";
// how long the online home waits before saying it can't reach the server; reCAPTCHA blocked never answers at all
const SLOW_MS = 8000;
const OTHER: GameMode = MODE === "online" ? "offline" : "online";
// read before this visit is kept, so a first visit opens the help; kept at once, as the page may be left before it paints
const RETURNING = lastMode();
keepLastMode(MODE);

/** This page's address without the given parameters. */
function addressWithout(...names: string[]): string {
  const params = new URLSearchParams(location.search);
  for (const name of names) params.delete(name);
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ""}`;
}

export function Landing() {
  const online = MODE === "online";
  const [remembered] = useState(savedName);
  const [changing, setChanging] = useState(!remembered);
  const [name, setName] = useState(remembered);
  const [editingOptions, setEditingOptions] = useState(false);
  const [deletions, setDeletions] = useState(0);
  const [about, setAbout] = useState(false);
  const [choosingOnline, setChoosingOnline] = useState(false);
  const returning = RETURNING;
  const [refused] = useState(() => online && new URLSearchParams(location.search).has("refused"));
  const [inProgress, setInProgress] = useState<GameSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreachable, setUnreachable] = useState(() => online && navigator.onLine === false);
  const loaded = useRef(false);
  useEffect(() => {
    if (!online || refused) return;
    const slow = setTimeout(() => !loaded.current && setUnreachable(true), SLOW_MS);
    return () => clearTimeout(slow);
  }, []);
  // asking again would only be refused again
  const [finishing, setFinishing] = useState(online && !refused);
  const [signingIn, setSigningIn] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [signedOut] = useState(() => online && new URLSearchParams(location.search).has("signedout"));
  const [signOutFailed, setSignOutFailed] = useState(false);
  useEffect(() => {
    // these notes are for how the page was reached, not for a reload later
    const params = new URLSearchParams(location.search);
    if (params.has("signedout") || params.has("refused")) history.replaceState(history.state, "", addressWithout("signedout", "refused"));
  }, []);
  useEffect(() => {
    if (!finishing) return;
    // a page Google sent back after signing in has its answer to read first; any other has none, and asks nothing
    finishSignIn()
      .catch((e) => {
        console.warn("couldn't sign in", e);
        setSignInFailed(true);
      })
      .finally(() => setFinishing(false));
  }, []);
  useEffect(() => {
    // until a sign-in is finished, the player's games and profile are still the anonymous player's
    if (!online || finishing || refused) return;
    let failed = false;
    const lost = (what: string) => (e: unknown) => {
      console.warn(`couldn't ${what}`, e);
      failed = true;
      setUnreachable(true);
    };
    void Promise.all([
      listOnlineGames().then(setInProgress, lost("list online games")),
      loadProfile().then(setProfile, lost("read the profile")),
    ]).then(() => {
      loaded.current = true;
      // answered after all, if slowly
      if (!failed) setUnreachable(false);
    });
  }, [finishing]);
  useEffect(() => {
    if (!online) return;
    const gone = () => setUnreachable(true);
    addEventListener("offline", gone);
    return () => removeEventListener("offline", gone);
  }, []);
  useEffect(() => {
    // back from Google without signing in, the browser may show this page as it was left
    const shown = (e: PageTransitionEvent) => e.persisted && setSigningIn(false);
    addEventListener("pageshow", shown);
    return () => removeEventListener("pageshow", shown);
  }, []);
  const signIn = () => {
    setSigningIn(true);
    setSignInFailed(false);
    signInWithGoogle().catch((e) => {
      setSigningIn(false);
      console.warn("couldn't sign in", e);
      setSignInFailed(true);
    });
  };
  const signOutHere = () => {
    setSignOutFailed(false);
    signOut().then(
      () => location.assign(`${homeAddress("online")}?signedout`),
      (e) => {
        console.warn("couldn't sign out", e);
        setSignOutFailed(true);
      },
    );
  };
  // a character's name is the player's choice, and their handle a good start for one
  useEffect(() => {
    if (profile?.handle && !name) setName(profile.handle);
  }, [profile?.handle]);
  const latestOnline = inProgress.reduce<GameSummary | null>((a, g) => (a && a.lastPlayedAt >= g.lastPlayedAt ? a : g), null);
  const offlineInProgress = !online && !changing && offlineGameUnder(remembered);
  const continueOnline = latestOnline && !changing ? () => location.assign(onlineAddress(latestOnline.name, { game: latestOnline.game })) : null;
  const playButton = useRef<HTMLButtonElement>(null);
  const backFromOnline = () => {
    setChoosingOnline(false);
    setTimeout(() => playButton.current?.focus());
  };
  const playOffline = () => {
    const n = playerName(name);
    if (!n) return;
    // where the browser won't keep the name, the address carries it to the game
    const path = playAddress("offline");
    location.assign(saveName(n) ? path : `${path}?name=${encodeURIComponent(n)}`);
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
  const onlinePanels = online && !refused;
  // each asks once, as it appears, which has to be as the signed-in player
  const accountPanels = onlinePanels && !finishing;
  const goOther = (label: string) => (
    <a class="mode-switch" href={homeAddress(OTHER)}>
      {label}
    </a>
  );
  return (
    <div class={`landing ${MODE}`}>
      <header class={`landing-bar ${MODE}`}>
        <span class="landing-title">
          NetHack{online ? null : <span class="mode-badge">Offline</span>}
        </span>
        <span class="landing-bar-end">
          {onlinePanels ? <AccountBar profile={profile} onSignIn={signIn} signingIn={signingIn || finishing} onSignOut={signOutHere} /> : null}
          {goOther(online ? "Go Offline" : "Go Online")}
          <button onClick={() => setAbout(true)}>About</button>
        </span>
      </header>
      {signInFailed && (
        <p class="landing-note" role="alert">
          Couldn't sign in. Try again, or keep playing as you are.
        </p>
      )}
      {signOutFailed && (
        <p class="landing-note" role="alert">
          Couldn't sign out. Try again.
        </p>
      )}
      {signedOut && (
        <p class="landing-note" role="status">
          You're signed out. Your online games and handle are kept for when you sign in again.
        </p>
      )}
      {refused ? (
        <p class="landing-note" role="alert">
          Online play isn't available in this browser right now, and your latest moves may not have been saved. Offline play still works. {goOther("Go Offline")}
        </p>
      ) : unreachable ? (
        <p class="landing-note" role="alert">
          Can't reach the server right now. Your online games are safe and will be here when you're back. {goOther("Play Offline Instead")}
        </p>
      ) : null}
      <main class="landing-main">
        {onlinePanels && profile?.signedIn && !profile.handle ? <HandlePrompt profile={profile} onProfile={setProfile} /> : null}
        <section class="landing-hero">
          <form
            class="start-card"
            onSubmit={(e) => {
              e.preventDefault();
              // Enter does what's highlighted
              if (!online) playOffline();
              else if (continueOnline) continueOnline();
              else chooseOnline();
            }}
          >
            <h1>NetHack</h1>
            <p class="start-sub">
              {online
                ? "Your games are kept for you, so you can pick them up on any device, and the ones you finish count for the high scores. Needs a connection."
                : "Games stay on this device and play with no connection. They aren't backed up or scored, and they're separate from your online games."}
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
                {online ? (
                  <>
                    {continueOnline && latestOnline ? (
                      <button type="submit" class="primary">
                        Continue Online as {latestOnline.name}
                      </button>
                    ) : null}
                    <button type={continueOnline ? "button" : "submit"} class={continueOnline ? undefined : "primary"} disabled={!valid} ref={playButton} onClick={continueOnline ? chooseOnline : undefined}>
                      {changing ? "Play Online" : `Play Online as ${remembered}`}
                    </button>
                  </>
                ) : (
                  <button type="submit" class="primary" disabled={!valid}>
                    {changing ? "Play Offline" : `${offlineInProgress ? "Continue" : "Play"} Offline as ${remembered}`}
                  </button>
                )}
                <div class="start-links">
                  {changing ? null : (
                    <button type="button" onClick={() => setChanging(true)}>
                      Change Name
                    </button>
                  )}
                  <button type="button" onClick={() => setEditingOptions(true)}>
                    Game Settings...
                  </button>
                </div>
              </>
            )}
            {!online && offlineReady ? <p class="landing-ready">✓ Ready to play offline</p> : null}
          </form>
          <img class="landing-shot" src={`${import.meta.env.BASE_URL}screenshot.jpg`} alt="A NetHack game: the dungeon map in painted tiles, with stats, equipment, messages and inventory around it" />
        </section>
        {accountPanels ? (
          <>
            {/* one is already the Continue button */}
            {inProgress.length > 1 ? <GamesInProgress games={inProgress} /> : null}
            <OnlineGames onDeleted={() => setDeletions((n) => n + 1)} />
            {/* a deletion can change both */}
            <Achievements reload={deletions} />
            <Leaderboard reload={deletions} />
          </>
        ) : null}
        {online ? null : <DeviceGames />}
        <section class="landing-panels">
          <details class={`landing-panel landing-help${returning ? " secondary" : ""}`} open={!returning}>
            <summary>
              <h2>New to NetHack?</h2>
            </summary>
            <ul>
              <li>Move with the arrow keys or <kbd>h j k l</kbd>, and <kbd>y u b n</kbd> for diagonals.</li>
              <li>Click the map to walk somewhere, and right-click to look at it.</li>
              <li>Every command is in the menus, with its key beside it.</li>
              <li><kbd>?</kbd> opens the game's help, and <kbd>S</kbd> saves and brings you back here.</li>
            </ul>
            <p>The <a href={WIKI_URL} target="_blank" rel="noopener">NetHack Wiki</a> covers everything.</p>
          </details>
          {online ? null : (
            <div class="landing-panel">
              <h2>Play online</h2>
              <p>Online games are kept for you, so you can pick them up on any device, and the ones you finish count for the high scores. They're separate from the games on this device.</p>
              {goOther("Go Online")}
            </div>
          )}
        </section>
      </main>
      <footer class="landing-footer">
        <p>NetHack {__NETHACK_VERSION__}. An unofficial web port, not affiliated with the NetHack DevTeam. The official NetHack is at <a href="https://www.nethack.org/" target="_blank" rel="noopener">nethack.org</a>.</p>
        <p>
          Report problems on <a href="https://github.com/glorat/nethack-web/issues" target="_blank" rel="noopener">this site's issue tracker</a>, not to the DevTeam. <a href="https://github.com/glorat/nethack-web" target="_blank" rel="noopener">Source code</a>, <a href={`${import.meta.env.BASE_URL}license.txt`} target="_blank" rel="noopener">NetHack General Public License</a>, and <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener">other open source software</a>.
        </p>
        <p>
          <a href={`${import.meta.env.BASE_URL}terms/`}>Terms of Use</a> · <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy Policy</a>
        </p>
      </footer>
      {editingOptions ? (
        <GameSettingsDialog
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
