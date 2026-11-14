/* App shell + bounded cache of visited NASA tiles. Scientific files are cached verbatim. */
'use strict';
var SHELL = 'ares-shell-v1';
var TILES = 'ares-tiles-v1';
var TILE_LIMIT = 240;
var FILES = [
  './', 'index.html', 'css/styles.css', 'assets/vendor/leaflet.css', 'assets/vendor/leaflet.js',
  'js/config.js', 'js/geo.js', 'js/roverTraverse.js', 'js/marsData.js', 'js/planner.js',
  'js/nasaApi.js', 'js/offlineAssets.js', 'js/crewRouter.js', 'js/speechNotes.js',
  'js/sampleLog.js', 'js/app.js', 'assets/vendor/images/layers.png',
  'assets/vendor/images/layers-2x.png', 'assets/vendor/images/marker-icon.png',
  'assets/vendor/images/marker-icon-2x.png', 'assets/vendor/images/marker-shadow.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL).then(function (cache) { return cache.addAll(FILES); })
    .then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return /^ares-(shell|tiles)-/.test(key) && key !== SHELL && key !== TILES;
    }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

// Queue cache writes so concurrent tile loads cannot outrun the size bound.
var writes = Promise.resolve();
function saveTile(request, response) {
  writes = writes.catch(function () {}).then(async function () {
    var cache = await caches.open(TILES);
    await cache.put(request, response);
    var keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - TILE_LIMIT)).map(function (key) {
      return cache.delete(key);
    }));
  });
  return writes;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  var tile = url.hostname === 'trek.nasa.gov' && url.pathname.indexOf('/tiles/Mars/EQ/') === 0;
  if (tile) {
    // Opaque cross-origin image responses are cacheable but cannot be inspected.
    event.respondWith((async function () {
      var saved;
      try { saved = await (await caches.open(TILES)).match(request); } catch (error) { /* still try network */ }
      if (saved) return saved;
      var response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        try { await saveTile(request, response.clone()); } catch (error) { /* serve online even if storage is full */ }
      }
      return response;
    })());
    return;
  }
  var asset = FILES.some(function (file) { return new URL(file, self.registration.scope).href === url.href; });
  if (url.origin === self.location.origin && (asset || request.mode === 'navigate')) {
    event.respondWith((async function () {
      var cache;
      try { cache = await caches.open(SHELL); } catch (error) { return fetch(request); }
      try {
        var response = await fetch(request);
        if (!response.ok) throw new Error('Asset unavailable');
        try { await cache.put(request, response.clone()); } catch (error) { /* quota does not break online use */ }
        return response;
      } catch (error) {
        var saved = await cache.match(request);
        if (!saved && request.mode === 'navigate') saved = await cache.match(new URL('index.html', self.registration.scope));
        return saved || Response.error();
      }
    })());
  }
  // Live weather, radiation notifications and geology are never replayed as fresh readings.
});
