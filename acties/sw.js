// Service worker voor App Acties Michael (scope /mijn-bots/acties/). Verhoog VERSION samen met ../sw.js.
// - App-bestanden: cache-first (verhoog VERSION na elke wijziging aan HTML/JS/CSS/iconen).
// - data.json: network-first (altijd nieuwste updates), bij offline de laatst opgeslagen versie.
const VERSION = "v16";
const SHELL_CACHE = "acties-shell-" + VERSION;
const DATA_CACHE = "mijnbots-data";
const SHELL = [
  "./", "index.html", "../style.css", "../onderzoek/onderzoek.css", "acties.css", "../config.js", "../md.js", "../app.js", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("acties-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)))
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
            caches.open(DATA_CACHE).then((c) => c.put(new URL("../data.json", self.registration.scope).href, copy));
          }
          return res;
        })
        .catch(() =>
          caches.open(DATA_CACHE).then((c) => c.match(new URL("../data.json", self.registration.scope).href)).then(
            (hit) => hit || new Response(JSON.stringify({ offline: true, bots: [] }), { headers: { "Content-Type": "application/json" } })
          )
        )
    );
    return;
  }

  // Pagina zelf (HTML): network-first, zodat een nieuwe versie direct binnenkomt.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL_CACHE).then((x) => x.put("index.html", c)); } return res; })
        .catch(() => caches.match("index.html").then((h) => h || caches.match("./")))
    );
    return;
  }

  // App-bestanden: network-first (nieuwe versie komt direct binnen), offline uit de EIGEN cache.
  // Bewust niet caches.match() over alle caches: dat kon een oude app.js uit de cache van een andere app teruggeven.
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL_CACHE).then((x) => x.put(req, c)); } return res; })
      .catch(() => caches.open(SHELL_CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || Response.error()))
  );
});
