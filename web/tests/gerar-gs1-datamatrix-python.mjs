/**
 * Os casos do GS1 DataMatrix **de Python**, codificados pelo encoder do web.
 *
 *     node web/tests/gerar-gs1-datamatrix-python.mjs
 *
 * Corre para um `.gs1-datamatrix-python.json`, que o
 * `descodificar-gs1-datamatrix-python.py` le (com o ZXing) e o
 * `paridade-gs1-datamatrix.py` compara com o Python.
 *
 * ## Porque e' que ha dois geradores de GS1 DataMatrix
 *
 * **O `.gs1-datamatrix.json` e' do GS1 DataMatrix do web**, e e' o que o
 * `descodificar-gs1-datamatrix.py` dele le. Este ficheiro **codifica os casos de
 * Python** com o encoder do web, para a paridade e para o leitor do Python.
 *
 * Sao dois geradores porque sao dois encoders, e nao porque sejam dois conjuntos de
 * casos. **Os casos vem todos do Python** - le-se a suite, nao um JSON.
 *
 * ## Os casos vem do Python, e nao estao aqui
 *
 * Sao os de `python/tests/test_gs1_datamatrix.py`, lidos por um `python -c`. Nao e'
 * uma lista aqui: **duas listas do mesmo conjunto divergem em silencio**, que e' o que
 * aconteceu ao Code 93 quando o caso entrou na lista partilhada e partiu as paridades
 * do Kotlin e do C#. E **le-se a suite e nao um JSON** - comparar o encoder de hoje com
 * o de uma execucao de ontem nao apanha divergencia nenhuma.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gs1DataMatrix } from '../symbologies/gs1-datamatrix.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');

/**
 * Onde se escreve o resultado.
 *
 * **O nome nao e' `JSON`, e essa e' a licao.** `const JSON = join(...)` tapa o `JSON`
 * global do modulo, e a primeira `JSON.parse` do ficheiro da
 * `TypeError: JSON.parse is not a function` - **uma falha que nao parece de
 * codificacao e e' de nomes**.
 */
const FICHEIRO = join(AQUI, '.gs1-datamatrix-python.json');

/** Os casos, lidos de `python/tests/test_gs1_datamatrix.py`. */
function casosDoPython() {
  const r = spawnSync(
    'python',
    [
      '-c',
      'import json, sys; sys.path.insert(0, "tests"); import test_gs1_datamatrix; ' +
        'print(json.dumps({"casos": test_gs1_datamatrix.CASOS, "recusas": test_gs1_datamatrix.RECUSAS}))',
    ],
    { cwd: join(RAIZ, 'python'), encoding: 'utf8' },
  );

  if (r.status !== 0) {
    throw new Error(`o Python falhou:\n${r.stderr}`);
  }

  const dados = JSON.parse(r.stdout);

  return {
    casos: dados.casos.map(([texto, esperado]) => ({
      nome: `o GS1 DataMatrix de ${texto}`,
      texto,
      esperado,
    })),
    recusas: dados.recusas.map(([texto]) => ({
      nome: `a recusa de ${texto}`,
      texto,
    })),
  };
}

const { casos, recusas } = casosDoPython();

/**
 * Codifica com o web, e **uma recusa e' um resultado e nao uma excepcao**.
 *
 * Um `try` que devolve `null` transforma uma excepcao em um valor, e um valor
 * compara-se - que e' o que o `paridade` precisa.
 */
const saida = [
  ...casos.map((caso) => {
    try {
      const r = gs1DataMatrix(caso.texto);
      return {
        nome: caso.nome,
        entrada: caso.texto,
        /** **Os codewords sao o formato de fio** - o que o ZXing le. Vem antes da
         * imagem porque e' a comparacao que apanha o 232 no sitio errado: um simbolo
         * com um codeword trocado tem o mesmo numero de modulos e le-se com o campo
         * partido. */
        codewords: r.codewords,
        /** A imagem, com 0 e 1. `modulos` e' o nome que a `paridade` le, e nao
         * `modules` - **o `gerar-gs1-datamatrix.mjs` usava `modules` e a
         * `descodificar` do GS1-128 pedia `modulos`**, o que dava um `KeyError` que
         * nao falava do formato. */
        modulos: r.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
        colunas: r.colunas,
        linhas: r.linhas,
        /** A forma humana, que e' o `text` que o leitor devolve. */
        gs1: r.gs1,
        /** A forma de maquina, que e' o que vai nos `bytes`. */
        payload: r.payload,
        separadores: r.separadores,
        erro: null,
      };
    } catch (e) {
      return { nome: caso.nome, entrada: caso.texto, modules: null, erro: e.message };
    }
  }),
  ...recusas.map((caso) => {
    try {
      gs1DataMatrix(caso.texto);
      // **Um caso de recusa que o web aceita e' o resultado mais grave que ha**: o
      // Python tambem recusaria, a paridade passava, e o sintoma e' uma etiqueta
      // impressa com um campo a mais.
      return { nome: caso.nome, entrada: caso.texto, modules: null, erro: null };
    } catch (e) {
      return { nome: caso.nome, entrada: caso.texto, modules: null, erro: e.message };
    }
  }),
];

writeFileSync(FICHEIRO, JSON.stringify(saida, null, 1), 'utf8');

console.log(
  `  ${saida.length} casos do GS1 DataMatrix de Python, ${saida.filter((c) => c.erro).length} recusados`,
);