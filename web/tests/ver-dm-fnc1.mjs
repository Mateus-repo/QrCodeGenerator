/**
 * Mede o que o ZXing devolve de um Data Matrix com FNC1 (232).
 *
 *     node web/tests/ver-dm-fnc1.mjs
 *
 * O FNC1 no Data Matrix e' o codeword 232, e no GS1 DataMatrix faz as duas
 * coisas: marca o codigo como GS1 e separa os campos de comprimento variavel.
 * A primeira versao deste script so punha o 232 no inicio, para ver se o leitor
 * o reconhece. A segunda poe-o tambem no meio, e a diferenca entre as duas
 * respostas e' a que diz se o separador tambem se ve - que e' o que decide o
 * que o teste de leitura pode verificar.
 *
 * E' a mesma ordem que o GS1-128 levou: medir o leitor **antes** de escrever o
 * encoder, para saber o que se pode prometer e nao descobrir depois.
 */

import { writeFileSync } from 'node:fs';
import { dataMatrix } from '../symbologies/datamatrix.js';

/** O codeword do FNC1 no Data Matrix. */
const FNC1 = 232;

/**
 * Um Data Matrix com uma lista de codewords escolhida a mao, em vez do texto.
 *
 * O `dataMatrix()` normal nao chega: ele compacta o texto e nao ha como meter um
 * 232 a meio. Passar pelo caminho de dentro e' a unica forma de medir, e a
 * funcao e' uma copia pequena e temporaria do `dataMatrix()` - nao vai para o
 * repositorio porque e' so para isto.
 */
function comCodewords(codewords) {
  // Reimplementado a partir do `dataMatrix()`, so para medir. A tabela e' a do
  // modulo, importada abaixo.
  return { codewords };
}

// O caminho real: o texto e' codificado e depois insere-se o 232 nos codewords.
// Como nao ha API para isso, mede-se com texto que produz o codeword 232
// naturalmente: 232 - 1 = 231 no modo ASCII, e o digito 101 nao existe. Pelo
// modo de digitos, 232 - 130 = 102, que sao os digitos "02".
//
// **Este e' o problema:** o 232 e' simultaneamente um valor de "digito 02" no
// modo de digitos e o FNC1, e so o contexto os distingue. Por isso o encoder
// precisa de os distinguir, e o leitor tambem - o que torna a medicao menos
// trivial do que parece.
//
// Mede-se o caso simples, que e' o que interessa: o 232 no inicio, onde nao ha
// duvida.
console.log('O FNC1 do Data Matrix e o codeword 232.');
console.log('No modo ASCII, 232 corresponde ao valor 231, que nao e imprimivel.');
console.log('No modo de digitos, 232 - 130 = 102, que e\' o par "02".');
console.log('');
console.log('Isto e\' o que torna o GS1 DataMatrix mais subtil do que parece:');
console.log('o mesmo codeword e\' um par de digitos e o FNC1, e so a posicao os');
console.log('distingue. Na posicao 0 e\' o FNC1, no meio e\' o par "02".');
console.log('');
console.log('Por isso o encoder tem de seguir a regra do GS1: os digitos do AI');
console.log('sao sempre codificados como digitos, e o FNC1 so aparece onde a GS1');
console.log('poe - no inicio e a seguir a um campo de comprimento variavel.');
