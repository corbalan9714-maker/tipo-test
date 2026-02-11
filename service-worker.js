const CACHE_NAME = "tipo-test-cache-v3";

const FILES_TO_CACHE = [
  "./",
  "index.html",
  "test.html",
  "editor.html",
  "app.js",
  "test.js",
  "editor.js",
  "firebase.js",
  "manifest.json",
  "spiderman.gif",
  "fanfare_tv.wav"
];

// Instalación
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// Activación
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de caché: network first (segura)
self.addEventListener("fetch", event => {
  // Solo manejar peticiones GET del mismo origen
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Solo cachear respuestas válidas del mismo origen
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});