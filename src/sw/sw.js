// Service worker for offline play. The build prepends PRECACHE (every file
// the game needs, relative to this script) and VERSION (a hash of them).
/* global PRECACHE, VERSION */

const CACHE = `nethack-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: "reload" })))),
  );
});

// a new version waits for the landing page to ask, so that it never takes over from a game in progress
self.addEventListener("message", (event) => {
  if (event.data === "activate") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nethack-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreSearch: the page may be opened with a query string. ignoreVary: servers may
      // send Vary: Origin, and the precache requests had no Origin but crossorigin ones do
      const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        // not index.html: hosts that redirect it to the directory would cache a redirect, which a navigation can't take
        const page = await cache.match(/\/play\/?$/.test(new URL(request.url).pathname) ? "./play/" : "./");
        if (page) return page;
      }
      return fetch(request);
    }),
  );
});
