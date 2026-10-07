/**
 * Os casos do GS1-128 **de Python**, codificados pelo encoder do web.
 *
 *     node web/tests/gerar-gs1-python.mjs
 *
 * Corre para um `.gs1-python.json`, que o `paridade-gs1-python.py` lê.
 *
 * ## Porque é que há dois geradores de GS1
 *
 * **O `.gs1.json` é do GS1-128 do web**, e é o que o `descodificar-gs1.py` dele lê.
 * A primeira versão deste ficheiro **substituiu `gerar-gs1.mjs` em vez de criar um
 * ao lado**, e o sintoma foi o `descodificar-gs1.py` do web a dar
 * `KeyError: 'entrada'` — os casos de Python tinham sido escritos por cima dos
 * casos do web no mesmo ficheiro.
 *
 * **Dois geradores para o mesmo ficheiro são o mesmo bug dos dois registos**, e é
 * o que a `AGENTS.md` chama lista escrita duas vezes: o GS1-128 entrou no registo
 * do web com o encoder e não apareceu no selector, porque nada ligava as listas.
 * Aqui a lista de casos também está escrita duas vezes — a do web e a de Python —
 * e por isso que cada uma tem o seu ficheiro.
 *
 * ## Os casos vêm do Python
 *
 * São os de `python/tests/test_gs1.py`, lidos por um `python -c`. Não é uma lista
 * aqui: **duas listas do mesmo conjunto divergem em silêncio**, que é o que
 * aconteceu ao Code 93 quando o caso entrou na lista partilhada e partiu as
 * paridades do Kotlin e do C#.
 *
 * E **lê-se a suite e não um JSON** — comparar o encoder de hoje com o de uma
 * execução de ontem não apanha divergência nenhuma.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gs1_128 } from '../symbologies/gs1-128.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');

/**
 * Onde se escreve o resultado.
 *
 * **O nome não é `JSON`, e essa é a lição.** `const JSON = join(...)` tapa o `JSON`
 * global do módulo, e a primeira `JSON.parse` do ficheiro dá
 * `TypeError: JSON.parse is not a function` — **uma falha que não parece de
 * codificação e é de nomes**, e que aparece na mesma linha em qualquer lado do
 * ficheiro em que o `JSON.parse` estiver.
 */
const FICHEIRO = join(AQUI, '.gs1-python.json');

/** Os casos, lidos de `python/tests/test_gs1.py`. */
function casosDoPython() {
  const r = spawnSync(
    'python',
    [
      '-c',
      'import json, sys; sys.path.insert(0, "tests"); import test_gs1; ' +
        'print(json.dumps({"casos": test_gs1.CASOS, "recusas": test_gs1.RECUSAS}))',
    ],
    { cwd: join(RAIZ, 'python'), encoding: 'utf8' },
  );

  if (r.status !== 0) {
    throw new Error(`o Python falhou:\n${r.stderr}`);
  }

  const dados = JSON.parse(r.stdout);

  return {
    casos: dados.casos.map(([texto, modulos, fnnc1]) => ({
      nome: `o GS1-128 de ${texto}`,
      texto,
      modulos,
      fnnc1,
    })),
    recusas: dados.recusas.map(([texto, palavra]) => ({
      nome: `a recusa de ${texto}`,
      texto,
      erro: palavra,
    })),
  };
}

const { casos, recusas } = casosDoPython();

/**
 * Codifica com o web, e **uma recusa é um resultado e não uma excepção**.
 *
 * A primeira versão lançava `undefined` para uma recusa, e o `paridade-gs1.py`
 * comparava isso com a excepção do Python — que nunca são a mesma coisa, e dava
 * uma falha que não dizia qual dos dois tinha errado. **Um `try` que devolve
 * `null` transforma uma excepção em um valor, e um valor compara-se.**
 */
const saida = [
  ...casos.map((caso) => {
    try {
      const r = gs1_128(caso.texto);
      return {
        nome: caso.nome,
        texto: caso.texto,
        modulos: r.modules.length,
        fnnc1: r.separadores,
        gs1: r.gs1,
        legenda: r.caption,
        payload: r.payload,
        erro: null,
      };
    } catch (e) {
      return { nome: caso.nome, texto: caso.texto, modulos: null, erro: e.message };
    }
  }),
  ...recusas.map((caso) => {
    try {
      gs1_128(caso.texto);
      // **Um caso de recusa que o web aceita é o resultado mais grave que há**: o
      // Python também recusaria, a paridade passava, e o sintoma é uma etiqueta
      // impressa com um campo a mais.
      return { nome: caso.nome, texto: caso.texto, modulos: null, erro: null };
    } catch (e) {
      return { nome: caso.nome, texto: caso.texto, modulos: null, erro: e.message };
    }
  }),
];

writeFileSync(FICHEIRO, JSON.stringify(saida, null, 1), 'utf8');

console.log(
  `  ${saida.length} casos do GS1-128 de Python, ${saida.filter((c) => c.erro).length} recusados`,
);