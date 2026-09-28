/**
 * Service worker: cache do site para funcionar offline e ser instalável.
 *
 * Estratégia deliberadamente simples, porque o site tem poucos ficheiros:
 *  - navegação → rede primeiro, cache como recurso (para não servir uma
 *    versão antiga depois de uma atualização);
 *  - ficheiros estáticos → cache primeiro, rede em segundo plano.
 *
 * Só se regista em http/https. Aberto de `file://` não há service worker e o
 * site funciona na mesma, só sem offline.
 */

const CACHE = 'qrcode-v1';

const RECURSOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './qrcode.js',
  './payloads/types.js',
  './payloads/pix.js',
  './payloads/text.js',
  './payloads/normalize.js',
  './manifest.json',
  './assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` falha tudo se um recurso falhar; melhor registar um a um.
      .then((cache) => Promise.all(RECURSOS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const pedido = event.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    event.respondWith(
      fetch(pedido)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
          return resposta;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(pedido).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido).then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return resposta;
      });
    }),
  );
});
