const CACHE_NAME = 'drone-log-v1';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './icon.png',
  './manifest.json'
];

const urlsToCache = ['./', './index.html', './app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
