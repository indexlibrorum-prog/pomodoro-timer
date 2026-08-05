// オフラインでも起動できるようにする最小構成のサービスワーカー
const CACHE = 'awapomo-v3';
const ASSETS = [
  './', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './audio/rain.wav', './audio/fan.wav', './audio/waves.wav', './audio/train.wav', './audio/fire.wav'
];
// バーコード読み取り用。重いので失敗してもインストールは止めない
const OPTIONAL = ['./vendor/zxing-reader.js', './vendor/zxing_reader.wasm'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).then(() =>
        Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先・失敗したらキャッシュ（更新をすぐ拾いつつオフラインでも動く）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
