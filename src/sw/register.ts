const SCRIPT = `${import.meta.env.BASE_URL}sw.js`;
const RETRY_MS = 3000;
const GAME_PAGE_LOCK = "nethack-page";

export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register(SCRIPT).catch((e) => console.warn("offline support unavailable", e));
  }
}

/** For a game page, from its load: the lock the worker takes later doesn't cover a page still starting, or a second tab. */
export function holdOffUpdates() {
  void navigator.locks?.request(GAME_PAGE_LOCK, { mode: "shared" }, () => new Promise<void>(() => {}));
}

async function gamePageOpen(): Promise<boolean> {
  // without locks there's no telling, and a new version also arrives once every tab has closed
  if (!navigator.locks) return true;
  const { held } = await navigator.locks.query();
  return !!held?.some((lock) => lock.name === GAME_PAGE_LOCK);
}

/** Moves to a waiting new version and reloads, once nothing would be interrupted: only the landing page may. */
export function updateWhenIdle(busy: () => boolean) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let controlled = !!sw.controller;
  let reload = false;
  // the first install's taking control of this page changes nothing it runs
  sw.addEventListener("controllerchange", () => {
    reload = controlled;
    controlled = true;
  });
  sw.register(SCRIPT)
    .then((registration) => {
      let checks = 0;
      setInterval(async () => {
        if (!busy()) {
          if (reload) location.reload();
          else if (registration.waiting && !(await gamePageOpen())) {
            registration.waiting.postMessage("activate");
            document.documentElement.dataset.updateAsked = "true";
          }
        }
        document.documentElement.dataset.updateChecks = String(++checks);
      }, RETRY_MS);
    })
    .catch((e) => console.warn("offline support unavailable", e));
}
