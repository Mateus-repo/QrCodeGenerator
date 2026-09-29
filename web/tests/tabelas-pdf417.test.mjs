/**
 * As tabelas do PDF417, comparadas com as de referência.
 *
 * A tabela são 3 × 929 = 2787 entradas. É a maior de quantas há neste
 * repositório, e a razão de haver um ficheiro gerado (`gerar-tabela-pdf417.py`)
 * em vez de 2787 números escritos à mão é a mesma de sempre: números de
 * memória dão errado, e já deram três vezes.
 *
 * Este teste tem duas partes, e as duas importam por razões diferentes.
 *
 * A primeira é a comparação com a referência, entrada a entrada. Apanha o
 * erro de que precisamos de apanhar: um número transposto.
 *
 * A segunda não consulta ninguém. Cada padrão do PDF417 tem 17 módulos em oito
 * elementos — quatro barras e quatro espaços — e começa em barra e acaba em
 * espaço, e isso é verdade para os 2787 sem excepção. É a mesma lógica do
 * `contarCorridas` do Code 39: uma propriedade estrutural que a tabela tem de
 * cumprir, verificada sem depender de a referência estar certa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLUSTERS, EC, SUBMODOS, TRANSICOES } from '../symbologies/pdf417-tabelas.js';
import { pdf417, INICIO_PDF417, PARAGEM_PDF417 } from '../symbologies/pdf417.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const CAMINHO = join(aqui, '.tabelas-pdf417.json');

const temReferencia = existsSync(CAMINHO);

if (!temReferencia) {
  test('as tabelas de referencia do PDF417 estao disponiveis', () => {
    assert.fail(
      'falta web/tests/.tabelas-pdf417.json — corre "python web/tests/extrair-tabelas-pdf417.py" ' +
        '(precisa de "pip install pdf417gen")',
    );
  });
} else {
  const referencia = JSON.parse(readFileSync(CAMINHO, 'utf8'));

  test('PDF417: os tres clusters, entrada a entrada', () => {
    assert.equal(CLUSTERS.length, 3, 'sao tres clusters: 0, 3 e 6');
    for (const [i, cluster] of CLUSTERS.entries()) {
      assert.equal(cluster.length, 929, `o cluster ${i} tem ${cluster.length} codewords`);
      assert.deepEqual(
        cluster.map((v) => v),
        referencia.clusters[i],
        `o cluster ${i} nao bate com a referencia`,
      );
    }
  });

  test('PDF417: cada padrao tem 17 modulos, quatro barras e quatro espacos', () => {
    /*
     * A propriedade estrutural, sem consultar a referencia.
     *
     * Apanha a classe de erro do "doze elementos por caractere": um padrao com
     * a estrutura errada produz um codigo que se desenha com aspecto de estar
     * certo e que nenhum leitor decifra, porque o leitor conta os elementos
     * para saber onde acaba um cluster.
     */
    for (const [ci, cluster] of CLUSTERS.entries()) {
      for (const [codigo, padrao] of cluster.entries()) {
        const bits = Array.from({ length: 17 }, (_, i) => (padrao >> (16 - i)) & 1);

        assert.equal(bits.length, 17);
        assert.equal(bits[0], 1, `cluster ${ci} codeword ${codigo} nao comeca em barra`);
        assert.equal(
          bits[16],
          0,
          `cluster ${ci} codeword ${codigo} nao acaba em espaco: e o espaco de ` +
            'separacao, e sem ele os clusters colam-se',
        );

        const corridas = contarCorridas(bits);
        assert.equal(
          corridas.length,
          8,
          `cluster ${ci} codeword ${codigo} tem ${corridas.length} elementos, e devem ser 8`,
        );
        assert.equal(
          corridas.filter((c) => c.bit === 1).length,
          4,
          `cluster ${ci} codeword ${codigo} nao tem quatro barras`,
        );
        assert.equal(
          corridas.filter((c) => c.bit === 0).length,
          4,
          `cluster ${ci} codeword ${codigo} nao tem quatro espacos`,
        );
      }
    }
  });

  test('PDF417: os factores de Reed-Solomon, e quantos sao', () => {
    // Cada nivel tem 2^(nivel+1) factores. E esta propriedade que diz que os
    // nivel estao todos la: um nivel a menos, ou um factor a mais, e a
    // correccao de erros sai com o tamanho errado e o leitor recusa o codigo.
    const esperados = [2, 4, 8, 16, 32, 64, 128, 256, 512];

    assert.equal(EC.length, 9, 'sao nove niveis, de 0 a 8');
    for (const [nivel, factores] of EC.entries()) {
      assert.equal(
        factores.length,
        esperados[nivel],
        `o nivel ${nivel} tem ${factores.length} factores, e sao ${esperados[nivel]}`,
      );
      assert.equal(factores.length, 2 ** (nivel + 1), 'o nivel tem 2^(nivel+1) factores');
      for (const f of factores) {
        assert.ok(f >= 0 && f < 929, `factor ${f} fora do modulo 929`);
      }
    }
    assert.deepEqual(EC.map((n) => [...n]), referencia.ec);
  });

  test('PDF417: os submodos do modo texto, e os seus valores', () => {
    /*
     * O mapa tem de bater com a referência, caractere a caractere — e **não**
     * pode ser conferido pela posição.
     *
     * A primeira versão guardava os submodos como cadeias ordenadas e tirava o
     * valor da posição, o que é verdade em UPPER e LOWER e falso em MIXED: lá
     * o valor 25 não é usado, e o espaço vale 26. O espaço saía com 25, o
     * código desenhava-se bem e o ZXing lia um caractere trocado sem dar erro.
     *
     * Por isso o teste vai ao valor, e nunca ao índice.
     */
    for (const [modo, caracteres] of Object.entries(SUBMODOS)) {
      const esperado = referencia.characters[modo];
      assert.deepEqual(
        { ...caracteres },
        esperado,
        `o submodo ${modo} nao bate com a referencia`,
      );

      // E nenhum valor repetido, que daria dois valores para a mesma letra.
      const valores = Object.values(caracteres);
      assert.equal(
        new Set(valores).size,
        valores.length,
        `${modo} tem valores repetidos: um caractere ambíguo`,
      );
    }
  });

  test('PDF417: o espaco vale 26 em todos os submodos onde existe', () => {
    // Este é o caso concreto que a cadeia ordenada errou. Vale a pena um teste
    // só para ele, porque é discreto: um valor a menos num caractere comum não
    // dá erro nenhum, dá uma letra errada.
    for (const modo of ['UPPER', 'LOWER', 'MIXED']) {
      assert.equal(
        SUBMODOS[modo][' '],
        26,
        `no submodo ${modo} o espaco não vale 26, e ${SUBMODOS[modo][' ']} não é o mesmo`,
      );
    }
  });

  test('PDF417: os valores de um submodo não são as posições de uma lista', () => {
    /*
     * A propriedade que justifica o mapa. Se algum submodo tivesse um buraco,
     * os valores não seriam as posições, e era preciso guardá-los um a um.
     */
    for (const [modo, caracteres] of Object.entries(SUBMODOS)) {
      const ordenados = Object.keys(caracteres).sort((a, b) => caracteres[a] - caracteres[b]);
      for (const [posicao, c] of ordenados.entries()) {
        if (caracteres[c] !== posicao) {
          // Isto é o que acontece no MIXED, e é o motivo de o mapa existir.
          assert.equal(
            modo,
            'MIXED',
            `só o MIXED é que tem buracos, e o submodo ${modo} tem um em "${c}"`,
          );
          return;
        }
      }
    }
  });

  test('PDF417: as transicoes de submodo, com uma ou duas entradas', () => {
    for (const [origem, destinos] of Object.entries(referencia.switchCodes)) {
      for (const [destino, codigos] of Object.entries(destinos)) {
        const chave = `${origem}_${destino}`;
        assert.ok(TRANSICOES[chave], `falta a transicao ${chave}`);
        assert.deepEqual(
          TRANSICOES[chave],
          codigos,
          `a transicao ${chave} nao bate com a referencia`,
        );
        assert.ok(
          codigos.length === 1 || codigos.length === 2,
          `a transicao ${chave} tem ${codigos.length} codigos: ou um, ou dois`,
        );
      }
    }

    // E sao doze: quatro submodos, tres destinos, sem transicao para si proprio.
    assert.equal(Object.keys(TRANSICOES).length, 12);
  });

  test('PDF417: os padroes de inicio e de paragem, e as suas dimensoes', () => {
    /*
     * O de início tem 17 módulos, como qualquer cluster. O de paragem tem 18 —
     * **e acaba em barra, não em espaço.** Essa diferença é o que fecha o
     * código, e é o contrário do que se espera: um reader de códigos de barras
     * está habituado a ver os padrões terminados em espaço, e aqui o último
     * módulo é escuro.
     *
     * A primeira versão deste teste afirmava que acabava em espaço, porque era
     * o que um cluster normal faz. Um cluster normal não é o que está no fim
     * do PDF417.
     */
    const bits = (v, n) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1);

    assert.equal(INICIO_PDF417, 0x1fea8);
    assert.equal(PARAGEM_PDF417, 0x3fa29);

    const inicio = bits(INICIO_PDF417, 17);
    assert.equal(inicio[0], 1, 'o inicio comeca em barra');
    assert.equal(inicio[16], 0, 'o inicio acaba em espaco, como qualquer cluster');
    assert.equal(contarCorridas(inicio).length, 8, 'o inicio tem a estrutura de um cluster');

    const paragem = bits(PARAGEM_PDF417, 18);
    assert.equal(paragem.length, 18, 'a paragem tem 18 modulos, um a mais que um cluster');
    assert.equal(paragem[0], 1, 'a paragem comeca em barra');
    assert.equal(
      paragem[17],
      1,
      'a paragem acaba em barra, e nao em espaco: e esse o modulo que fecha o codigo',
    );
  });

  test('PDF417: um codigo simples tem as dimensoes que a norma obriga', () => {
    const codigo = pdf417('https://exemplo.pt', { colunas: 4, nivel: 2 });

    assert.ok(codigo.linhas >= 3, `um PDF417 tem pelo menos 3 linhas, e tem ${codigo.linhas}`);
    assert.ok(codigo.linhas <= 90, `e no máximo 90, e tem ${codigo.linhas}`);
    assert.equal(codigo.colunas, 4);

    // A largura de uma linha e um cluster por codeword, e nao tres.
    //
    // Ha quem descreva o PDF417 como "tres clusters por codeword", e a primeira
    // versao deste teste usava essa conta e dava 273 modulos em vez de 137. A
    // estrutura e de um cluster por codeword: o inicio, o indicador da
    // esquerda, um por codeword de dados, o da direita e a paragem. E a
    // paragem tem 18 modulos em vez de 17, e e esse o mais que a conta
    // esqueca.
    // Quatro clusters fixos (início, indicador esquerdo, indicador direito e
    // paragem), um por codeword de dados, e o módulo a mais da paragem.
    const largura = (codigo.colunas + 4) * 17 + 1;
    assert.equal(
      codigo.modules[0].length,
      largura,
      `a linha tem ${codigo.modules[0].length} modulos, e a formula da ${largura}`,
    );
  });

  test('PDF417: todas as linhas têm a mesma largura', () => {
    /*
     * Uma linha mais estreita que as outras e um codigo que o leitor recusa,
     * e recusa sem dizer porque. E o enchimento que evita: ele existe para que
     * o total de codewords caiba exacto nas colunas.
     */
    for (const texto of ['A', 'https://exemplo.pt/painel/2026/09', 'X'.repeat(200)]) {
      for (let colunas = 1; colunas <= 10; colunas++) {
        const codigo = pdf417(texto, { colunas, nivel: 3 });
        const larguras = new Set(codigo.modules.map((linha) => linha.length));
        assert.equal(
          larguras.size,
          1,
          `colunas ${colunas}: larguras ${[...larguras].join(', ')} para "${texto.slice(0, 20)}"`,
        );
      }
    }
  });
}

/** Quantas corridas tem a linha, e de que cor. */
function contarCorridas(bits) {
  const saida = [];
  let atual = bits[0];
  let n = 0;
  for (const bit of bits) {
    if (bit === atual) n += 1;
    else {
      saida.push({ bit: atual, largura: n });
      atual = bit;
      n = 1;
    }
  }
  saida.push({ bit: atual, largura: n });
  return saida;
}
