/*
   VAULT - Service Worker
   sw.js
   Caches all app files so Vault works fully offline.
 */

var CACHE_NAME = 'neural-cache-v4';

// Every file the app needs to run
var FILES_TO_CACHE = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './supabase.js',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache all files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: remove any old caches from previous versions
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});
