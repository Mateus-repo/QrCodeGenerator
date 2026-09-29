/**
 * O ficheiro unico tem de abrir sem erros de sintaxe, e tem de ter os modulos
 * todos dentro.
 *
 *     node --test web/tests/bundle.test.mjs
 *
 * **Este teste existe porque o ficheiro unico esteve partido desde o commit do
 * GS1-128**, e ninguem deu por isso. Nao por o modulo estar errado - cada modulo
 * por si e' valido e passa o `node --check` - mas porque o `bundle.mjs` so
 * sabia tratar tres das seis formas de `export` que o codigo usa:
 *
 *   - `export { a, b as c }` sem `from` - exportava o `nome` em vez do
 *     `alias`, e o `return { INICIO as CONJUNTOS_INICIO }` saia literally para o
 *     ficheiro. Um `SyntaxError: Unexpected identifier 'as'`.
 *   - `export { a } from './x.js'` - o re-export, que nao era tratado, e o
 *     `export` ficava no meio de um IIFE. Um `Unexpected token 'export'`.
 *   - e a lista de modulos estava **incompleta**: faltavam o Code 93, o Data
 *     Matrix, o GS1-128, o GS1 DataMatrix e as tabelas todas. O ficheiro
 *     gerado tinha 194 KB em vez dos 578 KB de agora, e nao dava erro nenhum -
 *     dava um `undefined` em tempo de execucao, que so aparecia quando se
 *     escolhia o formato.
 *
 * **O que o teste faz e' o que o browser faz**: extrai o script do ficheiro
 * gerado e passa-o ao `node --check`. Nao e' uma verificacao parecida com a
 * real - e' a verificacao real, com o mesmo parser.
 *
 * E a segunda metade e' o que nenhum teste apanharia: que os modulos que o
 * `app.js` importa estejam todos no ficheiro. Um modulo em falta da lista dao
 * um `undefined` silencioso, e o unico sinal e' o formato nao aparecer no
 * selector.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLER = join(RAIZ, 'tools', 'bundle.mjs');
const DESTINO = join(RAIZ, 'dist', 'qrcode-generator.html');

/**
 * O script do bundle, extraido do HTML.
 *
 * **Nao e' o ultimo `<script>`, e a primeira versao deste ficheiro achou que
 * era.** O HTML tem tres `<script>` a sério — o arranque do tema, o bundle — e
 * o CSS embutido tem `<script>` dentro de comentarios, que o browser conta e nao
 * executa. Escolher o ultimo dava o arranque do tema, com 1194 caracteres, e o
 * teste falhava com "e curto demais" sem dizer nada sobre o bundle.
 *
 * O que identifica o bundle e' o **conteudo**, e nao a posicao: ele comeca com
 * `const __FICHEIRO_UNICO__ = true;` e tem os `__mod_*`. Procurar por isso e'
 * o que sobrevive a mudancas no HTML.
 */
function scriptDoFicheiro(html) {
  const marca = 'const __FICHEIRO_UNICO__ = true;';
  const inicio = html.indexOf(marca);
  assert.notEqual(inicio, -1, 'o ficheiro gerado nao tem a marca do ficheiro unico');

  // Recuar ate ao `<script>` que abre este bloco.
  const abertura = html.lastIndexOf('<script', inicio);
  assert.notEqual(abertura, -1, 'a marca do ficheiro unico esta fora de um <script>');

  const fecho = html.indexOf('</script>', inicio);
  assert.ok(fecho > inicio, 'o script do bundle nao fecha');

  /*
   * O slice comeca **depois** da etiqueta `<script>` e acaba no `</script>`.
   *
   * **A abertura do IIFE tem de ficar dentro**, e a marca
   * `const __FICHEIRO_UNICO__ = true;` e' o que a localiza: ela esta dentro
   * do IIFE exterior, que abre com `(function () {` e fecha no fim com
   * `})();`. Cortar na marca tirava a abertura e deixava o fecho orfao, e o
   * `node --check` dava `SyntaxError: Unexpected token '}'` na ultima linha -
   * que e' o **teste** errado e nao o ficheiro.
   *
   * E' a segunda vez que este teste da a si proprio como culpado. A primeira
   * foi devolver o HTML com a etiqueta `<script>` em cima, e o `node --check`
   * falhou com `Unexpected token '<'`, que e' HTML num ficheiro JavaScript.
   * Nenhuma das duas era um erro do bundler, e as duas teriam mandado-me
   * depurar o ficheiro gerado - que estava certo.
   */
  const inicioJs = abertura + html.slice(abertura).indexOf('>') + 1;
  return html.slice(inicioJs, fecho);
}

test('o bundle gera um ficheiro, e o script vai ao node --check', () => {
  execFileSync(process.execPath, [BUNDLER], { stdio: 'pipe' });

  assert.ok(existsSync(DESTINO), 'o bundle nao gerou o ficheiro');

  const js = scriptDoFicheiro(readFileSync(DESTINO, 'utf8'));
  assert.ok(js.length > 100000, `o script tem ${js.length} caracteres, e curto demais`);

  // O mesmo parser que o browser usa, no mesmo ficheiro. Um erro de sintaxe
  // aqui e' um erro de sintaxe no browser, e nao uma aproximacao.
  const ficheiro = join(tmpdir(), `bundle-verificacao-${process.pid}.js`);
  writeFileSync(ficheiro, js, 'utf8');

  try {
    execFileSync(process.execPath, ['--check', ficheiro], { stdio: 'pipe' });
  } catch (erro) {
    assert.fail(`o ficheiro unico tem um erro de sintaxe:\n${erro.stderr ?? erro.message}`);
  } finally {
    unlinkSync(ficheiro);
  }
});

test('o script do bundle nao tem nenhum `export` nem `import` por resolver', () => {
  execFileSync(process.execPath, [BUNDLER], { stdio: 'pipe' });
  const js = scriptDoFicheiro(readFileSync(DESTINO, 'utf8'));

  // As tres coisas que ficaram por resolver quando o ficheiro estava partido,
  // e que o `node --check` apanharia se nao fossem o unico sintoma. Numa linha
  // a parte, para o erro dizer onde.
  for (const [padrao, porque] of [
    [/^\s*export\s*\{/m, 'um `export { ... }` por resolver'],
    [/^\s*import\s*\{/m, 'um `import { ... }` por resolver'],
    [/\bas\s+[A-Z_]+\s*[,}]/, 'um alias por resolver, de um `as` que nao foi reescrito'],
  ]) {
    const achado = js.match(padrao);
    assert.equal(
      achado,
      null,
      `${porque}: ${achado ? JSON.stringify(achado[0]) : ''}\n` +
        'O bundle tem de reescrever os imports, os re-exports e as listas de ' +
        'exportacao. Ver as notas do bundle.mjs.',
    );
  }
});

test('todos os modulos que o app importa estao dentro do ficheiro', () => {
  execFileSync(process.execPath, [BUNDLER], { stdio: 'pipe' });
  const js = scriptDoFicheiro(readFileSync(DESTINO, 'utf8'));

  // O `app.js` e' o que sabe o que ha' para escolher. Percorrer os `import`
  // dele e ver que cada um tem o seu namespace no bundle.
  const app = readFileSync(join(RAIZ, 'app.js'), 'utf8');
  const importados = [...app.matchAll(/from\s+'\.\/([^']+)'/g)].map((m) => m[1]);

  assert.ok(importados.length > 5, 'o app.js nao importa quase nada - o teste nao serviria');

  const emFalta = importados.filter((caminho) => {
    const ns = '__mod_' + caminho.replace(/\.js$/, '').replace(/[^a-zA-Z0-9]/g, '_');
    return !js.includes(`const ${ns} =`);
  });

  assert.deepEqual(
    [...new Set(emFalta)],
    [],
    'modulos que o app importa e que nao estao no ficheiro unico: ' +
      'aparecem como undefined em tempo de execucao, sem erro nenhum',
  );
});

test('a ordem dos modulos respeita as dependencias, e nenhuma tabela vem depois', () => {
  /*
   * **A ordem nao e' um detalhe de estilo, e' o que faz o ficheiro funcionar.**
   *
   * Um modulo fora de ordem da um `Cannot access '__mod_...' before
   * initialization`: o `const` do fim ainda nao foi avaliado quando o modulo de
   * cima o usa. E um **erro de execucao, nao de sintaxe** - o `node --check`
   * passa, o ficheiro abre, e o erro so aparece na consola. E o ficheico so
   * falha no formato que usa aquele modulo, que e' o sintoma mais discreto que
   * existe: um codigo que nao sai e nenhum erro a dizer porquê.
   *
   * O caso que apareceu foi o `code93-tabelas.js` depois do `code93.js`, e a
   * regra que generaliza e' uma só: **as tabelas antes de quem as importa**.
   */
  execFileSync(process.execPath, [BUNDLER], { stdio: 'pipe' });
  const js = scriptDoFicheiro(readFileSync(DESTINO, 'utf8'));

  // A posicao de cada modulo no ficheiro, pela ordem em que a lista os emite.
  const posicoes = new Map();
  const achados = [...js.matchAll(/^\/\/ ===== (.+?) =====$/gm)];
  achados.forEach((m, i) => posicoes.set(m[1], i));
  assert.ok(achados.length > 20, `so encontrei ${achados.length} modulos no ficheiro`);

  // Para cada modulo, cada `__mod_` de que depende tem de estar antes.
  for (let i = 0; i < achados.length; i++) {
    const nome = achados[i][1];
    const inicio = achados[i].index;
    const fim = i + 1 < achados.length ? achados[i + 1].index : js.length;
    const corpo = js.slice(inicio, fim);

    for (const dep of corpo.matchAll(/__mod_[a-z0-9_]+/g)) {
      const qual = [...posicoes.keys()].find((n) => '__mod_' + n.replace(/[^a-zA-Z0-9]/g, '_') === dep[0]);
      if (!qual) continue;
      assert.ok(
        posicoes.get(qual) < i,
        `o modulo "${nome}" usa "${qual}", que vem **depois** dele. ` +
          'Um `const` usado antes de ser avaliado da um ReferenceError, nao um ' +
          'erro de sintaxe - e por isso o node --check nao apanha.',
      );
    }
  }
});

test('o ficheiro unico tem os tres formatos que o registo tem', () => {
  /*
   * A segunda metade da verificacao anterior: mesmo que o modulo esteja no
   * ficheiro, o formato tem de aparecer no `<option>`. E' o que a pessoa ve, e
   * e' o sintoma de um `MODULES` incompleto.
   */
  execFileSync(process.execPath, [BUNDLER], { stdio: 'pipe' });
  const html = readFileSync(DESTINO, 'utf8');

  for (const formato of [
    'datamatrix',
    'gs1-datamatrix',
    'gs1-128',
    'code93',
    'code39',
    'code128',
    'itf14',
    'codabar',
    'ean13',
    'upca',
  ]) {
    assert.ok(
      html.includes(`value="${formato}"`),
      `o formato "${formato}" nao esta no selector do ficheiro unico`,
    );
  }
});
