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
import { gs1_128 } from '../symbologies/gs1-128.js';
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

test('os AI vao SEMPRE no modo de digitos, e os valores conforme o AI', () => {
  /*
   * O `10` em modo de digitos e' 10 + 130 = 140. O `LOTE-A1` em ASCII e' o valor
   * de cada letra mais um, e o `L` e' 76 + 1 = 77.
   *
   * **A decisao e' do AI e nao do valor.** Um `(240)` pode ter um valor
   * alfanumerico que so em ASCII cabe; e um `(17)` so tem digitos mas o seu AI e'
   * numerico. Perguntar "o valor tem so digitos?" seria o jeito facil e errado,
   * porque mandaria o lote para o modo de digitos e o `LOTE` nao cabe la.
   */
  const c = gs1DataMatrix('(01)04012345678901(10)LOTE-A1');
  const pos10 = c.codewords.indexOf(140);

  assert.ok(pos10 > 0, 'o AI 10 esta no modo de digitos, como 140');
  // E logo a seguir vem o valor em ASCII, que comeca pelo 'L' + 1 = 77.
  assert.equal(c.codewords[pos10 + 1], 'L'.charCodeAt(0) + 1, 'o valor em ASCII');
});

test('o VALOR de um AI numerico vai no modo de digitos, aos pares', () => {
  /*
   * **Este teste e' a segunda metade do de cima, e o de cima nao a afirmava.**
   *
   * O `10` do AI vai no modo de digitos porque o encoder tem uma linha so para o
   * AI - `digitos(campo.ai)` - e essa linha nunca esteve dependente do AI. O
   * `numerico` do campo so decide o que acontece ao **valor**, e era esse o lado
   * que estava errado: a tabela do JavaScript escreve `t` e o codigo lia `tipo`, o
   * `undefined` nao dava erro, e **nenhum numero ia no modo de digitos**.
   *
   * **E o teste antigo passava com o bug**, porque afirmava `indexOf(140) > 0` -
   * que e' o AI, e o AI estava certo - e depois que o valor seguinte comecava pelo
   * `L`, num exemplo cujo valor (`LOTE-A1`) e' mesmo alfanumerico e por isso vai
   * em ASCII com e sem o bug. **O teste dizia "os AI e os valores numericos" e
   * nao tinha um unico caso com um valor numerico.**
   *
   * E' a terceira vez neste repositorio que um teste passa sem testar nada, e as
   * tres tem a mesma raiz: **o teste correu, e o que ele exercita nao era a peca
   * defeituosa.**
   *
   * ## O que se mede
   *
   * O GTIN-14 sao catorze digitos: **sete codewords** aos pares, e nao catorze. E
   * cada par e' `d1 * 10 + d2 + 130` - `04` da 132, `89` da 219.
   */
  const c = gs1DataMatrix('(01)04012345678901');

  // 232 e' o FNC1, 131 e' o `01` do AI, e depois vem o valor aos pares.
  assert.deepEqual(
    c.codewords,
    [232, 131, 134, 131, 153, 175, 197, 219, 131],
    'o GTIN-14 em sete codewords aos pares, e nao catorze',
  );

  // **O numero de codewords e' a propriedade que se lê sem decifrar nada**, e e' a
  // que denuncia o modo errado. Com o bug o mesmo GTIN dava dezassete codewords e
  // um simbolo 22x22 onde cabia um 16x16.
  assert.equal(c.usado, 9, 'o FNC1, o AI e sete codewords de valor');

  // **E o outro ramo da mesma decisao**: o valor de um AI alfanumerico vai em
  // ASCII, um codeword por caractere. O `LOTE-A1` do `10` sao sete codewords, e
  // nao quatro - que e' o que aconteceria se o `numerico` estivesse a dizer que
  // sim para todo o mundo. **Um ramo sem caso e' um ramo onde um erro custa meses**,
  // e os dois ramos precisam de um caso cada um.
  const comLote = gs1DataMatrix('(01)04012345678901(10)LOTE-A1');

  const posLote = comLote.codewords.indexOf(140) + 1;
  assert.equal(
    comLote.codewords.slice(posLote, posLote + 7).map((n) => String.fromCharCode(n - 1)).join(''),
    'LOTE-A1',
    'os sete caracteres do lote em ASCII, um por codeword',
  );
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

test('a recusa diz GS1 DataMatrix e nao GS1-128', () => {
  /*
   * **O `rotulo` existe por causa deste teste.** O `analisar` passou a ser o do
   * GS1-128, com o rotulo a dizer o formato; sem ele a mensagem de um GS1 DataMatrix
   * mandava a pessoa procurar o erro num codigo de barras, e **uma mensagem que
   * identifica o formato errado e' pior do que uma mensagem sem rotulo**.
   *
   * E o mesmo `analisar` e' o que mantem a validacao igual nos dois: um GS1-128 e
   * um GS1 DataMatrix com o mesmo campo valido tem de dar o mesmo veredicto. E' o
   * que o `provar-maximo-gs1-datamatrix.mjs` confirma para os 44 AIs de varios
   * componentes, e o que este teste afirma para um so.
   */
  /*
   * **O `assert.throws` casa a regex com `String(erro)`, que traz `Error: ` a
   * frente** - por isso que aqui se apanha o erro e se mede a `message`, e nao se
   * pune um `^` que nunca pode casar.
   *
   * E a propriedade afirmada e' o que a mensagem **nao** diz: um GS1 DataMatrix que
   * recusa a dizer "GS1-128" manda a pessoa procurar o erro num codigo de barras.
   */
  let recusa = null;
  try {
    gs1DataMatrix('(01)9501101530003');
  } catch (erro) {
    recusa = erro.message;
  }

  assert.ok(recusa !== null, 'o GTIN com treze digitos tem de ser recusado');
  assert.match(recusa, /^GS1 DataMatrix: /, 'o rotulo e o do GS1 DataMatrix');
  assert.doesNotMatch(recusa, /GS1-128/, 'e nunca o do GS1-128');

  // E o GS1-128 continua a dizer GS1-128, com o valor por omissao do rotulo. **Se o
  // `gs1_128` passasse a passar o rotulo a mao, este teste passava na mesma** - e
  // por isso que o que se afirma acima e' a recusa do GS1 DataMatrix, que e' o
  // caminho novo.
  let recusa128 = null;
  try {
    gs1_128('(01)9501101530003');
  } catch (erro) {
    recusa128 = erro.message;
  }

  assert.match(recusa128, /^GS1-128: /, 'o GS1-128 diz GS1-128');
});

test('um AI de varios componentes aceita o valor no comprimento TOTAL', () => {
  /*
   * **O `maximo` da tabela e' do ULTIMO componente, e o que se confere e' a SOMA.**
   *
   * A tabela so traz o do ultimo porque e' o que serve para **dividir** o valor: o
   * ultimo componente e' o que vai ate ao fim do texto. Para **conferir** o valor
   * faz falta a soma de todos, que e' o que o `comprimentoTotal` faz.
   *
   * | AI | formato | ultimo | total |
   * |---|---|---|---|
   * | `253` | `N3+N13[+X..17]` | 17 | **30** |
   * | `421` | `N3+N3+X..9` | 9 | **12** |
   *
   * Este ficheiro tinha o seu proprio `analisar`, e a copia usava o `maximo`. Sao
   * **44 AIs** em que isso recusava um valor que a GS1 aceita - e o GS1-128 aceitava
   * o mesmo texto, com o mesmo `analisar` depois da correccao.
   *
   * **O `253` e' o exemplo mais claro porque o `regex` deixa passar o valor todo**:
   * `N3+N13` mais ate 17 alfanumericos da 30, e `N30` de digitos satisfaz as duas
   * metades. Por isso que a recusa aqui e' do comprimento e nao do formato.
   */
  const trintaDigitos = '1'.repeat(30);

  // Aceita com 30, que e' a soma.
  assert.doesNotThrow(() => gs1DataMatrix(`(253)${trintaDigitos}`));

  // E recusa com 31, que e' a soma mais um. **O limite e' o mesmo nos dois formatos**,
  // e e' isso que a paridade entre o GS1-128 e o GS1 DataMatrix verifica.
  assert.throws(() => gs1DataMatrix(`(253)${'1'.repeat(31)}`), /aceita no maximo 30/);

  // O `421`, o outro da tabela, com a soma 12 e o ultimo 9.
  assert.doesNotThrow(() => gs1DataMatrix(`(421)${'1'.repeat(12)}`));
  assert.throws(() => gs1DataMatrix(`(421)${'1'.repeat(13)}`), /aceita no maximo 12/);
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
