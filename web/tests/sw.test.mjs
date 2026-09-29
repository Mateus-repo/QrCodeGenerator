/**
 * A lista de recursos do service worker tem de bater com os ficheiros que existem.
 *
 *     node --test web/tests/sw.test.mjs
 *
 * A lista de recursos do `sw.js` é **manual**, e o comentário dela diz que devia
 * haver um teste. Este é esse teste, e ele existe por causa de uma falha concreta:
 * o `datamatrix.js` e o `gs1-datamatrix.js` entraram no repositorio e o site
 * funcionava perfeitamente com rede — e **não funcionava sem ela**. Os `import`
 * não estão em `RECURSOS`, o `cache.add` nunca os guardava, e o site servia a
 * versão em cache do `app.js` a quem não tinha rede, o qual tentava importar
 * módulos que não estavam lá. Nenhum erro, nenhuma exceção: metade do site em
 * branco, offline.
 *
 * **É o pior género de falha**, porque desaparece quando se tem rede. Por isso
 * está aqui.
 *
 * O que se verifica, nos dois sentidos:
 *
 *  - **todo** ficheiro do repositório que o browser pode importar está na lista;
 *  - **nada** está na lista sem existir, que daria um `cache.add` que falha
 *    — o `install` engole o erro de propósito, para que um recurso em falta
 *    não impeça os restantes, e por isso o erro nunca aparece.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(join(RAIZ, 'sw.js'), 'utf8');

/**
 * Os caminhos de RECURSOS, **só da lista** e não de todo o ficheiro.
 *
 * A primeira versão despejava o `sw.js` inteiro e o teste apanhou três
 * "repetidos" que não eram: `./index.html`, `./symbologies/gs1-128.js` e
 * `./symbologies/gs1-tabelas.js` aparecem **duas vezes** no ficheiro, uma na
 * lista e outra no comentário que a precede. Passar a ler só o bloco de
 * `RECURSOS` é o que resolve, e é mais exacto do que um filtro.
 *
 * O bloco é o que está entre `const RECURSOS = [` e o `];` a seguir. Se um dia a
 * lista mudar de forma, este teste diz que não encontrou nada em vez de passar
 * a vazio — que é o que a asserção logo a seguir apanha.
 */
const RECURSOS = (() => {
  const bloco = SW.match(/const RECURSOS = \[([\s\S]*?)\];/);
  if (!bloco) return [];
  return [...bloco[1].matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
})();

test('a lista de recursos não está vazia e não tem repetidos', () => {
  assert.ok(RECURSOS.length > 0, 'não extraí nada da lista de recursos');

  const repetidos = RECURSOS.filter((r, i) => RECURSOS.indexOf(r) !== i);
  assert.deepEqual(
    [...new Set(repetidos)],
    [],
    'recursos repetidos na lista do service worker',
  );
});

test('tudo o que está na lista existe em disco', () => {
  /*
   * O `install` do sw.js engole o erro de cada `cache.add` de propósito:
   *
   *   `RECURSOS.map((url) => cache.add(url).catch(() => {}))`
   *
   * para que um recurso em falta não impeça os outros de ficar em cache. A
   * contrapartida é que **um caminho errado não dá erro nenhum** — o site
   * instala, fica em cache o que pode, e o que faltou só se descobre quando se
   * vai usar, offline. Por isso o caminho é verificado aqui, e não lá dentro.
   */
  const emFalta = RECURSOS.filter((recurso) => {
    if (recurso === './') return existsSync(join(RAIZ, 'index.html'));
    return !existsSync(join(RAIZ, recurso.slice(2)));
  });

  assert.deepEqual(
    emFalta,
    [],
    'recursos na lista que não existem em disco — o cache.add falha em silêncio',
  );
});

test('todos os módulos que se importam estão na lista', () => {
  /*
   * **O teste que faltava**, e o que teria apanhado o `datamatrix.js` e o
   * `gs1-datamatrix.js` a tempo.
   *
   * Percorre os `.js` do repositório, lê cada `import ... from './x.js'` e
   * `./x/y.js`, e verifica que o caminho está na lista. É a direcção que importa:
   * ir dos ficheiros para a lista, e não da lista para os ficheiros. Uma lista
   * só se prova comparando-a com aquilo que é, e não com aquilo que ela própria
   * diz.
   *
   * A lista a percorrer é a mesma que o `bundle.mjs` usa, mais o `app.js` — e o
   * `themes.js`, que também é importado e que estava na lista desde o princípio.
   */
  const raizes = ['app.js', 'themes.js'];

  const modulos = new Set();
  for (const raiz of raizes) {
    modulos.add(raiz);
    recolher(join(RAIZ, raiz), modulos);
  }

  const semNaLista = [...modulos]
    .map((m) => `./${m}`)
    .filter((m) => !RECURSOS.includes(m));

  assert.deepEqual(
    semNaLista.sort(),
    [],
    'módulos importados e não posto na lista de recursos do service worker — ' +
      'o site funciona com rede e não funciona sem ela',
  );
});

test('a lista tem o CSS, o manifest e o ícone, e não só o JavaScript', () => {
  /*
   * O `import` só apanha o JavaScript, e o resto da lista tem de estar lá por
   * decisão e não por ter sido esquecido. Um site sem o CSS funciona e parece
   * errado — e num service worker, sem o manifest, não se instala.
   */
  for (const essencial of ['./styles.css', './manifest.json']) {
    assert.ok(RECURSOS.includes(essencial), `falta ${essencial} na lista de recursos`);
  }

  assert.ok(
    RECURSOS.some((r) => r.startsWith('./assets/')),
    'falta o ícone na lista de recursos',
  );
});

test('a versão do cache mudou, e é o que apaga a versão antiga', () => {
  /*
   * O nome do cache é `qrcode-v${VERSAO}`, e é a **única** coisa que faz o
   * `activate` apagar a versão anterior. Sem mudar a versão, o `activate` apaga
   * cache nenhum e toda a gente fica com a versão antiga para sempre — que é o
   * bug que o `sw.js` já teve.
   *
   * Este teste não apanha a falha: só confirma que a constante existe e que o
   * cache novo tem um nome diferente dos antigos. A versão em si é uma decisão.
   */
  assert.match(SW, /const VERSAO = 'v\d+'/, 'a versão do cache tem de existir e ser mudada à mão');

  const versao = SW.match(/const VERSAO = 'v(\d+)'/)[1];
  const nome = `qrcode-v${versao}`;
  assert.ok(
    !RECURSOS.some((r) => r.includes(nome)),
    'o nome do cache não pode aparecer na lista de recursos',
  );
});

/**
 * Os `import` relativos de um módulo, acrescentados a `modulos`.
 *
 * O caminho guardado é **relativo à raiz do repositório e sem `./`**, porque é
 * assim que a lista de recursos o escreve. A primeira versão acrescentava `./`
 * ao juntar e outra vez ao comparar, e o teste falhava com `././app.js` - a
 * mesma lista, comparada consigo mesma, com um `./` a mais de cada lado.
 */
function recolher(caminho, modulos) {
  const texto = readFileSync(caminho, 'utf8');

  for (const achado of texto.matchAll(/from\s+'(\.[^']+)'/g)) {
    const alvo = join(dirname(caminho), achado[1]);
    if (!alvo.endsWith('.js') || !existsSync(alvo)) continue;

    // `resolve` normaliza os `../` e os separadores, e o que fica de fora é o
    // caminho a partir da raiz - que é como a lista de recursos escreve.
    const relativo = resolve(alvo).slice(RAIZ.length + 1).split('\\').join('/');
    if (modulos.has(relativo)) continue;

    modulos.add(relativo);
    recolher(alvo, modulos);
  }
}
