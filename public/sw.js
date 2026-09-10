/* VIBIN service worker.
 *
 * Network-first for EVERYTHING. The bundle is content-hashed and Cloudflare
 * edge-caches it globally, so network-first is fast and — unlike the old
 * cache-first `/assets/` rule — can never pin a visitor to a stale build.
 * The cache is offline insurance only.
 *
 * Bumping CACHE forces `activate` to delete every older cache (incl. the old
 * `vibin-v1`), so shipping this file self-heals anyone stuck on the old one.
 */
const CACHE = "vibin-v2";
const OFFLINE_SHELL = "/";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_SHELL)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith("/api/")) return; // never touch the API

  e.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        // Cache successful basic responses for offline fallback.
        if (fresh && fresh.ok && fresh.type === "basic") {
          const copy = fresh.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match(OFFLINE_SHELL);
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});

/* Lets the page trigger an immediate update after a new deploy if it wants to. */
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
