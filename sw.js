/*
 * Service Worker：讓 app 沒有網路時也能打開
 * 有網路時一律抓最新版（同時更新快取）；沒網路時改用快取。
 * 只處理自己網站的檔案，Supabase 等外部連線不經過這裡。
 */
var CACHE = 'luggage-app-v1';
var ASSETS = [
  './', 'index.html', 'style.css', 'weights.js', 'photos.js', 'clothing.js', 'app.js',
  'closet.js', 'trips.js', 'organize.js', 'backup.js', 'cloud.js', 'vendor/supabase.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
