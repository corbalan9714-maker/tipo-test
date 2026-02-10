const CACHE_NAME = "tipo-test-cache-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/editor.html",
  "/test.html",
  "/app.js",
  "/editor.js",
  "/test.js",
  "/firebase.js"
];

// Instalar
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activar
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Interceptar peticiones
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});