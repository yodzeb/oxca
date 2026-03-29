const CACHE_NAME = 'xc-analyzer-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './core/config.js',
  './core/geo.js',
  './core/igc-parser.js',
  './core/flight-enricher.js',
  './core/flight-store.js',
  './core/module-registry.js',
  './core/chart-theme.js',
  './core/helpers.js',
  './core/app.js',
  './modules/mod-overview.js',
  './modules/mod-vario.js',
  './modules/mod-wind.js',
  './modules/mod-phases.js',
  './modules/mod-record.js',
  './modules/mod-mccready.js',
];

// CDN assets cached on first use
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache CDN assets and tile requests on first fetch
        if (response.ok && (
          CDN_ASSETS.some(url => event.request.url.startsWith(url)) ||
          event.request.url.includes('fonts.gstatic.com')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
