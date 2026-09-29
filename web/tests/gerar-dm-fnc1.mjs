/**
 * Mede o que o ZXing devolve de um Data Matrix com FNC1 (232).
 *
 *     node web/tests/gerar-dm-fnc1.mjs
 *     python web/tests/ver-dm-fnc1.py
 *
 * O FNC1 no Data Matrix e' o codeword 232, e no GS1 DataMatrix faz as duas
 * coisas: marca o codigo como GS1 e separa os campos de comprimento variavel.
 *
 * A medicao e' feita **antes** do encoder, pela mesma razao que no GS1-128: para
 * saber o que se pode prometer e nao descobrir depois. E ha uma razao a mais aqui.
 *
 * **O 232 e' simultaneamente o FNC1 e o par de digitos "02"**, porque 232 - 130
 * = 102. So a posicao os distingue: na posicao 0 e' o FNC1, no meio e' "02". E
 * por isso que o GS1 DataMatrix nao pode ser "o texto com um 232 a frente" - o
 * 232 tem de ser emitido como codeword, e nao como os caracteres que o produziriam.
 *
 * Os tres casos:
 *
 *  1. so o 232 no inicio - o minimo para o leitor dizer que e' GS1;
 *  2. 232 no inicio e 232 a separar dois campos;
 *  3. texto sem nenhum 232 - o controlo, que tem de sair diferente.
 */

import { writeFileSync } from 'node:fs';
import { dataMatrixDeCodewords, FNC1_DATAMATRIX } from '../symbologies/datamatrix.js';

const FNC1 = FNC1_DATAMATRIX;

/**
 * O modo de digitos do Data Matrix, que emparelha e soma 130.
 *
 * Este e' o unico modo que o GS1 usa nos digitos, e a razao pela qual o 232 e'
 * ambíguo: o par "02" da' 2 + 130 = 132, e o FNC1 e' 232. Nao sao o mesmo
 * numero - mas a primeira versao deste script mediu com o **texto** "02...", que
 * o `compactar` transformava em 132, e mesmo assim o ZXing nao lia nada.
 */
const digitos = (texto) => {
  const saida = [];
  let i = 0;
  while (i < texto.length) {
    if (i + 1 < texto.length) {
      saida.push(Number(texto.slice(i, i + 2)) + 130);
      i += 2;
    } else {
      saida.push(texto.charCodeAt(i) + 1);
      i += 1;
    }
  }
  return saida;
};

/** O modo ASCII: o valor mais um. */
const ascii = (texto) => [...texto].map((c) => c.charCodeAt(0) + 1);

const casos = [
  {
    nome: 'so texto, controlo',
    codewords: ascii('MAST-2024'),
  },
  {
    nome: 'FNC1 no inicio',
    codewords: [FNC1, ...ascii('MAST-2024')],
  },
  {
    nome: 'FNC1 no inicio e a separar',
    codewords: [FNC1, ...ascii('MAST'), FNC1, ...ascii('2024')],
  },
];

const casosJson = casos.map((c) => {
  const codigo = dataMatrixDeCodewords(c.codewords, 'GS1 DataMatrix');
  return {
    nome: c.nome,
    codewords: c.codewords,
    /*
     * A mesma conversao que o `gerar-datamatrix.mjs` faz: os modulos como
     * booleanos viram 0 e 1.
     *
     * Nao por o Python se enganar - `True` vale 1 e `False` vale 0, e o
     * `renderizar` funcionaria com booleanos. A conversao e' para o **ficheiro**
     * ter o mesmo formato em todos os geradores: um `.json` com `true` e outro
     * com `1` para a mesma coisa sao dois formatos, e o que se lê a primeira nao
     * é-o a segunda.
     */
    modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
    colunas: codigo.colunas,
    linhas: codigo.linhas,
  };
});

writeFileSync(
  new URL('./.dm-fnc1.json', import.meta.url),
  JSON.stringify(casosJson),
  'utf8',
);

for (const c of casosJson) {
  console.log(`${c.nome}: ${c.codewords.length} codewords, ${c.colunas}x${c.linhas}`);
}
console.log(`\n${casosJson.length} casos em .dm-fnc1.json`);
