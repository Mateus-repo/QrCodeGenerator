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
 *
 * ## E' por isso que o numero tem de subir a cada alteracao
 *
 * O `activate` so apaga os caches velhos quando o `sw.js` **muda**, porque e' o
 * navegador que decide se ha um service worker novo pela leitura do ficheiro.
 * **Mexer em `app.js`, `qrcode.js` ou `frameqr.js` nao muda o `sw.js`, e por isso
 * nao chega para nada.**
 *
 * **Aconteceu outra vez com o logotipo do FieldQR.** O `app.js` passou a chamar
 * `desenharLogotipo` com `offset` em vez de `margem`, e o site continuou a
 * mostrar o logotipo 4 modulos ao lado porque o `fetch`respondia com o
 * `app.js` do cache — que e' a estrategia "cache primeiro". O servidor servia a
 * versao certa e o browser servia a de antes, e o unico sintoma era o desenho
 * torto: o encoder estava certo, a correccao de erros estava certa, e o codigo
 * lia-se na mesma.
 *
 * **Reparar obriga a limpar a cache a mao, e ninguem o faz.** Por isso que
 * qualquer alteracao a um ficheiro da lista `RECURSOS` tem de vir com este
 * numero alterado — e e' o que o `tests/sw.test.mjs` nao pode apanhar,
 * porque o numero nao tem relacao com o conteudo dos ficheiros.
 */
const VERSAO = 'v3';
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
  './sqrc.js',
  './datamatrix.js',
  './themes.js',
  './payloads/types.js',
  './payloads/pix.js',
  './payloads/text.js',
  './payloads/normalize.js',
  './symbologies/index.js',
  './symbologies/linear.js',
  './symbologies/upcean.js',
  './symbologies/code128.js',
  './symbologies/code39.js',
  './symbologies/code93.js',
  './symbologies/code93-tabelas.js',
  './symbologies/itf.js',
  './symbologies/codabar.js',
  './symbologies/pdf417.js',
  './symbologies/pdf417-tabelas.js',
  './symbologies/datamatrix.js',
  './symbologies/datamatrix-tabelas.js',
  './symbologies/gs1-128.js',
  './symbologies/gs1-datamatrix.js',
  './symbologies/gs1-tabelas.js',
  './manifest.json',
  './assets/icon.svg',
];

/*
 * **Por que esta lista e' manual e nao gerada, apesar de se poder gerar.**
 *
 * A lista de ficheiros que o site usa pode ser percorrida a partir do disco -
 * ha uma ferramenta para isso, e seria uma linha de codigo. Nao esta aqui, por
 * duas razoes que valem mais do que a linha:
 *
 *  1. **O service worker nao tem como se auto-verificar.** Ele corre no browser,
 *     sem acesso a disco. A unica verificacao possivel dentro dele e' contra a
 *     lista que ele proprio tem, e essa nao prova nada.
 *  2. **Uma lista gerada dentro do proprio ficheiro que tem de a ler e' circular.**
 *     Se a lista fosse construida a partir de si, o servico nunca notaria a falta
 *     de um modulo: so notaria a falta de um modulo que a lista gerada dissesse
 *     que la esta.
 *
 * **A verificacao esta no `tests/sw.test.mjs`**, que le o disco em Node e compara
 * com esta lista - e compara nos dois sentidos, para apanhar tambem um caminho
 * que nao existe, cujo `cache.add` falha em silencio. Ja apanhou dois ficheiros
 * postos duas vezes e um `themes.js` que nunca esteve na lista.
 *
 * A lista e' curta e muda duas vezes por ano, e quem a escreve sabe o que esta a
 * escrever. O teste e' que a torna verificada em vez de correcta por atencao.
 */

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
