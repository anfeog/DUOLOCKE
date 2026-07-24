/* Service worker de Duolocke Z Jalmeida.
   - Codigo (HTML/JS/CSS) y API: red primero -> siempre ves la version al dia.
   - Assets pesados (sprites, audio, pokedex): cache primero -> carga instantanea offline.
   Sube CACHE_VERSION al cambiar esta estrategia para forzar limpieza. */

const CACHE_VERSION = 'duolocke-v1';

const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'assets/data/pokemon.json',
  'assets/sprites/ball.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCode(url) {
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fuentes u otros origenes: sin tocar

  // API y health: siempre red, sin cachear.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    return; // deja pasar a la red normal
  }

  // Navegaciones y codigo: red primero, cache como respaldo offline.
  if (request.mode === 'navigate' || isCode(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./')))
    );
    return;
  }

  // Resto (sprites, audio, json, iconos): cache primero.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
      return res;
    }))
  );
});
