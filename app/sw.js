// app/sw.js
const CACHE_NAME = 'flip7-assistant-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './app.mjs',
  './deck.mjs',
  './shoe.mjs',
  './line.mjs',
  './round.mjs',
  './engine.mjs',
  './storage.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
