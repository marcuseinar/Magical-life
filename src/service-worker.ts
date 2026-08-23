/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { base, build, files, prerendered, version } from '$service-worker';

/*
 * Offline is a requirement, not a nicety: game shops have bad signal, and a life
 * counter that needs the network is useless at the table.
 *
 * The whole app is precached on install. It is a few tens of kilobytes, so
 * there is no cleverness worth having here.
 */
const self = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE = `magical-life-${version}`;
const PRECACHED = [...build, ...files, ...prerendered];

/** The app shell every navigation is served from. `adapter-static` writes the
 *  fallback under both of these names depending on how the host serves it. */
const SHELL = [`${base}/`, `${base}/index.html`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        /*
         * One entry at a time, tolerating failures. `cache.addAll` is atomic: a
         * single 404 — a dotfile the host refuses to serve, say — rejects the
         * whole call, install fails, and the app silently loses offline support
         * altogether. Losing one asset is much better than losing all of them,
         * and the fetch handler falls back to the network regardless.
         */
        await Promise.all(
          [...PRECACHED, ...SHELL].map((url) => cache.add(url).catch(() => undefined))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const shellFrom = async (cache: Cache) => {
    for (const url of SHELL) {
      const match = await cache.match(url);
      if (match) return match;
    }
    return undefined;
  };

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const url = new URL(event.request.url);

      /*
       * Every navigation is the same single-page shell, so serve it from the
       * cache without asking the network. This is what makes the app open at a
       * table with no signal, and it is checked by an end-to-end test.
       */
      if (event.request.mode === 'navigate') {
        return (await shellFrom(cache)) ?? (await fetch(event.request));
      }

      // Immutable build assets can never change under a given version.
      const precached = await cache.match(url.pathname);
      if (precached) return precached;

      try {
        const response = await fetch(event.request);
        if (response.ok && url.origin === self.location.origin) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const shell = await shellFrom(cache);
        if (shell) return shell;
        throw new Error('offline and not cached');
      }
    })()
  );
});
