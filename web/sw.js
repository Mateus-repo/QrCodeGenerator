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

/*
 * O nome do cache leva a versao do service worker, nao um numero que se aumenta
 * a mao.
 *
 * **Isto era um bug, e nao era dos pequenos.** Com um nome fixo, a estrategia
 * "cache primeiro" servia para sempre a versao antiga de `./app.js` e de tudo o
 * que ele importa: limpar o cache a mao resolvia, ate o proximo utilizador abrir
 * o site e levar a versao de ontem. Foi o que aconteceu com o GS1-128 - o
 * encoder estava no disco, o registo tinha a entrada nova, o servidor servia a
 * versao certa, e a aplicacao dizia "Formato desconhecido" porque tinha em
 * memoria o `index.js` de antes.
 *
 * Um utilizador que abre o site, ve um formato novo no repositorio e recarrega a
 * pagina **nao ve o formato novo**. Sem sintoma, sem erro, e sem forma de se
 * livrar disso a nao ser por limpeza manual do cache do browser.
 *
 * A correccao e' o padrao de "cache com versao": Whenever o `sw.js` muda, a
 * versao muda com ele, o `activate` apaga os caches velhos, e toda a gente
 * recebe a versao nova no primeiro carregamento.
 *
 * **Quando mudar este numero, mudar a estrategia tambem.** Nao chega.
 */
const VERSAO = 'v2';
const CACHE = `qrcode-${VERSAO}`;

/**
 * Os ficheiros que se guardam para o site funcionar sem rede.
 *
 * **A lista e' explicita e nao pode ficar incompleta.** Os ficheiros nao listados
 * nao sao postas em cache, o que significa que o site **nao funciona offline**
 * sem eles - e o que acontece com um ficheiro novo que ninguem se lembre de
 * acrescentar aqui.
 *
 * A alternativa - cachear o que for pedido a primeira vez - seria mais facil e
 * apagaria o bug do `app.js` em versao antiga, porque o `activate` ja apaga
 * tudo. Ficou a lista explicita porque um site que se instala precisa de dizer o
 * que tem, e porque uma lista implicita esconde o que falta.
 *
 * **Quando acrescentar um modulo novo, acrescentar aqui.** O `formatos.test.mjs`
 * nao apanha este: ele ve se o HTML e o registo batem, e nao se o site funciona
 * sem rede.
 */
const RECURSOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './qrcode.js',
  './frameqr.js',
  './payloads/types.js',
  './payloads/pix.js',
  './payloads/text.js',
  './payloads/normalize.js',
  './symbologies/index.js',
  './symbologies/upcean.js',
  './symbologies/code128.js',
  './symbologies/gs1-128.js',
  './symbologies/gs1-tabelas.js',
  './symbologies/code39.js',
  './symbologies/itf.js',
  './symbologies/codabar.js',
  './symbologies/linear.js',
  './symbologies/pdf417.js',
  './symbologies/pdf417-tabelas.js',
  './symbologies/datamatrix.js',
  './symbologies/datamatrix-tabelas.js',
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
