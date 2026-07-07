/* v3 service worker — offline keširanje. Podigni broj verzije pri svakoj izmeni;
   stari keš se briše, PODACI u localStorage ostaju netaknuti.
   KRITIČNO (nauk iz stvarnog buga): index.html i engine.js su NETWORK-FIRST —
   uvek se prvo pokuša mreža, keš je samo offline-fallback. Ranije je engine.js
   bio cache-first (dole, generička grana) — jednom keširan, NIKAD se nije
   ponovo preuzimao sa mreže dok se CACHE broj ručno ne podigne. Dve uzastopne
   ispravke u engine.js zato nikad nisu stigle do korisnikovog browsera. */
const CACHE = 'sub19v3-cache-v5';
const ASSETS = ['./', './index.html', './engine.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const NETWORK_FIRST = ['./index.html', './engine.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
function isNetworkFirst(req){
  if(req.mode === 'navigate') return true;
  const path = new URL(req.url).pathname;
  return NETWORK_FIRST.some(a => path.endsWith(a.replace('./','/')));
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (isNetworkFirst(e.request)) {
    const cacheKey = e.request.mode === 'navigate' ? './index.html' : e.request;
    e.respondWith(
      fetch(e.request)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(cacheKey, cp)); return r; })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return r;
    }))
  );
});
