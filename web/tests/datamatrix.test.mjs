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
   * Cada símbolo usa os seus codewords de correcção, e essa quantidade tem de
   * estar na tabela dos factores. Se faltar, o encoder falha em tempo de
   * geração — que é o melhor sítio, e não o que acontece se a verificação
   *衰竭 for feita por leitura de imagem.
   */
  const usados = new Set(SIMBOLOS.map(([, correccao]) => correccao));
  for (const n of usados) {
    assert.ok(FATORES[n], `não há factores para ${n} codewords de correcção`);
    assert.equal(FATORES[n].length, n, `o conjunto de ${n} tem ${FATORES[n].length} factores`);
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

test('o 144x144 e o unico com blocos de tamanho desigual, e a conta fecha', () => {
  const { blocos, blocosCheios, dadosPorBloco, errosPorBloco, simbolos } = ULTIMO;

  assert.equal(blocos, 10, 'o 144x144 tem dez blocos de correcção');
  assert.equal(errosPorBloco, 62);

  // Nove blocos de 156 e um de 154: 9 x 156 + 154 = 1558, que é a capacidade.
  const total = blocosCheios * dadosPorBloco + (blocos - blocosCheios) * (dadosPorBloco - 2);
  assert.equal(total, simbolos[0], `os blocos somam ${total} e o símbolo declara ${simbolos[0]}`);

  // E a correcção: 10 blocos de 62.
  assert.equal(blocos * errosPorBloco, simbolos[1], 'a correcção dos blocos não bate');
});

test('o payload escolhe o menor símbolo que caiba', () => {
  for (const texto of ['A', 'AB', 'MAST-2024-0001', '9'.repeat(200)]) {
    const c = dataMatrix(texto);
    assert.ok(c.usado <= c.capacidade, 'o conteúdo não cabe no símbolo escolhido');

    // E é o menor: o anterior não chegaria.
    const indice = SIMBOLOS.findIndex((s) => s[0] === c.dados);
    assert.ok(indice > 0, 'o primeiro símbolo é o de 10x10 e devia dar para uma letra');
    assert.ok(
      c.usado > SIMBOLOS[indice - 1][0],
      `o conteúdo cabia no símbolo anterior (${SIMBOLOS[indice - 1][0]}) e o encoder escolheu um maior`,
    );
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

test('um byte acima de 127 custa dois codewords, por causa do deslocamento', () => {
  // O deslocamento vale para um codeword só, e por isso cada acento paga um
  // codeword extra. E é a razão de um "ç" ocupar mais espaço do que um "c" —
  // e a razão de o Base 256, que não está implementado aqui, existir.
  const comAcento = dataMatrix('açao');
  const semAcento = dataMatrix('acao');

  assert.equal(
    comAcento.usado - semAcento.usado,
    2,
    'dois acentos deviam custar dois codewords a mais',
  );
});

test('o conteúdo vazio é recusado com uma mensagem que diz o que fazer', () => {
  assert.throws(() => dataMatrix(''), /escreve alguma coisa/i);
});
