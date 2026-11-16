// Service worker voor Energieprijs (scope /mijn-bots/energieprijs/).
// App-bestanden: network-first, offline uit de eigen cache. Verhoog VERSION na een wijziging.
const VERSION = "v1";
const SHELL_CACHE = "energieprijs-shell-" + VERSION;
const SHELL = [
  "./", "index.html", "style.css", "logic.js", "app.js", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("energieprijs-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL_CACHE).then((x) => x.put("index.html", c)); } return res; })
        .catch(() => caches.match("index.html").then((h) => h || caches.match("./")))
    );
    return;
  }

  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL_CACHE).then((x) => x.put(req, c)); } return res; })
      .catch(() => caches.open(SHELL_CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || Response.error()))
  );
});
