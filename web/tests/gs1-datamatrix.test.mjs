/**
 * Testes de nivel 0 do GS1 DataMatrix.
 *
 * As propriedades que tem de ser verdade **antes** de gerar imagem nenhuma: como o
 * texto se parte em campos, os codewords que cada um produz, e onde vai o FNC1.
 * O ZXing diz se o codigo esta certo; estes dizem *porquê* quando nao esta.
 *
 * A validacao dos AI e a tabela vem do GS1-128 e nao e' testada aqui - sao as
 * mesmas 541 entradas e o mesmo `aiDe`, e uma segunda bateria sobre elas seria
 * repetir. O que se testa e' o que o GS1 DataMatrix faz de diferente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { gs1DataMatrix, FNC1 } from '../symbologies/gs1-datamatrix.js';
import { dataMatrix, dataMatrixDeCodewords, FNC1_DATAMATRIX } from '../symbologies/datamatrix.js';

test('o FNC1 e o codeword 232, e no inicio', () => {
  assert.equal(FNC1, 232, 'o FNC1 do Data Matrix e o 232');
  assert.equal(FNC1, FNC1_DATAMATRIX, 'e o mesmo que o datamatrix.js exporta');

  const c = gs1DataMatrix('(01)04012345678901');
  assert.equal(c.codewords[0], FNC1, 'o primeiro codeword de dados e o FNC1');
});

test('o 232 e ambíguo com o par de digitos "02", e a posicao e que distingue', () => {
  /*
   * **Esta e' a razao de o GS1 DataMatrix nao poder passar pelo `compactar()`.**
   *
   * O modo de digitos emparelha e soma 130, entao o par "02" da 2 + 130 = 132.
   * O FNC1 e' o 232. Nao sao o mesmo numero, e por isso o encoder emite
   * codewords a compensa em vez de deixar o texto ser convertido: quem decide
   * o que e' FNC1 e' o encoder, pelo sitio onde o poe, e nao o modo de
   * codificacao.
   *
   * A razao de isto estar num teste e' que a solucao aparentemente ingenua - "poe
   * o texto '0104012345678901' e deixa o `compactar` tratar do resto" - produz um
   * codigo em que o 232 do separador e' lido como o par "02" do AI seguinte, e o
   * leitor da um campo a mais e um a menos. O codigo desenha-se bem e o leitor
   * nao diz nada.
   */
  const c = gs1DataMatrix('(01)04012345678901(10)LOTE-A1(17)270630');
  const posicoes = c.codewords
    .map((v, i) => (v === FNC1 ? i : -1))
    .filter((i) => i >= 0);

  // O FNC1 do inicio e um antes do (17), que e' o campo que vem depois do
  // variavel. Nao ha nenhum outro 232 no codigo.
  assert.equal(posicoes.length, 2, 'dois FNC1: o do inicio e o separador');
  assert.equal(posicoes[0], 0, 'o primeiro e o do inicio');

  // E o AI "01" e o "17" estao no modo de digitos, portanto nunca dao 232.
  // Se um deles desse 232, o leitor leria-o como separador.
  const semZero = c.codewords.filter((v) => v === FNC1).length;
  assert.equal(semZero, 2, 'nenhum AI numerico deu 232');
});

test('os AI e os valores numericos vao no modo de digitos, o resto em ASCII', () => {
  /*
   * O `10` em modo de digitos e' 10 + 130 = 140. O `LOTE-A1` em ASCII e' o valor
   * de cada letra mais um, e o `L` e' 76 - 1 = 75.
   *
   * **A decisao e' do AI e nao do valor.** Um `(240)` pode ter um valor
   * alfanumerico que so em ASCII cabe; e um `(17)` so tem digitos mas o seu AI e'
   * numerico. Perguntar "o valor tem so digitos?" seria o jeito facil e errado,
   * porque mandaria o lote para o modo de digitos e o `LOTE` nao cabe la.
   */
  const c = gs1DataMatrix('(01)04012345678901(10)LOTE-A1');
  const pos10 = c.codewords.indexOf(140);

  assert.ok(pos10 > 0, 'o AI 10 esta no modo de digitos, como 140');
  // E logo a seguir vem o valor em ASCII, que comeca pelo 'L' + 1 = 76.
  assert.equal(c.codewords[pos10 + 1], 'L'.charCodeAt(0) + 1, 'o valor em ASCII');
});

test('o separador so vai depois de um campo variavel que nao seja o ultimo', () => {
  /*
   * A mesma regra do GS1-128, e a mesma razao: um FNC1 no fim nao separa de nada
   * e produz um `0x1D` nos bytes que o leitor nao espera.
   */
  const soLote = gs1DataMatrix('(01)04012345678901(10)LOTE-A1');
  assert.equal(soLote.separadores, 1, 'so o FNC1 do inicio: o 10 e o ultimo');
  assert.equal(soLote.payload.split('\x1d').length, 1, 'e nao ha separador no payload');

  const noMeio = gs1DataMatrix('(01)04012345678901(10)LOTE-A1(17)270630');
  assert.equal(noMeio.separadores, 2, 'o do inicio e o separador antes do 17');
  assert.equal(noMeio.payload.split('\x1d').length, 2);
});

test('a forma legivel tem parenteses e a de maquina nao', () => {
  const c = gs1DataMatrix('(01)04012345678901(10)LOTE-A1(17)270630');
  assert.equal(c.gs1, '(01)04012345678901(10)LOTE-A1(17)270630');
  assert.equal(c.payload, '010401234567890110LOTE-A1\x1d17270630');
});

test('o texto sem parenteses e recusado, com a razao', () => {
  assert.throws(() => gs1DataMatrix('04012345678901'), /\(01\)/);
  assert.throws(() => gs1DataMatrix('(01)04012345678901(49)0123456789'), /nao existe/);
});

test('o valor tem de corresponder ao regex da GS1', () => {
  // O mes 56 nao existe, e o regex da GS1 recusa.
  assert.throws(() => gs1DataMatrix('(01)04012345678901(17)275630'), /nao corresponde/);
  // E um GTIN com um digito a menos tambem.
  assert.throws(() => gs1DataMatrix('(01)0401234567890(10)LOTE'), /nao corresponde/);
});

test('o caminho de codewords da a mesma matriz que o do texto', () => {
  /*
   * A opcao `codewords` do `dataMatrix()` foi acrescentada para o GS1, e uma
   * opcao que altera o resultado sem querer seria um bug silencioso. Este teste
   * e' a prova de que ela nao altera: a mesma lista de codewords passa pelos dois
   * caminhos e da a mesma matriz, modulo e modulo.
   *
   * Sem ele, uma alteracao futura no `montar()` - que partilha agora com o GS1 -
   * podia mexer no `compactar()` sem ninguem dar por isso, porque o teste de
   * leitura do Data Matrix so passa pelo caminho do texto.
   */
  const peloTexto = dataMatrix('MAST-2024');
  const pelosCodewords = dataMatrixDeCodewords(peloTexto.codewords);

  assert.deepEqual(pelosCodewords.modules, peloTexto.modules, 'a mesma matriz');
  assert.equal(pelosCodewords.colunas, peloTexto.colunas);
  assert.equal(pelosCodewords.linhas, peloTexto.linhas);
});

test('o GS1 DataMatrix escolhe o menor simbolo que caiba, como o Data Matrix', () => {
  for (const texto of [
    '(01)04012345678901',
    '(01)04012345678901(10)LOTE-A1',
    '(01)04012345678901(10)LOTE-A1(17)270630',
  ]) {
    const c = gs1DataMatrix(texto);
    assert.ok(c.usado <= c.capacidade, 'os codewords nao cabem no simbolo escolhido');
    assert.ok(c.modules.length > 0, 'a matriz tem linhas');
  }

  /*
   * E o menor, e nao o maior. Um GTIN com um lote curto tem de dar um simbolo
   * pequeno, porque num GTIN com 30 caracteres a diferenca e' o quadrado todo.
   *
   * O `colunas` e' a medida: o simbolo do GTIN sozinho e' menor do que o do
   * GTIN com lote, porque sao menos codewords. A primeira versao deste teste nao
   * existia e o primeiro sinal de que o `simboloPara` estava a escolher mal
   * tinha sido o ZXing a recusar um codigo que cabia - o que nao diz nada sobre
   * *que* simbolo foi escolhido.
   */
  const gtin = gs1DataMatrix('(01)04012345678901');
  const gtinComLote = gs1DataMatrix('(01)04012345678901(10)LOTE-A1');

  assert.ok(
    gtin.colunas < gtinComLote.colunas,
    `o GTIN sozinho deu ${gtin.colunas}x${gtin.colunas} e com lote ` +
      `${gtinComLote.colunas}x${gtinComLote.colunas}: o menor devia ser o primeiro`,
  );
});
