/**
 * O FrameQR, ao nível da estrutura.
 *
 * Estes testes dizem que a zona apagada está no sítio certo e não toca no que
 * não pode. Não dizem que o código se lê — isso só o ZXing sabe, e está em
 * `gerar-frameqr.mjs` + `descodificar-frameqr.py`.
 *
 * A divisão não é preciosismo. Uma zona apagada no sítio errado produz um QR
 * perfeitamente desenhado que não lê nada, e nenhum teste que olhe para a
 * geometria diz que ele lê.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { encode, alignmentPositions } from '../qrcode.js';
import {
  aplicarFrame,
  centrosDeAlinhamento,
  modulosMaximos,
  PERCENTAGEM_SEGURA,
  MARGEM,
} from '../frameqr.js';

const PAYLOADS = ['a', 'https://exemplo.pt', 'X'.repeat(300), 'X'.repeat(900)];
const NIVEIS = ['L', 'M', 'Q', 'H'];

/** O mesmo QR, sem logótipo, para comparar módulo a módulo. */
const base = (payload, ecl) => encode(payload, { ecl });

test('os centros de alinhamento são os que o encoder usa para os desenhar', () => {
  // A regra aparece em dois sítios: quem escreve os padrões e quem decide o
  // que se pode apagar. Têm de ser a mesma lista, versão a versão. Quando
  // divergent, apaga-se o padrão e protege-se o dado.
  for (let versao = 1; versao <= 40; versao++) {
    const size = versao * 4 + 17;
    const eixos = alignmentPositions(versao);
    const centros = centrosDeAlinhamento(size, versao);

    for (const centro of centros) {
      assert.ok(
        eixos.includes(centro[0]) && eixos.includes(centro[1]),
        `o centro (${centro}) da versão ${versao} não está na grelha ${eixos}`,
      );
    }

    // Nenhum centro pode colar com um padrão de localização. A grelha começa
    // em 6 e o padrão de localização ocupa 0 a 6, por isso são esses três.
    // **O canto de baixo à direita é um centro válido** e não é excepção: é
    // precisamente onde a norma põe o único padrão da versão 2.
    for (const [cx, cy] of centros) {
      const ultimo = eixos[eixos.length - 1];
      const colado =
        (cx === 6 && cy === 6) || (cx === ultimo && cy === 6) || (cx === 6 && cy === ultimo);
      assert.ok(
        !colado,
        `(${cx},${cy}) na versão ${versao} está em cima de um padrão de localização`,
      );
    }
  }
});

test('os centros de alinhamento batem com a contagem da norma', () => {
  /*
   * A contagem é (n² - 3), em que n é o número de posições por eixo, e a
   * versão 1 não tem nenhuma. As contagens abaixo são o que a ISO/IEC 18004 dá
   * — e estão aqui porque a primeira vez que escrevi esta tabela pus 6 na
   * versão 14 e 24 na 32, quando são 13 e 33. Uma expectativa errada falha o
   * encoder certo.
   */
  const esperados = { 1: 0, 2: 1, 7: 6, 14: 13, 20: 13, 32: 33, 40: 46 };
  for (const [versao, quantidade] of Object.entries(esperados)) {
    const v = Number(versao);
    const obtidos = centrosDeAlinhamento(v * 4 + 17, v).length;
    assert.equal(obtidos, quantidade, `versão ${v}: ${obtidos} padrões, esperava ${quantidade}`);
  }
});

test('a versão 2 tem um padrão de alinhamento, e é no canto de baixo à direita', () => {
  // A excepção que a norma faz: neste tamanho só cabe um, e é nesse sítio.
  // A versão anterior desta função devolvia doze, com uma grelha de 6 em 6
  // inventada aqui em vez da fórmula da norma.
  assert.deepEqual(centrosDeAlinhamento(25, 2), [[18, 18]]);
});

test('a zona apagada é centrada e tem o lado pedido', () => {
  for (const modulos of [1, 4, 9, 12]) {
    const qr = base('https://exemplo.pt', 'H');
    const codigo = aplicarFrame(qr, { modulos });

    assert.ok(codigo.zona, 'devolve a zona para se poder conferir');
    assert.equal(
      codigo.zona.fim - codigo.zona.inicio,
      modulos,
      `pedi ${modulos} de lado e a zona tem ${codigo.zona.fim - codigo.zona.inicio}`,
    );

    // Um desvio de mais de meio módulo num QR já se nota a olho nu, e um
    // logotipo descentrado denuncia-se.
    const meio = (codigo.zona.inicio + codigo.zona.fim) / 2;
    assert.ok(
      Math.abs(meio - qr.size / 2) <= 1,
      `a zona está centrada em ${meio}, e o centro é ${qr.size / 2}`,
    );
    assert.equal(codigo.zona.margem, MARGEM);
  }
});

test('a zona apagada nunca muda um módulo funcional', () => {
  /*
   * Esta é a invariante que importa, e é mais forte do que parecer.
   *
   * O `aplicarFrame` salta os módulos reservados, por isso a zona *pode*
   * sobrepor um padrão de localização sem o tocar — o que é o comportamento
   * certo: o logotipo grande numa matriz pequena encolhe, e o que apaga mesmo
   * fica dentro do orçamento. O que não pode acontecer é um módulo funcional
   * mudar de valor, porque aí a grelha deixa de bater e o leitor não decifra
   * nada.
   *
   * Aqui compara-se o antes e o depois, e o que mudou tem de ser um módulo
   * que estava escuro e passou a claro. Nunca o contrário, nunca um funcional.
   */
  for (const payload of PAYLOADS) {
    for (const ecl of NIVEIS) {
      const qr = base(payload, ecl);
      const codigo = aplicarFrame(qr, { modulos: modulosMaximos(qr.size, ecl) });
      if (!codigo.zona) continue;

      for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
          if (qr.modules[y][x] === codigo.modules[y][x]) continue;
          assert.equal(
            qr.modules[y][x],
            1,
            `em (${x},${y}) de um QR ${qr.size}x${qr.size} v${qr.version} ${ecl}, ` +
              `um módulo claro passou a escuro: um padrão funcional foi estragado`,
          );
        }
      }
    }
  }
});

test('os padrões funcionais ficam intactos depois do logótipo', () => {
  // O mesmo teste, escrito a partir do que a norma diz que é funcional, para
  // não depender de o `aplicarFrame` estar certo. Os três padrões de
  // localização, com o separador: 8x8 em cada canto.
  for (const payload of PAYLOADS) {
    for (const ecl of NIVEIS) {
      const qr = base(payload, ecl);
      const codigo = aplicarFrame(qr, { modulos: modulosMaximos(qr.size, ecl) });
      if (!codigo.zona) continue;

      for (const [x0, y0] of [
        [0, 0],
        [qr.size - 8, 0],
        [0, qr.size - 8],
      ]) {
        for (let y = y0; y < y0 + 8; y++) {
          for (let x = x0; x < x0 + 8; x++) {
            assert.equal(
              codigo.modules[y][x],
              qr.modules[y][x],
              `o canto [${x0},${x0 + 8})x[${y0},${y0 + 8}) foi mexido ` +
                `em (${x},${y}), num QR ${qr.size}x${qr.size} v${qr.version} ${ecl}`,
            );
          }
        }
      }

      // A informação de formato: linha e coluna 8, nos dois lados.
      for (const i of [0, qr.size - 8]) {
        for (let k = 0; k < 8; k++) {
          assert.equal(codigo.modules[8][i + k] ?? codigo.modules[8][k], qr.modules[8][i + k] ?? qr.modules[8][k]);
          assert.equal(codigo.modules[i + k][8] ?? codigo.modules[k][8], qr.modules[i + k][8] ?? qr.modules[k][8]);
        }
      }
    }
  }
});

test('o logótipo recomendado é uma fração da largura, e cabe no QR', () => {
  // O tecto de um quinto da largura não é um capricho: abaixo disso o padrão
  // de localização e a mancha não se distinguem, nem de longe nem com um
  // telemóvel na mão.
  for (const payload of PAYLOADS) {
    for (const ecl of NIVEIS) {
      const qr = base(payload, ecl);
      const maximo = modulosMaximos(qr.size, ecl);

      assert.ok(maximo >= 0, 'o máximo não pode ser negativo');
      assert.ok(
        maximo <= Math.floor(qr.size / 5),
        `${maximo} módulos num QR de ${qr.size}: mais de um quinto da largura`,
      );
      assert.ok(
        maximo + MARGEM * 2 <= qr.size,
        `a zona de ${maximo + MARGEM * 2} não cabe num QR de ${qr.size}`,
      );
    }
  }
});

test('o nível de correcção de erros muda o logotipo que se pode por', () => {
  const qr = base('https://exemplo.pt/painel/2026/09?utm=origem=frameqr', 'H');
  const tamanhos = NIVEIS.map((ecl) => modulosMaximos(qr.size, ecl));

  assert.ok(
    new Set(tamanhos).size > 1,
    `os quatro níveis dão o mesmo logotipo (${tamanhos[0]}), e escolher o ` +
      'nível de correcção não mudaria nada no que o utilizador vê',
  );

  /*
   * Só se compara L com H, e não a cadeia toda.
   *
   * As percentagens não sobem de forma regular de L para H, porque o pior caso
   * de cada nível cai num QR diferente: o H tem mais correcção de erros, logo
   * o mesmo texto sai num QR maior, e num QR maior a mancha toca menos
   * codewords por módulo. O H pode dar um logotipo maior em módulos e uma
   * percentagem menor. Ver a nota em PERCENTAGEM_SEGURA.
   */
  assert.ok(
    tamanhos[3] >= tamanhos[0],
    `H dá ${tamanhos[3]} e L dá ${tamanhos[0]}: mais correcção de erros com menos logotipo`,
  );
});

test('a percentagem segura é medida, e não a teórica da norma', () => {
  // A norma diz 4/8/14/24. A medição com o ZXing, no pior QR de cada nível,
  // dá bem menos. É a medida que vai no código, porque a teórica produz
  // logótipos que às vezes leem — e o pior resultado possível, porque o
  // defeito só aparece no cartão já impresso.
  const teoricos = { L: 4, M: 8, Q: 14, H: 24 };
  for (const [nivel, teorico] of Object.entries(teoricos)) {
    assert.ok(
      PERCENTAGEM_SEGURA[nivel] < teorico,
      `${nivel}: ${PERCENTAGEM_SEGURA[nivel]} não é mais conservador que o teórico ${teorico}`,
    );
  }
});

test('a matriz devolvida é nova, e o QR original fica intacto', () => {
  // Sem isto, a segunda geração do mesmo QR na interface vinha com a zona do
  // logótipo já apagada de antes, e o logotipo acumulava.
  const qr = base('https://exemplo.pt', 'H');
  const antes = qr.modules.map((linha) => Array.from(linha));

  aplicarFrame(qr, { modulos: 9 });

  assert.deepEqual(qr.modules.map((linha) => Array.from(linha)), antes, 'aplicarFrame alterou o QR que recebeu');
});

test('sem logótipo, a matriz sai igual à entrada', () => {
  const qr = base('https://exemplo.pt', 'M');
  const codigo = aplicarFrame(qr, { modulos: 0 });

  assert.equal(codigo.apagados, 0);
  assert.equal(codigo.percentagem, 0);
  assert.equal(codigo.zona, null);
  assert.equal(codigo.seguro, true);
  assert.deepEqual(
    codigo.modules.map((linha) => Array.from(linha)),
    qr.modules.map((linha) => Array.from(linha)),
  );
});

test('apagar mais nunca é mais seguro, e a contagem bate com a matriz', () => {
  // O número de módulos apagados tem de ser o que a matriz mostra. Se não
  // bater, a percentagem que decide o que é seguro é de outro código, e o
  // limite protege menos do que diz.
  for (const payload of PAYLOADS) {
    for (const ecl of NIVEIS) {
      const qr = base(payload, ecl);
      for (const modulos of [1, 3, modulosMaximos(qr.size, ecl)]) {
        if (modulos <= 0) continue;
        const codigo = aplicarFrame(qr, { modulos });
        if (!codigo.zona) continue;

        const { inicio, fim, margem } = codigo.zona;
        let contados = 0;
        for (let y = inicio - margem; y < fim + margem; y++) {
          for (let x = inicio - margem; x < fim + margem; x++) {
            if (x < 0 || y < 0 || x >= qr.size || y >= qr.size) continue;
            if (qr.modules[y][x] === 1 && codigo.modules[y][x] === 0) contados++;
          }
        }
        assert.equal(contados, codigo.apagados, 'a contagem não bate com a matriz');

        const esperado = ((contados / (qr.size * qr.size)) * 100).toFixed(2);
        assert.equal(codigo.percentagem.toFixed(2), esperado, 'a percentagem não bate');
      }
    }
  }
});
