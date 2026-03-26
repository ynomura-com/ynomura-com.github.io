const CACHE_NAME = 'dji-flight-log-v1';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './'
];

// インストール時
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(err => {
          console.log('キャッシュ追加エラー:', err);
        });
      })
  );
  self.skipWaiting();
});

// アクティベート時
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// フェッチ時
self.addEventListener('fetch', event => {
  // GETリクエストのみ処理
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにあればそれを返す
        if (response) {
          return response;
        }

        // キャッシュにないならネットワークから取得
        return fetch(event.request)
          .then(response => {
            // ネットワークエラーの場合は処理しない
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをキャッシュに追加
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // オフラインの場合はキャッシュから返す
            return caches.match(event.request);
          });
      })
  );
});
