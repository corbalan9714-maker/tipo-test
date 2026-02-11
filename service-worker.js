const CACHE_NAME = "test-app-v1";

// Archivos básicos de la app
const APP_SHELL = [
  "./",
  "./index.html",
  "./test.html",
  "./editor.html",
  "./app.js",
  "./test.js",
  "./editor.js",
  "./firebase.js",
  "./manifest.json",
  "./spiderman.gif",
  "./fanfare_tv.wav",
  "./favicon.ico"
];

// Instalación: guarda archivos esenciales
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// Activación: elimina cachés antiguos
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

// Estrategia: red primero, caché como respaldo
self.addEventListener("fetch", event => {
  // Solo cachear peticiones GET (evita errores con Firebase POST/PUT)
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Solo cachear respuestas completas (status 200)
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});