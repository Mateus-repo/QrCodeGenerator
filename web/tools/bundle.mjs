/**
 * Gera um ficheiro HTML único, com tudo dentro.
 *
 *     node web/tools/bundle.mjs
 *     -> web/dist/qrcode-generator.html
 *
 * Porquê: módulos ES são bloqueados em `file://` pelo Chrome (CORS), por isso
 * a versão em vários ficheiros precisa de um servidor. O ficheiro único abre
 * com duplo clique em Windows, Mac e Linux, e pode ir num cartão de memória.
 *
 * A transformação é pequena e só serve para o estilo de código que este
 * projeto usa: `import { a, b as c } from './x.js'`, `export { a as b } from
 * './x.js'`, e `export` em declarações. Cada módulo é envolvido no seu próprio
 * IIFE, por isso os nomes locais não colidem entre ficheiros.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const out = join(web, 'dist');

/**
 * Ordem de dependências: um módulo só pode vir depois de quem importa.
 *
 * **A lista tem de estar completa, e o `sw.test.mjs` verifica isso pelo `sw.js`,
 * não por aqui.** A falha é real e já aconteceu: o `code93.js`, o
 * `datamatrix.js`, o `gs1-128.js`, o `gs1-datamatrix.js` e as tabelas de dados
 * não estavam aqui, e o ficheiro único era gerado **sem eles** — sem dar erro,
 * sem aviso, e com o tamanho a subir aos poucos sem que ninguém reparasse.
 *
 * Um módulo em falta aqui não dá `SyntaxError`: dá um `undefined` em tempo de
 * execução, que só aparece quando alguém escolhe esse formato. É a razão de o
 * `sw.js` ter um teste que compara a lista dele com os `import` do `app.js`, e
 * a razão de esta lista precisar do mesmo.
 *
 * **Quando acrescentar um módulo, acrescentar aqui.** O ficheiro único é o que
 * a pessoa descarrega, e é o que abre com duplo clique.
 */
const MODULES = [
  'qrcode.js',
  'frameqr.js',
  'datamatrix.js',
  'symbologies/upcean.js',
  'symbologies/code128.js',
  'symbologies/code39.js',
  'symbologies/itf.js',
  'symbologies/codabar.js',
  'symbologies/linear.js',

  /*
   * **Cada tabela ANTES de quem a importa.** A ordem nao e' por ordem
   * alfabetico nem por ordem de dependencia do `app.js` - e' por dependencia
   * entre os modulos, e o `bundle.test.mjs` verifica-a.
   *
   * Um modulo fora de ordem da um `Cannot access 'X' before initialization`:
   * o `const X = ...` do fim ainda nao foi avaliado quando o modulo de cima o
   * usa. E um erro de execucao e nao de sintaxe, o que significa que o
   * `node --check` passa e o ficheiro gerado abre com um erro na consola.
   */
  'symbologies/code93-tabelas.js',
  'symbologies/code93.js',
  'symbologies/pdf417-tabelas.js',
  'symbologies/pdf417.js',
  'symbologies/datamatrix-tabelas.js',
  'symbologies/datamatrix.js',
  'symbologies/gs1-tabelas.js',
  'symbologies/gs1-128.js',
  'symbologies/gs1-datamatrix.js',

  'symbologies/index.js',
  'payloads/text.js',
  'payloads/normalize.js',
  'payloads/pix.js',
  'payloads/types.js',
  'themes.js',
  'app.js',
];

/** Folhas de estilo, pela ordem em que são ligadas no HTML. */
const STYLESHEETS = ['styles.css', 'themes.css'];

/**
 * Os três formatos que este ficheiro tem de entender, e a ordem importa.
 *
 * - `IMPORT_RE` o `import { a, b as c } from './x.js'`, normal.
 * - `REEXPORT_RE` o `export { a, b as c } from './x.js'`, que é um import **e**
 *   um export ao mesmo tempo.
 * - `EXPORT_LIST_RE` o `export { a, b as c }` sem `from`, que só reexporta o
 *   que já está no ficheiro.
 *
 * **A ordem das substituições é o que faz isto funcionar, e é contra-intuitiva.**
 *
 * O `REEXPORT_RE` e o `EXPORT_LIST_RE` começam os dois por `export {`, e o
 * segundo não distingue a presença do `from`. Se o `EXPORT_LIST_RE` correr
 * primeiro, ele apanha a linha do re-export, tira o `export { a, b }` e deixa o
 * `from './x.js'` sozinho — que é sintaxe inválida, e o ficheiro gerado não
 * abre. Por isso o re-export é tratado **antes** da lista de exportação.
 *
 * E o `IMPORT_RE` corre antes do `REEXPORT_RE`, por uma razão diferente: o
 * `symbologies/index.js` faz as duas coisas — `import { ean13 } from
 * './upcean.js'` no topo e `export { ean13 } from './upcean.js'` em baixo, para
 * ter os dois no mesmo ficheiro. O re-export precisa de saber o que já foi
 * importado para não gerar o `const { ean13 } = …` duas vezes.
 *
 * Estas três regras não estavam aqui, e o ficheiro único esteve **partido desde
 * o commit do GS1-128**: um `SyntaxError: Unexpected identifier 'as'` e um
 * `Unexpected token 'export'` que só apareciam ao abrir o ficheiro, porque cada
 * módulo por si é válido e passa o `node --check`. O `bundle.test.mjs` existe
 * agora para que isso não volte a acontecer sem ninguém dar por isso.
 */
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm;
const REEXPORT_RE = /^export\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm;
const NAMESPACE_RE = /^export\s+(function|const|let|class)\s+(\w+)/gm;

/**
 * `export { a as b };` — a lista de exportação sem `from`.
 *
 * **`[ \t]*` antes do `\{`, e o motivo de o `code128.js` ter ficado de fora.**
 *
 * O ficheiro termina com `export { INICIO as CONJUNTOS_INICIO, ... };` e essa
 * linha é a que dá ao `gs1-128.js` o `CONJUNTOS_INICIO`. Com o padrão
 * `\s*\{`, o `\s*` também come o **recuo** da linha, e a linha apanhava — mas
 * o `\s` do fim não tolerava o `;` depois do `}`, e a linha ficava no ficheiro
 * gerado como `return { INICIO as CONJUNTOS_INICIO, ... };` dentro de um
 * IIFE. O sintoma era um `SyntaxError` numa linha, e não um
 * `CONJUNTOS_INICIO is not defined` — porque o export nunca era gerado e o
 * `return` do módulo saía vazio.
 *
 * **O `;` é opcional de propósito**, porque `export { a }` sem ponto e vírgula é
 * igualmente válido, e um ficheiro que use um e não o outro tem de funcionar
 * nos dois casos.
 */
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([^}]*)\}[ \t]*;?[ \t]*$/gm;

/** `'payloads/pix.js'` -> `'__mod_payloads_pix'`. */
function namespaceOf(path) {
  return '__mod_' + posix.normalize(path).replace(/\.js$/, '').replace(/[^a-zA-Z0-9]/g, '_');
}

/** Resolve `'./text.js'` a partir de `'payloads/pix.js'`. */
function resolveImport(de, origem) {
  return posix.normalize(posix.join(posix.dirname(de), origem)).replace(/^\.\//, '');
}

/** Separa `'a, b as c'` em `[['a','a'], ['b','c']]`. */
function paresDe(lista) {
  return lista
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [nome, alias] = s.split(/\s+as\s+/).map((p) => p.trim());
      return { nome, externo: alias ?? nome };
    });
}

/** Separa o ficheiro em { imports, exportados, corpo }. */
function parseModule(path) {
  const source = readFileSync(join(web, path), 'utf8');
  const imports = [];
  const exportados = new Map();
  // Os nomes já importados, para o re-export não duplicar. Ver a nota do
  // `IMPORT_RE` acima sobre a ordem das substituições.
  const importados = new Set();

  // 1. O import normal. Preenche o `importados`.
  let body = source.replace(IMPORT_RE, (_, lista, origem) => {
    const from = namespaceOf(resolveImport(path, origem));
    const bindings = [];

    for (const { nome, externo } of paresDe(lista)) {
      importados.add(externo);
      bindings.push(externo === nome ? nome : `${nome}: ${externo}`);
    }

    imports.push({ from, bindings });
    return '';
  });

  // 2. O re-export, que é um import mais um export — e só importa o que o
  //    passo 1 não trouxe.
  body = body.replace(REEXPORT_RE, (_, lista, origem) => {
    const from = namespaceOf(resolveImport(path, origem));

    for (const { nome, externo } of paresDe(lista)) {
      if (!importados.has(nome)) {
        imports.push({ from, bindings: [nome] });
        importados.add(nome);
      }
      // O que se exporta é o nome **externo**, que é o alias quando o há.
      exportados.set(externo, { declarado: nome, externo });
    }
    return '';
  });

  // 3. `export function`, `export const` e companhia.
  body = body.replace(NAMESPACE_RE, (_, tipo, nome) => {
    exportados.set(nome, { declarado: nome, externo: nome });
    return `${tipo} ${nome}`;
  });

  // 4. `export { a as b }` sem `from`, que só reexporta o que já está cá.
  body = body.replace(EXPORT_LIST_RE, (_, lista) => {
    for (const { nome, externo } of paresDe(lista)) {
      exportados.set(externo, { declarado: nome, externo });
    }
    return '';
  });

  return { path, imports, exportados: [...exportados.values()], corpo: body.trim() };
}

/**
 * O ponto de entrada, que **nao** e' embrulhado num IIFE que devolva objecto.
 *
 * O `app.js` e' o modulo que corre: liga os eventos, arranca a aplicacao, e
 * nao exporta nada. Embrulha-lo como os outros produzia
 *
 *     const __mod_app_js = (() => { ... return {  }; })();
 *
 * e o `return {  }` de um modulo sem exportados fica dentro do IIFE, com o
 * `}` a mais que o fecha. O ficheiro gerado **nao abria**, com um
 * `SyntaxError: Unexpected token '}'` na ultima linha - a mais de 8000, onde
 * nao ha nada para olhar.
 *
 * A razao de ser preciso tratar a parte e' que o IIFE exterior do ficheiro
 * unico ja fecha com `})();`, e o embrulho do `app.js` fecha com outro. Sao
 * dois fechos e uma so funcao, e o `return` vazio e' o sintoma de que o
 * embrulho nao tinha nada que envolver.
 */
const PONTO_DE_ENTRADA = 'app.js';

function bundle() {
  const partes = [];

  for (const path of MODULES) {
    const modulo = parseModule(path);
    const ns = namespaceOf(path);

    const destructuracao = modulo.imports
      .map(({ from, bindings }) => `  const { ${bindings.join(', ')} } = ${from};`)
      .join('\n');

    if (path === PONTO_DE_ENTRADA) {
      /*
       * Sem embrulho: o codigo corre logo, e as importacoes ficam no ambito do
       * IIFE exterior do ficheiro unico.
       *
       * **A indentacao e' tirada, e o mesmo por que o embrulho foi tirado.** O
       * `destructuracao` e o `corpo` trazem a indentacao de dentro do embrulho
       * que este modulo deixou de ter, e sao dois espacos a mais em cada linha.
       * Nao parte nada - o JavaScript nao liga a indentacao - e por isso
       * parece um detalhe. Mas o ficheiro gerido e' lido por pessoas, e um
       * ficheiro com a indentation errada faz o proximo que o editar Turk
       * duvidar de onde acaba o IIFE.
       */
      const semEspacos = (texto) =>
        texto
          .split('\n')
          .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
          .join('\n');

      partes.push(
        `// ===== ${path} =====\n${semEspacos(destructuracao)}\n${semEspacos(modulo.corpo)}`,
      );
      continue;
    }

    /*
     * O `return` do IIFE tem de dizer `{ ALIAS: nome }` quando o nome exportado
     * difere do nome declarado.
     *
     * `export { INICIO as CONJUNTOS_INICIO }` declara uma coisa e exporta outra.
     * Dentro do IIFE o nome que existe e' o **declarado** — `INICIO` — e o
     * `CONJUNTOS_INICIO` nao existe em lado nenhum. Um `return {
     * CONJUNTOS_INICIO }` da um `ReferenceError` a correr, que e' o que
     * acontecia: o ficheiro gerado abria, o modulo do Code 128 nao era carregado,
     * e o erro era `CONJUNTOS_INICIO is not defined` numa linha a mais de mil.
     *
     * E o pior sitio possivel para um erro: a sintaxe esta certa, o modulo
     * esta certo, e o que falha e' um nome que so existe na frase `export`.
     * Por isso o `return` mapeia, e nao só lista.
     */
    const retorno = modulo.exportados
      .map(({ declarado, externo }) =>
        declarado === externo ? externo : `${externo}: ${declarado}`,
      )
      .join(', ');

    partes.push(
      `// ===== ${path} =====\n` +
        `const ${ns} = (() => {\n${destructuracao}\n${modulo.corpo}\n` +
        `  return { ${retorno} };\n})();`,
    );
  }

  return partes.join('\n\n');
}

function html() {
  let pagina = readFileSync(join(web, 'index.html'), 'utf8');
  const js = bundle();

  // Todas as folhas de estilo são embutidas, pela ordem do HTML. Os temas têm
  // de vir depois da base, porque só substituem variáveis.
  const css = STYLESHEETS.map((file) => `/* ==== ${file} ==== */\n${readFileSync(join(web, file), 'utf8')}`).join(
    '\n',
  );

  for (const file of STYLESHEETS) {
    pagina = pagina.replace(new RegExp(`[ \\t]*<link rel="stylesheet" href="${file}" />\\n?`, 'g'), '');
  }

  /*
   * O CSS e o `</head>` entram por **função**, pela mesma razão do script.
   *
   * As folhas de estilo deste projeto têm `$` em seletores - `input[type="..."]`
   * usa, e o `themes.css` tem custom properties. Uma cadeia de substituição
   * trataria `$` como referência e o CSS saía com os seletores trocados, ou com
   * `$&` e `$1` literais no meio de um bloco de CSS que o browser aceita sem
   * dizer nada. Um CSS com um selector trocado **pode** ficar válido e mudar o
   * aspecto sem dar erro, que é o pior resultado dos dois.
   */
  pagina = pagina.replace('</head>', () => `  <style>\n${css}\n  </style>\n</head>`);

  // O ficheiro único não tem manifest nem service worker: não há onde os
  // registar em file://, e um 404 no console não ajuda ninguém.
  pagina = pagina.replace(/<link rel="manifest"[^>]*>/, '');
  pagina = pagina.replace(/<link rel="icon"[^>]*>/, '');

  /*
   * O script do bundle entra aqui, e a substituição usa uma **função** e não uma
   * cadeia.
   *
   * **É esta a causa do ficheiro partido, e é um `$` numa cadeia de
   * substituição.** O `String.replace` trata `$&`, `$1` e `$'` na *cadeia de
   * substituição* como referências ao que casou. O `code39.js` tem um `'$'` no
   * seu alfabeto - o dígito de controlo - e o bundle tem um `${js}` que o
   * trazia para dentro. A primeira vez que apareceu, o resultado foi:
   *
   *     '-', '.', ' ', '
   *       </body>
   *     </html>
   *     , '/', '+', '%',
   *
   * **O ficheiro gerado tinha o `</body></html>` no meio do código JavaScript.**
   * Um `SyntaxError` no browser, sem qualquer pista de onde vinha, e o
   * `node --check` do `code39.js` passava porque o módulo está bem.
   *
   * Passar uma função como segundo argumento desliga as substituições todas: o
   * texto entra literal. E é a razão de o `'$'` ser um caractere perigoso
   * *neste* ficheiro em particular - não num ficheiro qualquer, mas num que
   * junta código-fonte que tem caracteres especiais.
   */
  pagina = pagina.replace(/<script type="module" src="app\.js"><\/script>/, () =>
    `<script>\n(function () {\n'use strict';\n// Sem manifesto e sem service worker: num ficheiro solitário não há onde os instalar.\nconst __FICHEIRO_UNICO__ = true;\n${js}\n})();\n</script>`,
  );

  return pagina;
}

mkdirSync(out, { recursive: true });
const destino = join(out, 'qrcode-generator.html');
writeFileSync(destino, html(), 'utf8');

const kb = Math.round(readFileSync(destino).length / 1024);
console.log(`${destino} (${kb} KB, um ficheiro, sem dependências)`);
