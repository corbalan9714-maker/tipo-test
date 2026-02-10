const CACHE_NAME = "tipo-test-cache-v1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./editor.html",
  "./test.html",
  "./app.js",
  "./editor.js",
  "./test.js",
  "./firebase.js",
  "./styles.css",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        FILES_TO_CACHE.map(url =>
          cache.add(url).catch(() => {
            console.warn("No se pudo cachear:", url);
          })
        )
      );
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});