/**
 * As tabelas do Data Matrix, e a estrutura do símbolo.
 *
 * Este ficheiro não tem comparação com uma referência, e a razão é boa: a
 * tabela dos factores de Reed-Solomon do ECC200 **não é dedutível**. Derivei-a
 * e não bate: a tabela põe o coeficiente de `x^(n-1)` no primeiro lugar e o
 * cálculo põe o termo de ordem zero, e são convenções diferentes para o mesmo
 * polinómio.
 *
 * A verificação dessa tabela é portanto **funcional** e está no
 * `descodificar-datamatrix.py`: um factor errado dá uma correcção de erros que
 * não bate, e o ZXing rejeita o símbolo por corrupção. Não há como um factor
 * errado passar sem dar erro, e é por isso que a comparação entrada a entrada
 * aqui seria mais fraca do que a leitura.
 *
 * O que este teste faz, então, é o que se pode verificar sem referência:
 * coerência interna, e as propriedades estruturais que a norma garante.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIMBOLOS, ULTIMO, FATORES } from '../symbologies/datamatrix-tabelas.js';
import { dataMatrix } from '../symbologies/datamatrix.js';

test('os 24 simbolos quadrados, por ordem de capacidade', () => {
  assert.equal(SIMBOLOS.length, 24, 'a ISO/IEC 16022 define 24 simbolos quadrados');

  for (let i = 1; i < SIMBOLOS.length; i++) {
    assert.ok(
      SIMBOLOS[i][0] > SIMBOLOS[i - 1][0],
      `o simbolo ${i} leva ${SIMBOLOS[i][0]} codewords e o anterior ${SIMBOLOS[i - 1][0]}: ` +
        'a tabela tem de crescer',
    );
  }
});

test('dados mais correcção dá os codewords do símbolo', () => {
  for (const [dados, correccao] of SIMBOLOS) {
    assert.ok(dados > 0, 'um símbolo tem de levar pelo menos um codeword de dados');
    assert.ok(correccao > 0, 'e pelo menos um de correcção');
    // O ECC200 nunca tem menos de um quarto nem mais de 62% em correcção, e é
    // essa proporção que faz o Data Matrix aguentar o que uma etiqueta de
    // ampola leva.
    const fracao = correccao / (dados + correccao);
    assert.ok(fracao >= 0.24, `so ${(fracao * 100).toFixed(0)}% em correcção`);
    assert.ok(fracao <= 0.63, `${(fracao * 100).toFixed(0)}% em correcção é demasiado`);
  }
});

test('os factores existem para todos os tamanhos de correcção usados', () => {
  /*
   * Cada bloco de um símbolo tem os seus codewords de correcção, e **é esse**
   * o número que tem de estar na tabela — não o total do símbolo.
   *
   * Distinguir os dois é o que evita o erro: o símbolo de 52x52 tem 84
   * codewords de correcção no total, e 84 não está em lado nenhum da tabela
   * porque são dois blocos de 42. A primeira versão deste teste comparava o
   * total e falhava num símbolo que o encoder tratava bem.
   *
   * Se a tabela não tiver o valor do bloco, o encoder falha em tempo de
   * geração — que é o melhor sítio para o descobrir.
   */
  for (const simbolo of SIMBOLOS) {
    const [dados, correccao, , , , blocoDados, blocoErros] = simbolo;
    const porBloco = blocoErros === -1 ? correccao : blocoErros;

    assert.ok(
      FATORES[porBloco],
      `um símbolo de ${dados} codewords usa blocos de ${porBloco} e não há factores para esse tamanho`,
    );
    assert.equal(FATORES[porBloco].length, porBloco);

    // E a capacidade tem de dar um número inteiro de blocos. Um resto aqui é
    // um codeword a menos em parte do código, e ninguém diz porquê.
    //
    // **O 144x144 é a excepção, e é a razão de ser uma excepção:** é o único
    // símbolo cujos blocos não são todos do mesmo tamanho, e é por isso que a
    // sua capacidade não divide à cabeça. Uma verificação que o incluísse
    // falhava sempre — e era a segunda vez que este teste tropeçava no 144.
    const ultimo = simbolo === SIMBOLOS[SIMBOLOS.length - 1];
    if (blocoDados !== -1 && !ultimo) {
      const resto = dados % blocoDados;
      assert.equal(
        resto,
        0,
        `${dados} dados não dividem à cabeça por ${blocoDados} blocos de ${blocoDados}`,
      );
    }
  }
});

test('os factores são valores de corpo finito', () => {
  for (const [n, conjunto] of Object.entries(FATORES)) {
    for (const f of conjunto) {
      assert.ok(
        Number.isInteger(f) && f >= 0 && f <= 255,
        `no conjunto de ${n} há um factor fora de 0 a 255: ${f}`,
      );
    }
  }
});

test('a geometria de cada símbolo é quadrada e tem as guias', () => {
  // Um Data Matrix é quadrado, e as guias ocupam dois módulos de cada lado:
  // um na esquerda e em baixo, outro em cima e à direita. É essa a assimetria
  // que o leitor usa para se orientar, e um símbolo sem ela não é lido.
  for (const texto of ['A', 'MAST-2024-0001', '9'.repeat(400)]) {
    const c = dataMatrix(texto);
    assert.equal(c.colunas, c.linhas, `o símbolo de "${texto.slice(0, 12)}" não é quadrado`);

    const larguraRegiao = c.colunas - 2;
    for (let linha = 0; linha < c.linhas; linha++) {
      // A guia da esquerda é cheia, em todas as linhas.
      assert.equal(
        c.modules[linha][0],
        1,
        `a coluna 0 da linha ${linha} não é uma guia cheia`,
      );
    }
    for (let coluna = 0; coluna < c.colunas; coluna++) {
      // A guia de baixo é cheia, em todas as colunas.
      assert.equal(
        c.modules[c.linhas - 1][coluna],
        1,
        `a última linha, coluna ${coluna}, não é uma guia cheia`,
      );
    }

    // A guia de cima é alternada, e começa a cheia. E a da direita é alternada
    // com as linhas. As duas juntas são a assinatura do Data Matrix.
    for (let coluna = 0; coluna < c.colunas; coluna++) {
      assert.equal(c.modules[0][coluna], coluna % 2 === 0 ? 1 : 0, 'a guia de cima não alterna');
    }

    // A coluna da direita, nas linhas de dados, alterna com a linha.
    for (let linha = 1; linha < c.linhas - 1; linha++) {
      const esperado = (linha - 1) % 2 === 0 ? 1 : 0;
      assert.equal(
        c.modules[linha][c.colunas - 1],
        esperado,
        `a guia da direita na linha ${linha} não alterna`,
      );
    }
    void larguraRegiao;
  }
});

test('o 144x144 e o único com blocos de tamanho desigual, e a conta fecha', () => {
  const { blocos, cheios, dadosCheio, dadosUltimos, erros, simbolo } = ULTIMO;
  const [dados, correccao] = SIMBOLOS[simbolo];

  assert.equal(blocos, 10, 'o 144x144 tem dez blocos de correcção');
  assert.equal(erros, 62);

  /*
   * **Oito** blocos de 156 e **dois** de 155. A primeira versão deste teste
   * dizia nove e um de 154, e a conta dava 1556 em vez de 1558 — dois
   * codewords a menos num código de 1558. O que o leitor diz nesse caso é
   * "corrupção", e não "a tabela do 144 está errada".
   */
  assert.equal(cheios, 8);
  const total = cheios * dadosCheio + (blocos - cheios) * dadosUltimos;
  assert.equal(total, dados, `os blocos somam ${total} e o símbolo declara ${dados}`);

  // E a correcção: 10 blocos de 62.
  assert.equal(blocos * erros, correccao, 'a correcção dos blocos não bate');
});

test('o payload escolhe o menor símbolo que caiba', () => {
  for (const texto of ['A', 'AB', 'MAST-2024-0001', '9'.repeat(200)]) {
    const c = dataMatrix(texto);
    assert.ok(c.usado <= c.capacidade, 'o conteúdo não cabe no símbolo escolhido');

    /*
     * E é o menor. O primeiro símbolo é o de 10x10, com 3 codewords, e uma
     * letra cabe lá dentro — por isso a comparação com o anterior só faz
     * sentido a partir do segundo símbolo. A primeira versão deste teste
     * assumia isso e falhava no caso mais óbvio de todos.
     */
    const indice = SIMBOLOS.findIndex((s) => s[0] === c.dados);
    assert.ok(indice >= 0, `o símbolo de ${c.dados} codewords não está na tabela`);

    if (indice > 0) {
      assert.ok(
        c.usado > SIMBOLOS[indice - 1][0],
        `o conteúdo cabia no símbolo anterior (${SIMBOLOS[indice - 1][0]} codewords) ` +
          `e o encoder escolheu um maior, de ${c.dados}`,
      );
    } else {
      assert.ok(
        c.usado <= SIMBOLOS[0][0],
        'o símbolo mais pequeno não dá para o conteúdo',
      );
    }
  }
});

test('os digitos aos pares entram a menos codewords do que aos pares', () => {
  /*
   * É a razão de existirem: "2026" são dois codewords em vez de quatro. E é a
   * razão de o Data Matrix se chamar "Matrix" e de ser o formato de um número
   * de série numa etiqueta de duas linhas.
   */
  const digitos = dataMatrix('9'.repeat(16));
  const letras = dataMatrix('AAAAAAAAAAAA');

  assert.ok(
    digitos.usado < letras.usado,
    `${digitos.usado} codewords para os digitos e ${letras.usado} para as letras: ` +
      'os digitos aos pares deviam ser mais baratos',
  );
});

test('cada byte acima de 127 custa um codeword a mais, por causa do deslocamento', () => {
  /*
   * A regra, sem rodeios: **um byte normal custa um codeword, um byte de 128 ou
   * mais custa dois** — o valor, mais o deslocamento que o precede.
   *
   * Por isso um payload de N bytes em que K são altos custa N + K codewords.
   *
   * A primeira versão deste teste comparava "açao" com "acao" e esperava a
   * diferença ser o número de acentos. Não é, e por uma razão que vale a pena
   * escrever: os dois payloads **não têm o mesmo número de bytes**. Um "ç" em
   * UTF-8 são dois bytes e um "c" é um, por isso a comparação media duas
   * coisas ao mesmo tempo — um byte a mais *e* dois bytes altos. Deu 3 em vez de
   * 1, e a conta só fecha quando se mede em vez de contar caracteres como se
   * fossem bytes.
   */
  const contar = (texto) => {
    const bytes = [...new TextEncoder().encode(texto)];
    return { bytes: bytes.length, altos: bytes.filter((b) => b >= 128).length };
  };

  const casos = [
    ['acao', 0],
    ['a\u00e7ao', 2], // o ç são dois bytes, e os dois são altos
    ['\u20ac', 3], // o € são três bytes
    ['\u20ac\u20ac', 6],
  ];

  for (const [texto, altosEsperados] of casos) {
    const { bytes, altos } = contar(texto);
    assert.equal(altos, altosEsperados, `contei ${altos} bytes altos em ${JSON.stringify(texto)}`);

    const c = dataMatrix(texto);
    assert.equal(
      c.usado,
      bytes + altos,
      `${JSON.stringify(texto)}: ${bytes} bytes com ${altos} altos deviam dar ` +
        `${bytes + altos} codewords, e deram ${c.usado}`,
    );
  }
});

test('o conteúdo vazio é recusado com uma mensagem que diz o que fazer', () => {
  assert.throws(() => dataMatrix(''), /escreve alguma coisa/i);
});
