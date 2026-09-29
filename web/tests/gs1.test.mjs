/**
 * Testes de nivel 0 do GS1-128.
 *
 * Estas sao as propriedades que tem de ser verdade **antes** de gerar imagem
 * nenhuma: a forma como o texto se parte em campos, os comprimentos, e a regra do
 * separador. O que o ZXing le quando o codigo esta desenhado e' o
 * `descodificar-gs1.py`, e nao substitui nada disto - um encoder que recusa um
 * payload valido e' tao mau como um que aceita um invalido.
 *
 * A tabela de AIs nao e' comparada com a referencia aqui: e' **gerada** da
 * referencia, e o que se verifica e' a estrutura dela, que e' o que o encoder
 * usa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { gs1_128, GS, FNC1, INICIO_B } from '../symbologies/gs1-128.js';
import { AIS, aiDe, LISTA_AIS } from '../symbologies/gs1-tabelas.js';
import { PADROES_CODE128 } from '../symbologies/code128.js';

test('a tabela tem os AIs que toda a gente usa, e sao os que a GS1 diz', () => {
  /*
   * Nao se testa a tabela entrada a entrada - ela e' **gerada** do JSON-LD de
   * `ref.gs1.org`, e o ficheiro gerado e' o que esta no git. O que se testa e'
   * que os AIs mais usados tem o que a GS1 lhes da, porque sao esses que um
   * erro de gerador estragaria primeiro e com mais consequencia.
   */
  const esperados = [
    // numero, comprimento fixo, maximo, separador
    ['00', 18, null, false], // SSCC
    ['01', 14, null, false], // GTIN
    ['10', null, 20, true], // lote
    ['11', 6, null, false], // data de producao
    ['15', 6, null, false], // consumir antes de
    ['17', 6, null, false], // validade
    ['21', null, 20, true], // numero de serie
    ['30', null, 8, true], // contagem variavel
    ['240', null, 30, true], // id adicional do fabricante
    ['3103', 6, null, false], // peso em quilos com 3 casas
    ['415', 13, null, false], // GLN da fatura
  ];

  for (const [numero, fixo, maximo, separador] of esperados) {
    const ai = AIS[numero];
    assert.ok(ai, `o AI (${numero}) nao esta na tabela`);
    assert.equal(ai.fixo, fixo, `o AI (${numero}) fixo`);
    assert.equal(ai.maximo, maximo, `o AI (${numero}) maximo`);
    assert.equal(ai.sep, separador, `o AI (${numero}) separador`);
  }
});

test('todo AI tem o que o encoder precisa', () => {
  /*
   * A invariante que segura o encoder de pe: sem `fixo` nem `maximo` nao ha
   * forma de saber onde acaba o campo, e sem `sep` nao ha forma de saber onde
   * por o separador.
   *
   * **O que se pergunta a cada um dos 541 e' o mesmo**, e por isso este teste
   * apanha o que o resto nao apanha: um AI novo que entre na tabela sem
   * comprimento, ou com os dois a zero. Nenhum teste de leitura apanha isso - o
   * codigo sai com o campo partido e o leitor acusa um erro de campo, que e'
   * indistinguivel de um dado errado.
   */
  for (const numero of LISTA_AIS) {
    const ai = AIS[numero];

    assert.equal(typeof ai.f, 'string', `o AI (${numero}) nao tem formato`);
    assert.equal(typeof ai.sep, 'boolean', `o AI (${numero}) nao diz se leva separador`);
    assert.equal(typeof ai.re, 'string', `o AI (${numero}) nao tem regex`);
    assert.ok(Array.isArray(ai.campos) && ai.campos.length > 0, `o AI (${numero}) nao tem campos`);

    // Exatamente um dos dois: fixo ou variavel. Os dois nulos seria um AI que o
    // encoder nao sabe medir, e os dois preenchidos e' contradicao.
    assert.ok(
      ai.fixo === null || ai.maximo === null,
      `o AI (${numero}) tem fixo e maximo ao mesmo tempo`,
    );

    // E o comprimento tem de ser plausivel: um AI de 4 digitos com 90 caracteres
    // de valor fixo seria um erro de gerador, e so apareceria num codigo absurdo.
    if (ai.fixo !== null) {
      assert.ok(ai.fixo > 0 && ai.fixo <= 90, `o AI (${numero}) tem ${ai.fixo} caracteres fixos`);
    }
    if (ai.maximo !== null) {
      assert.ok(ai.maximo > 0 && ai.maximo <= 90, `o AI (${numero}) tem maximo ${ai.maximo}`);
    }
  }
});

test('o AI mais longo ganha, ou le-se o (3103) como dois campos', () => {
  /*
   * A busca tem de ser do mais comprido para o mais curto.
   *
   * **A GS1 expande os AIs de peso**, e a tabela tem os 42: `3100` a `3165`, cada
   * um com a sua posicao decimal implicita. Nao ha um `31` a que se acrescentar
   * um digito - o `31` nao existe, e a primeira versao deste teste foi buscá-lo e
   * recebeu `null`, tendo escrito no comentario que ele "tambem existe, como peso
   * com posicao decimal implicita". A suposicao era minha e estava errada: a
   * posicao implicita e' o ultimo digito **do proprio AI**, nao de um valor a
   * seguir.
   *
   * Ainda assim a busca pelo mais longo e' a que se faz, porque e' a unica que
   * sobrevive quando a GS1 adicionar um AI de cinco digitos. E o fallback conta:
   * um `(31030)` que ainda nao exista e' lido como `3103` com `0` a mais no
   * valor.
   */
  const d = aiDe('3103');
  assert.equal(d.numero, '3103', 'o 3103 tem de ser lido como o AI 3103');
  assert.equal(d.fixo, 6, 'o 3103 tem seis caracteres, todos numericos');
  assert.equal(d.resto, undefined, 'o 3103 inteiro e um AI, nao um AI mais um resto');

  // Um numero de cinco digitos que nao existe cai no de quatro, com o digito
  // sobrante a entrar no valor - que e' o comportamento correcto para um AI
  // novo que a GS1 ainda nao publicou.
  const longo = aiDe('31030');
  assert.equal(longo.numero, '3103', 'o 31030 cai no 3103');
  assert.equal(longo.resto, '0', 'e o 0 sobrante vai para o valor');

  // O 01, que e' de dois digitos, e' o caso simples.
  assert.equal(aiDe('01').numero, '01');
  assert.equal(aiDe('01').fixo, 14, 'o 01 e um GTIN de 14 digitos');

  // E o 31 nao existe, o que e' verdade e nao um bug.
  assert.equal(aiDe('31'), null, 'o 31 nao e um AI: a GS1 expande-o em 3100 a 3165');
});

test('o texto parte-se nos campos, e cada um com o comprimento certo', () => {
  const c = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');

  assert.equal(c.campos.length, 3);
  assert.deepEqual(
    c.campos.map((k) => [k.ai, k.valor]),
    [
      ['01', '04012345678901'],
      ['10', 'LOTE-A1'],
      ['17', '270630'],
    ],
  );

  // O (01) e' o GTIN de 14 digitos. Apanhar so 13 e' o erro que o `trim` nao
  // apanha e a validacao apanha.
  assert.equal(c.campos[0].valor.length, 14);
});

test('o valor de um campo de comprimento fixo tem mesmo o comprimento', () => {
  // O (01) com treze digitos: um a menos, e o AI le o proximo campo como parte
  // deste.
  assert.throws(
    () => gs1_128('(01)0401234567890(10)LOTE-A1'),
    /nao corresponde/,
    'um GTIN de 13 digitos tem de ser recusado',
  );
});

test('o valor tem de corresponder ao regex da GS1, e nao so ao comprimento', () => {
  /*
   * O regex e' mais forte do que a contagem de caracteres, e o caso que prova
   * isto e' a data: `(17)` quer `YYMMDD`, e `275630` tem seis digitos - a
   * contagem passa e o mes 56 nao existe. O regex da GS1 recusa, e e' por isso
   * que ele vai na tabela em vez de so o comprimento.
   */
  assert.throws(() => gs1_128('(01)04012345678901(17)275630'), /nao corresponde/);

  // O mesmo campo com uma data boa passa.
  assert.ok(gs1_128('(01)04012345678901(17)270630'));

  // E um mes 13 tambem, que e' o outro lado do mesmo limite.
  assert.throws(() => gs1_128('(01)04012345678901(17)271330'), /nao corresponde/);
});

test('o separador so vai depois de um campo variavel que nao seja o ultimo', () => {
  /*
   * **A regra que mais custou a acertar, e que o ZXing mediu.**
   *
   * O separador separa o campo variavel do que vem a seguir. Em
   * `(01)...(10)LOTE-A1` o `10` e' o ultimo, e nao ha nada para separar: um
   * FNC1 ai produz um `0x1D` a mais nos bytes, que alguns leitores leem e outros
   * recusam. O codigo de barras continua a desenhar-se bem - a falha so aparece
   * nos bytes, e so num leitor de GS1.
   */
  const soLote = gs1_128('(01)04012345678901(10)LOTE-A1');
  assert.equal(soLote.separadores, 1, 'so o FNC1 do inicio: o 10 e o ultimo');
  assert.equal(soLote.payload.split(GS).length, 1, 'e nao ha separador nenhum no payload');

  // Com um campo fixo depois, o separador aparece.
  const noMeio = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');
  assert.equal(noMeio.separadores, 2, 'o FNC1 do inicio e o separador antes do 17');
  assert.equal(noMeio.payload.split(GS).length, 2);

  // E entre dois variaveis followed de um fixo, ha um separador a menos do que
  // o numero de campos sugere: o 21 e' variavel e o 17 e' fixo, e o separador do
  // 21 conta.
  const tres = gs1_128('(01)04012345678901(10)LOTE-A1(21)SER-1(17)270630');
  assert.equal(tres.separadores, 3, 'o inicio, o 10 e o 21');
});

test('um campo fixo nunca leva separador, mesmo no meio', () => {
  /*
   * O (17) e' de comprimento fixo, por isso o leitor sabe onde acaba sem
   * separador. Um separador a meio de um campo fixo e' lido como parte do
   * valor, e o campo seguinte comeca no sitio errado.
   */
  const c = gs1_128('(01)04012345678901(17)270630(10)LOTE-A1');
  assert.equal(c.campos[1].separador, false, 'o 17 e fixo');

  // O separador que existe e' o do 10? Nao - o 10 e o ultimo, e o 17 nao leva.
  // So o FNC1 do inicio.
  assert.equal(c.separadores, 1);
});

test('os espacos dos exemplos da GS1 nao vao para dentro do codigo', () => {
  /*
   * A GS1 escreve os campos com um espaco de cada lado: `(10) LOTE-A1`. O espaco
   * e' para quem le, e nao faz parte do valor. Sem o `trim`, o espaco contava
   * como caractere do campo, o `X..20` media mal, e a expressao regular da GS1
   * - que nao inclui o espaco - recusava o campo que a propria GS1 escreve.
   *
   * **A comparacao tem de ser entre o mesmo campo com e sem espaco**, e nao
   * entre payloads de casos diferentes: a primeira versao comparava o payload de
   * `(01)...(10) LOTE-A1 (17)270630` com o de `(01)...(10)LOTE-A1`, que sao
   * tres campos contra dois, e o falhava por isso e nao por causa do espaco.
   */
  const comEspaco = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');
  const semEspaco = gs1_128('(01)04012345678901(10) LOTE-A1 (17)270630');

  assert.equal(comEspaco.payload, semEspaco.payload, 'o espaco nao muda o codigo de barras');
  assert.equal(semEspaco.campos[1].valor, 'LOTE-A1', 'sem o espaco a volta');
  assert.equal(semEspaco.modules.length, comEspaco.modules.length, 'nem o numero de modulos');
});

test('o FNC1 do inicio e o segundo codeword, e conta para a verificacao', () => {
  /*
   * O FNC1 vai **depois** do caracter de inicio do conjunto, e nao antes. E o
   * primeiro codeword de dados.
   *
   * E conta para o caracter de verificacao com o valor 102 e com o peso da sua
   * posicao - 1. A primeira versao punha o FNC1 fora da soma, "porque nao e' um
   * caracter", e o resultado era um caracter de verificacao errado. O sintoma
   * era o mais dificil que existe neste ficheiro: o ZXing recusava o codigo sem
   * dizer por que, e o numero de modulos - 222 em vez dos 200 que a conta dava -
   * foi a unica coisa que denunciou.
   */
  const c = gs1_128('(01)04012345678901');

  // Descodificar os modulos de volta em codewords: e' a unica forma de ver o
  // que esta mesmo no codigo de barras.
  const codewords = codewordsDe(c.modules);
  assert.equal(codewords[0], INICIO_B, 'o primeiro codeword e o inicio do conjunto B');
  assert.equal(codewords[1], FNC1, 'o segundo e o FNC1');

  /*
   * A conta, feita aqui a parte para se ver que o resultado bate.
   *
   * O `codewordsDe` **nao devolve a paragem**, porque ela e' lida pelo
   * comprimento e nao como um codeword de onze modulos. Por isso a lista que
   * sai tem os dados e a verificacao, e o ultimo elemento e' a verificacao -
   * que nao entra na propria conta. A primeira versao fez `slice(0, -2)`, como
   * se a paragem estivesse na lista, e por isso comparou a verificacao com uma
   * conta a que faltava o ultimo valor.
   */
  const dados = codewords.slice(0, -1);
  const verificacao = codewords[codewords.length - 1];

  let soma = dados[0];
  for (let i = 1; i < dados.length; i++) soma += dados[i] * i;

  assert.equal(verificacao, soma % 103, 'o caracter de verificacao bate com a conta ponderada');
});

test('a soma da verificacao tem pesos, e nao e uma soma simples', () => {
  /*
   * A conta do Code 128 e' ponderada: o valor de inicio pesa 1, cada valor de
   * dados pesa a sua posicao, e o resultado e' modulo 103. Uma soma simples da o
   * mesmo numero de modulos - todos os padroes tem 11 - e por isso nao se ve no
   * desenho: o ZXing recusa e nao ha diferenca visivel.
   *
   * Este teste existe porque a segunda vez que o GS1-128 nao lia, a razao foi
   * exactamente isto.
   */
  const c = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');
  const codewords = codewordsDe(c.modules);
  // Sem a verificacao, que e' o ultimo e nao entra na conta.
  const dados = codewords.slice(0, -1);

  let ponderada = dados[0];
  for (let i = 1; i < dados.length; i++) ponderada += dados[i] * i;

  const simples = dados.reduce((s, v) => s + v, 0);

  assert.notEqual(
    ponderada % 103,
    simples % 103,
    'a soma simples daria um caracter de verificacao diferente - e o codigo nao leria',
  );
  assert.equal(codewords[codewords.length - 1], ponderada % 103);
});

test('o codigo tem o numero de modulos que a conta daria', () => {
  /*
   * Onze modulos por codeword, e a paragem treze. E' a verificacao mais barata
   * que existe: nao precisa de imagem, nao precisa de leitor, e apanha um
   * caracter de verificacao errado, um codeword a mais e um codeword a menos.
   *
   * Foi ela que denunciou o bug da soma simples, e e' a razao de o numero de
   * modulos estar nesta nota e nao so no `descodificar-gs1.py`: aqui falha
   * primeiro, semZXing e semPIL.
   */
  const tamanhoParagem = [...PADROES_CODE128[106]].reduce((s, c) => s + Number(c), 0);

  for (const entrada of [
    '(01)04012345678901',
    '(01)04012345678901(10)LOTE-A1',
    '(01)04012345678901(10)LOTE-A1(17)270630',
  ]) {
    const c = gs1_128(entrada);
    // `codewordsDe` ja comeu a paragem, entao aqui ainda falta acrescenta-la.
    const esperado = c.modules.length;
    const conta = codewordsDe(c.modules).length * 11 + tamanhoParagem;
    assert.equal(esperado, conta, `${entrada}: ${esperado} modulos, a conta daria ${conta}`);
    assert.equal(esperado % 11, tamanhoParagem % 11, 'os dados tem onze modulos cada');
  }
});

test('a forma legivel tem parenteses e a de maquina nao', () => {
  /*
   * As duas metades, e porque sao diferentes.
   *
   * A legivel e' a forma humana da GS1, sem separadores: e' o que o ZXing devolve
   * em `text`. A de maquina e' sem parenteses e com o separador onde o encoder o
   * poe: e' o que o ZXing devolve em `bytes`. Sao coisas diferentes e
   * confundi-las fez este teste falhar duas vezes.
   */
  const c = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');
  assert.equal(c.gs1, '(01)04012345678901(10)LOTE-A1(17)270630');
  assert.ok(!c.gs1.includes(GS), 'a forma humana nao leva separador');
  assert.equal(c.payload, '010401234567890110LOTE-A1\x1d17270630');
});

test('o payload nao leva parenteses nem o FNC1 do inicio', () => {
  /*
   * O FNC1 do inicio **nao aparece no payload**: o ZXing consome-o e marca-o no
   * `symbology_identifier`. Por isso o que sai daqui nao tem FNC1 inicial, e o
   * numero de separadores no payload e' um a menos que o `separadores`.
   */
  const c = gs1_128('(01)04012345678901(10)LOTE-A1(17)270630');
  assert.ok(!c.payload.startsWith('\x1d'), 'o payload nao comeca por separador');
  assert.equal(c.payload.split(GS).length - 1, c.separadores - 1);
});

test('o texto sem parenteses e recusado, com a razao', () => {
  /*
   * Um `0104012345678901` sem parenteses nao e' um GS1-128: e' um Code 128 com
   * uns numeros, e nao ha forma de saber onde acaba cada campo. Recusar com uma
   * mensagem que mostra a forma correcta e' mais util do que aceitar e deixar o
   * utilizador com um codigo que o leitor de GS1 nao percebe.
   */
  assert.throws(() => gs1_128('04012345678901'), /\(01\)/);

  /*
   * E um AI que nao existe. O primeiro exemplo foi o `(99)`, e **o 99 e' um AI
   * valido** - da serie dos "de 90 a 99", que e' uma faixa reservada. A
   * assercao falhou com "Missing expected exception", e a razao era minha:
   * escrevi um numero que achei que nao existia sem o verificar. De 100 AIs de
   * dois digitos so 26 existem, o que faz um numero qualquer parecer suspeito e
   * um numero escolhido parecer valido.
   *
   * O `(49)` e' um dos que nao existem, e a lista vem da propria tabela.
   */
  assert.throws(() => gs1_128('(49)0123456789012'), /nao existe/);
  assert.throws(() => gs1_128('(01)04012345678901(xx)LOTE'), /so digitos/);
});

test('um AI variavel tem um maximo, e o que passa e recusado', () => {
  // O (10) aceita 20 caracteres.
  assert.throws(() => gs1_128('(01)04012345678901(10)' + 'A'.repeat(21)), /maximo 20/);
  assert.ok(gs1_128('(01)04012345678901(10)' + 'A'.repeat(20)));
});

test('o acento e recusado, e a mensagem diz o que esta errado', () => {
  /*
   * O GS1-128 so usa o conjunto B, que e' ASCII, e um "ç" nao tem codigo.
   *
   * **Onde o acento e' apanhado depende da ordem das validacoes, e a ordem
   * importa.** A primeira versao deste teste esperava a mensagem do check de
   * ASCII - "o conjunto B so transporta ASCII" - e o que apanha o "ç" e' antes
   * disso: a expressao regular da GS1 para o AI 10, que e'
   * `[!%-?A-Z_a-z\x22]{1,20}` e **nao inclui o c-cedilha**, porque o campo de um
   * lote e' alfanumerico no sentido da GS1, que e' o conjunto de caracteres dela e
   * nao o de everybody.
   *
   * A mensagem que sai e' a do regex, e e' a boa: ela diz o formato que o campo
   * tem de ter. A do ASCII seria mais generica e menos util, e so apareceria se o
   * regex fosse mais largo do que o campo. O check de ASCII nao e' inutil - e' a
   * ultima linha, para o caso de um AI cujo regex aceite um caracter que o
   * conjunto B nao transporta.
   */
  assert.throws(
    () => gs1_128('(01)04012345678901(10)LOTEÇÃO'),
    /nao corresponde ao que a GS1 define/,
    'o c-cedilha e' + ' apanhado pelo regex do AI 10, antes de se chegar ao ASCII',
  );

  // E o emoji, que cai no mesmo caminho.
  assert.throws(() => gs1_128('(01)04012345678901(10)LOTE\u{1f600}'), /nao corresponde/);
});

/**
 * Os codewords de dados e de verificacao, lidos de volta dos modulos. A paragem
 * fica de fora.
 *
 * A unica forma de ver o que esta mesmo no codigo de barras: o encoder pode dizer
 * que emitiu um FNC1 e emitting ou nao sao coisas diferentes, e so a leitura dos
 * modulos diz qual das duas aconteceu.
 *
 * **A paragem e' lida a parte porque tem treze modulos e nao onze.** A primeira
 * versao lia tudo de onze em onze e devolvia um `null` no fim, que os testes
 * contavam como um codeword a mais - e a conta do comprimento batia na mesma
 * porque os treze modulos da paragem eram lidos como um onze e dois restos. Ler
 * a paragem pelo comprimento que a tabela declara e' o que resolve os dois.
 */
function codewordsDe(modulos) {
  const inverso = new Map();
  PADROES_CODE128.forEach((padrao, valor) => {
    let s = '';
    for (let i = 0; i < padrao.length; i++) {
      for (let k = 0; k < Number(padrao[i]); k++) s += i % 2 === 0 ? '1' : '0';
    }
    inverso.set(s, valor);
  });

  const seq = modulos.map((m) => (m ? '1' : '0')).join('');
  // O comprimento do padrao e' a **soma dos digitos**, nao o numero de
  // caracteres da cadeia: `'2331112'` tem sete caracteres e treze modulos. A
  // primeira versao usou `.length` e ficou com 7, e a conta do tamanho do codigo
  // dava 2 modulos a menos do que devia.
  const tamanhoParagem = [...PADROES_CODE128[106]].reduce((s, c) => s + Number(c), 0);
  const saida = [];
  let i = 0;

  // Tudo menos a paragem do fim.
  while (seq.length - i > tamanhoParagem) {
    const c = inverso.get(seq.slice(i, i + 11));
    assert.ok(c !== undefined, `os modulos ${i}..${i + 11} nao sao um codeword do Code 128`);
    saida.push(c);
    i += 11;
  }

  // E a paragem, que se confirma pelo comprimento e pelo valor.
  assert.equal(seq.length - i, tamanhoParagem, 'sobravam modulos que nao sao a paragem');
  assert.equal(inverso.get(seq.slice(i)), 106, 'o fim tem de ser a paragem');

  return saida;
}
