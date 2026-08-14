const CACHE = "budget-app-v1";
const FICHIERS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./app/main.js",
  "./app/db.js",
  "./app/drive.js",
  "./app/storage.js",
  "./config.js",
  "./vendor/sql-wasm.js",
  "./vendor/sql-wasm.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FICHIERS)).catch(() => {
      // config.js peut ne pas exister avant la première configuration ; pas bloquant
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Ne jamais mettre en cache les appels à l'API Google (toujours besoin du réseau)
  if (event.request.url.includes("googleapis.com") || event.request.url.includes("google.com")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((reponse) => reponse || fetch(event.request))
  );
});
