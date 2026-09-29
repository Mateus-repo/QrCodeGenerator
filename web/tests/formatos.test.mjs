/**
 * A lista de formatos do HTML e o registo de simbologias tem de bater.
 *
 *     node --test web/tests/formatos.test.mjs
 *
 * **Este teste existe por causa de uma falha que quase entrou.** O GS1-128 foi
 * acrescentado ao registo de `symbologies/index.js` - com o encoder, a validacao
 * e a altura da barra - e ficou a funcionar em todos os testes, incluindo os oito
 * casos lidos pelo ZXing. E nao aparecia no selector da aplicacao, porque o
 * `<option>` vivia no `index.html` e o registo vivia no modulo: **duas listas do
 * mesmo conjunto**, e nada as ligava.
 *
 * O que se descobre e' pior do que um item em falta. Um `<option>` sem entrada no
 * registo da em `simbologiaPorId` devolve `null` e a aplicacao rebenta ao
 * desenhar; e uma entrada no registo sem `<option>` e' invisivel - um encoder
 * escrito, testado e verificado por leitor independente, que ninguem consegue
 * escolher. Por isso este teste vai nos dois sentidos.
 *
 * A mesma razao prende o `themes.test.mjs` a lista de tipos: **duas listas do
 * mesmo conjunto divergem, e divergem em silencio**, porque nenhuma das duas
 * falha por estar errada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIMBOLOGIAS, simbologiaPorId } from '../symbologies/index.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/**
 * Os `value` de todos os `<option>` **do selector de formato**, pela ordem.
 *
 * O selector e' recortado do HTML antes de se procurar os `<option>`, porque a
 * pagina tem mais do que um selector: o do nivel de correccao de erros tambem
 * usa `<option value="...">`, e os seus valores sao `L`, `M`, `Q`, `H` e os
 * nove do PDF417. A primeira versao deste teste pegava neles todos e falhava a
 * dizer que `L` e `M` estavam no selector e nao no registo - o que e' verdade e
 * nao e' um problema.
 *
 * Recortar o elemento e' melhor do que filtrar os valores a posteriori: um
 * filtro de exclusao e' uma lista implicita do que nao conta, e o proximo
 * `<option>` novo que aparecer num selector que nao e' o de formato passa a
 * contar sem ninguem decidir que conta.
 */
const SELECTOR = HTML.slice(
  HTML.indexOf('id="formato"'),
  HTML.indexOf('</select>', HTML.indexOf('id="formato"')),
);

const DO_HTML = [...SELECTOR.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

/**
 * Os formatos que vivem no selector mas **nao** no registo dos lineares.
 *
 * O QR, o PDF417 e os dois Data Matrix estao no selector e noutro caminho da
 * aplicacao, por desenho: os lineares tem validacao e desenho proprios, e um
 * codigo 1D nao se desenha como uma grelha 2D. A primeira versao deste teste so
 * excluia o QR e o PDF417, e quando os Data Matrix entraram no selector falhou a
 * dizer que estavam no selector e nao no registo - que e' verdade e nao e' um
 * problema.
 *
 * Escritos um a um e nao por `startsWith`, porque um filtro em vez de uma lista
 * e' uma lista implicita, e a proxima vez que entrar um formato sem registo o
 * filtro passa a apanha-lo sem ninguem ver.
 *
 * **O proximo formato que aparecer tem de ser posto aqui**, ou o teste diz a
 * verdade e alguem vai corrigir no sitio errado - que e' o registo dos lineares,
 * e que passaria a conter um Data Matrix.
 *
 * O **SQRC** entra aqui pelo mesmo motivo: e' um QR com o conteudo cifrado, e o
 * desenho e' o do QR - nao tem valor de codigo de barras, nao tem validacao de
 * digitos, e nao tem altura de barra. Punha-lo no registo dos lineares seria
 * meter um QR la dentro, e o registo nao e' para isso.
 */
const FORA_DO_REGISTO = new Set(['qr', 'pdf417', 'datamatrix', 'gs1-datamatrix', 'sqrc']);

/**
 * Os formatos que vivem no selector mas **nao** no registo dos lineares.
 *
 * O QR e o PDF417 estao no selector e noutro caminho da aplicacao, por desenho.
 * A primeira versao deste teste nao os excluia e falhava com `qr` na lista, o que
 * e' o mesmo sintoma de um `<option>` a apontar para o vazio e completamente
 * diferente: aqui e' proposito.
 *
 * Estao escritos um a um e nao por `startsWith`, porque um filtro em vez de uma
 * lista e' uma lista implicita, e a proxima vez que entrar um formato sem
 * registo o filtro passa a apanha-lo sem ninguem ver.
 */
const FORA_DO_REGISTRO = new Set(['qr', 'pdf417']);

test('todo formato do HTML tem entrada no registo, e vice-versa', () => {
  /*
   * A comparacao e' nos dois sentidos e com a mesma lista, porque uma das metades
   * sozinha deixa passar metade do problema:
   *
   *  - so `HTML ⊆ registo` apanha o `<option>` a apontar para o vazio, que rebenta
   *    ao desenhar - um erro visivel;
   *  - so `registo ⊆ HTML` apanha o encoder invisivel - um erro **invisivel**, e
   *    por isso o que mais importa.
   */
  const noHtml = new Set(DO_HTML);
  const noRegisto = new Set(SIMBOLOGIAS.map((s) => s.id));

  const semRegistro = DO_HTML.filter((id) => !noRegisto.has(id) && !FORA_DO_REGISTO.has(id));
  const semHtml = [...noRegisto].filter((id) => !noHtml.has(id));

  assert.deepEqual(
    semHtml,
    [],
    'estes formatos estao no registo mas nao aparecem no selector: ' +
      'escritos, testados e impossiveis de escolher',
  );

  assert.deepEqual(
    semRegistro,
    [],
    'estes formatos aparecem no selector mas nao estao no registo: ' +
      'a aplicacao rebenta ao escolher',
  );
});

test('os formatos estao pela mesma ordem no HTML e no registo', () => {
  /*
   * A ordem importa porque o selector e' o que o utilizador percorre, e o registo
   * e' a ordem em que a lista faz sentido: produto, logistica, industria. Se
   * divergirem, acrescentar uma entrada num sitio e nao no outro deixa a lista
   * dobrada ou a terreada.
   *
   * Compara-se so o subconjunto das simbologias, porque o selector tambem tem o
   * QR e o PDF417 em cima, e esses nao vivem no registo dos lineares.
   */
  const ids = SIMBOLOGIAS.map((s) => s.id);
  const noHtml = DO_HTML.filter((id) => ids.includes(id));

  assert.deepEqual(
    noHtml,
    ids,
    'a ordem dos lineares no HTML e diferente da do registo',
  );
});

test('nao ha formatos repetidos no selector', () => {
  const vistos = new Set();
  const repetidos = [];

  for (const id of DO_HTML) {
    if (vistos.has(id)) repetidos.push(id);
    vistos.add(id);
  }

  assert.deepEqual(repetidos, [], 'formatos repetidos no selector');
});

test('o registo nao tem ids repetidos, que dariam um selector ambiguo', () => {
  /*
   * Um id repetido no registo e' pior do que no HTML: `simbologiaPorId` devolve o
   * primeiro que encontra, e o segundo nunca e' usado - um encoder escrito e
   * inalcancavel, outra vez. No HTML o mesmo id aparece duas vezes no selector e
   * escolhe-se o primeiro, que e' o mesmo sintoma.
   */
  const vistos = new Set();
  const repetidos = [];

  for (const s of SIMBOLOGIAS) {
    if (vistos.has(s.id)) repetidos.push(s.id);
    vistos.add(s.id);
  }

  assert.deepEqual(repetidos, [], 'ids repetidos no registo');
});

test('o QR e o PDF417 tambem estao no selector, e nao no registo dos lineares', () => {
  /*
   * Os dois formatos que nao sao de barras estao no selector e nao no registo, e
   * isso e' proposito - a interface trata deles noutro caminho. O teste fixo o
   * facto para que, se um dia o registo passar a incluir o QR, fique claro que
   * a duplicacao voltou.
   */
  assert.ok(DO_HTML.includes('qr'), 'o QR tem de estar no selector');
  assert.ok(DO_HTML.includes('pdf417'), 'o PDF417 tem de estar no selector');
  assert.equal(
    simbologiaPorId('qr'),
    null,
    'o QR nao e uma simbologia de barras e nao deve estar no registo',
  );
});
