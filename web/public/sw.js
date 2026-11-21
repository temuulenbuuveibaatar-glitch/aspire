// Aspire service worker: reminder notifications while the app is closed, and an offline page.
// - push: shows the reminder (title, body, tag) the server sent; nothing else is read from it.
// - notificationclick: focuses an open Aspire tab, else opens "/" (never a URL from the message).
// - fetch: only same-origin GETs. Hashed build files (/_next/static/) cache-first; page loads go to
//   the network and fall back to a static offline page. Pages, /api/*, sign-in and anything
//   cross-origin are never cached, so nothing personal is kept after signing out.
const VERSION = "v1";
const STATIC = `aspire-static-${VERSION}`;
const OFFLINE = `aspire-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_STATIC = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE).then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("aspire-") && n !== STATIC && n !== OFFLINE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200 && res.type === "basic") {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function pageOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL, { cacheName: OFFLINE })) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(req));
  else if (req.mode === "navigate") event.respondWith(pageOrOffline(req));
});

const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = text(data.title, 60) || "Aspire";
  const body = text(data.body, 500);
  const tag = text(data.tag, 64) || "aspire";
  event.waitUntil(self.registration.showNotification(title, { body, tag, renotify: true, requireInteraction: true, icon: "/favicon.ico" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});
