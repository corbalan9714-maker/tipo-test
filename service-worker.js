const CACHE_NAME = "tipo-test-cache-v2";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./editor.html",
  "./test.html",
  "./app.js",
  "./editor.js",
  "./test.js",
  "./firebase.js",
  "./manifest.json",
  "./spiderman.gif",
  "./fanfare_tv.wav"
];

// Instalación
self.addEventListener("install", event => {
  self.skipWaiting();
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

// Activación: elimina cachés antiguas
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Estrategia de caché: primero caché, luego red
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});