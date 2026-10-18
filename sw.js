// sw.js - the service worker.
//
// It keeps a copy of the game's files on the phone so SPIRE opens instantly and
// works with no signal. Strategy: "stale-while-revalidate" - answer from the
// saved copy right away, and quietly fetch a fresh copy for next time.
// Browsers only allow service workers over https (or localhost).

const CACHE = 'spire-v11';
const CORE = [
  './', './index.html', './manifest.json', './config.js', './catalog.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './src/main.js',
  './src/audio/audio.js',
  './src/data/facilities.js', './src/data/format.js', './src/data/people.js',
  './src/render/ambient.js', './src/render/detail.js', './src/render/rooms.js', './src/render/poses.js', './src/render/color.js', './src/render/elevators.js', './src/render/facilities.js',
  './src/render/figures.js', './src/render/overlays.js', './src/render/palette.js', './src/render/particles.js',
  './src/render/sky.js', './src/render/tenants.js', './src/render/weather.js', './src/render/world.js',
  './src/sim/clock.js', './src/sim/connectivity.js', './src/sim/diagnostics.js', './src/sim/districts.js',
  './src/sim/economy.js', './src/sim/elevators.js', './src/sim/game.js', './src/sim/incidents.js',
  './src/sim/loop.js', './src/sim/modes.js', './src/sim/needs.js', './src/sim/career.js', './src/sim/progress.js', './src/sim/routing.js', './src/sim/save.js',
  './src/sim/services.js', './src/sim/sfx.js', './src/sim/shafts.js', './src/sim/stories.js',
  './src/sim/tenants.js', './src/sim/tower.js', './src/sim/weather.js',
  './src/ui/alerts.js', './src/ui/haptics.js', './src/ui/hud.js', './src/ui/infopanel.js', './src/ui/input.js',
  './src/ui/modals.js', './src/ui/settings.js', './src/ui/story.js', './src/ui/toolbar.js', './src/ui/tutorial.js', './src/ui/title.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(event.request);
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => saved);
      return saved || fresh;
    }),
  );
});
