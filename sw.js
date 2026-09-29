// Service worker voor Mijn Bots.
// - App-bestanden: cache-first (verhoog VERSION na elke wijziging aan HTML/JS/CSS/iconen).
// - data.json: network-first (altijd nieuwste updates), bij offline de laatst opgeslagen versie.
const VERSION = "v3";
const SHELL_CACHE = "mijnbots-shell-" + VERSION;
const DATA_CACHE = "mijnbots-data";
const SHELL = [
  "./", "index.html", "style.css", "config.js", "md.js", "app.js", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("mijnbots-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data.json")) {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(new URL("data.json", self.registration.scope).href, copy));
          }
          return res;
        })
        .catch(() =>
          caches.open(DATA_CACHE).then((c) => c.match(new URL("data.json", self.registration.scope).href)).then(
            (hit) => hit || new Response(JSON.stringify({ offline: true, bots: [] }), { headers: { "Content-Type": "application/json" } })
          )
        )
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
    })
  );
});
