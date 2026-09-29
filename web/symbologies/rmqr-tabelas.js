/**
 * rMQR: os 32 simbolos, com os centros de alinhamento e os blocos de
 * correccao de erro.
 *
 * ## Gerado, nao escrito a mao
 *
 *     python web/tests/gerar-tabela-rmqr.py
 *
 * De:
 *     https://github.com/zxing-cpp/zxing-cpp/blob/v3.1.1/core/src/qrcode/QRVersion.cpp
 *     Licenca: Apache-2.0, zxing-cpp (ZXing authors)
 *
 * A fonte e' o zxing-cpp 3.1.1, que e' tambem o que o `zxingcpp`
 * instalado escreve. As referencias a norma estao no codigo:
 *
 *     ISO/IEC 23941:2022 Anexo D, Tabela D.1 - coordenadas de coluna dos
 *       centros dos padroes de alinhamento
 *     ISO/IEC 23941:2022 7.5.1, Tabela 8 - caracteristicas de correccao
 *
 * **Os centros de alinhamento sao so colunas.** E' a diferenca para o QR,
 * onde ha grelha: num codigo rectangular nao ha motivo para ter linhas
 * de alinhamento, e a norma so define colunas.
 *
 * Os nomes sao `R<altura>x<largura>`, tirados do comentario da fonte - o
 * codigo nao os tem estruturados. O `gerar-tabela-rmqr.py` veifica que o
 * nome bate com o tamanho, que e' o que impede a lista de trocar de
 * sentido em silencio.
 *
 * A segunda parte, os bits do indicador de caracteres, vem do
 * `QRCodecMode.cpp` do mesmo repositorio, com a citacao
 * ISO/IEC 23941:2022 7.4.1, Tabela 3.
 */

/** Os 32 simbolos, por versao. A versao 1 e' o menor. */
export const SIMBOLOS = [
  {
    // R7x43
    versao: 1,
    largura: 43,
    altura: 7,
    alinhamento: [21],
    M: { ecPorBloco: 7, blocos: [[1, 6]] },
    H: { ecPorBloco: 10, blocos: [[1, 3]] },
  },
  {
    // R7x59
    versao: 2,
    largura: 59,
    altura: 7,
    alinhamento: [19, 39],
    M: { ecPorBloco: 9, blocos: [[1, 12]] },
    H: { ecPorBloco: 14, blocos: [[1, 7]] },
  },
  {
    // R7x77
    versao: 3,
    largura: 77,
    altura: 7,
    alinhamento: [25, 51],
    M: { ecPorBloco: 12, blocos: [[1, 20]] },
    H: { ecPorBloco: 22, blocos: [[1, 10]] },
  },
  {
    // R7x99
    versao: 4,
    largura: 99,
    altura: 7,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 16, blocos: [[1, 28]] },
    H: { ecPorBloco: 30, blocos: [[1, 14]] },
  },
  {
    // R7x139
    versao: 5,
    largura: 139,
    altura: 7,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 24, blocos: [[1, 44]] },
    H: { ecPorBloco: 22, blocos: [[2, 12]] },
  },
  {
    // R9x43
    versao: 6,
    largura: 43,
    altura: 9,
    alinhamento: [21],
    M: { ecPorBloco: 9, blocos: [[1, 12]] },
    H: { ecPorBloco: 14, blocos: [[1, 7]] },
  },
  {
    // R9x59
    versao: 7,
    largura: 59,
    altura: 9,
    alinhamento: [19, 39],
    M: { ecPorBloco: 12, blocos: [[1, 21]] },
    H: { ecPorBloco: 22, blocos: [[1, 11]] },
  },
  {
    // R9x77
    versao: 8,
    largura: 77,
    altura: 9,
    alinhamento: [25, 51],
    M: { ecPorBloco: 18, blocos: [[1, 31]] },
    H: { ecPorBloco: 16, blocos: [[1, 8], [1, 9]] },
  },
  {
    // R9x99
    versao: 9,
    largura: 99,
    altura: 9,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 24, blocos: [[1, 42]] },
    H: { ecPorBloco: 22, blocos: [[2, 11]] },
  },
  {
    // R9x139
    versao: 10,
    largura: 139,
    altura: 9,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 18, blocos: [[1, 31], [1, 32]] },
    H: { ecPorBloco: 22, blocos: [[3, 11]] },
  },
  {
    // R11x27
    versao: 11,
    largura: 27,
    altura: 11,
    alinhamento: [],
    M: { ecPorBloco: 8, blocos: [[1, 7]] },
    H: { ecPorBloco: 10, blocos: [[1, 5]] },
  },
  {
    // R11x43
    versao: 12,
    largura: 43,
    altura: 11,
    alinhamento: [21],
    M: { ecPorBloco: 12, blocos: [[1, 19]] },
    H: { ecPorBloco: 20, blocos: [[1, 11]] },
  },
  {
    // R11x59
    versao: 13,
    largura: 59,
    altura: 11,
    alinhamento: [19, 39],
    M: { ecPorBloco: 16, blocos: [[1, 31]] },
    H: { ecPorBloco: 16, blocos: [[1, 7], [1, 8]] },
  },
  {
    // R11x77
    versao: 14,
    largura: 77,
    altura: 11,
    alinhamento: [25, 51],
    M: { ecPorBloco: 24, blocos: [[1, 43]] },
    H: { ecPorBloco: 22, blocos: [[1, 11], [1, 12]] },
  },
  {
    // R11x99
    versao: 15,
    largura: 99,
    altura: 11,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 16, blocos: [[1, 28], [1, 29]] },
    H: { ecPorBloco: 30, blocos: [[1, 14], [1, 15]] },
  },
  {
    // R11x139
    versao: 16,
    largura: 139,
    altura: 11,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 24, blocos: [[2, 42]] },
    H: { ecPorBloco: 30, blocos: [[3, 14]] },
  },
  {
    // R13x27
    versao: 17,
    largura: 27,
    altura: 13,
    alinhamento: [],
    M: { ecPorBloco: 9, blocos: [[1, 12]] },
    H: { ecPorBloco: 14, blocos: [[1, 7]] },
  },
  {
    // R13x43
    versao: 18,
    largura: 43,
    altura: 13,
    alinhamento: [21],
    M: { ecPorBloco: 14, blocos: [[1, 27]] },
    H: { ecPorBloco: 28, blocos: [[1, 13]] },
  },
  {
    // R13x59
    versao: 19,
    largura: 59,
    altura: 13,
    alinhamento: [19, 39],
    M: { ecPorBloco: 22, blocos: [[1, 38]] },
    H: { ecPorBloco: 20, blocos: [[2, 10]] },
  },
  {
    // R13x77
    versao: 20,
    largura: 77,
    altura: 13,
    alinhamento: [25, 51],
    M: { ecPorBloco: 16, blocos: [[1, 26], [1, 27]] },
    H: { ecPorBloco: 28, blocos: [[1, 14], [1, 15]] },
  },
  {
    // R13x99
    versao: 21,
    largura: 99,
    altura: 13,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 20, blocos: [[1, 36], [1, 37]] },
    H: { ecPorBloco: 26, blocos: [[1, 11], [2, 12]] },
  },
  {
    // R13x139
    versao: 22,
    largura: 139,
    altura: 13,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 20, blocos: [[2, 35], [1, 36]] },
    H: { ecPorBloco: 28, blocos: [[2, 13], [2, 14]] },
  },
  {
    // R15x43
    versao: 23,
    largura: 43,
    altura: 15,
    alinhamento: [21],
    M: { ecPorBloco: 18, blocos: [[1, 33]] },
    H: { ecPorBloco: 18, blocos: [[1, 7], [1, 8]] },
  },
  {
    // R15x59
    versao: 24,
    largura: 59,
    altura: 15,
    alinhamento: [19, 39],
    M: { ecPorBloco: 26, blocos: [[1, 48]] },
    H: { ecPorBloco: 24, blocos: [[2, 13]] },
  },
  {
    // R15x77
    versao: 25,
    largura: 77,
    altura: 15,
    alinhamento: [25, 51],
    M: { ecPorBloco: 18, blocos: [[1, 33], [1, 34]] },
    H: { ecPorBloco: 24, blocos: [[2, 10], [1, 11]] },
  },
  {
    // R15x99
    versao: 26,
    largura: 99,
    altura: 15,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 24, blocos: [[2, 44]] },
    H: { ecPorBloco: 22, blocos: [[4, 12]] },
  },
  {
    // R15x139
    versao: 27,
    largura: 139,
    altura: 15,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 24, blocos: [[2, 42], [1, 43]] },
    H: { ecPorBloco: 26, blocos: [[1, 13], [4, 14]] },
  },
  {
    // R17x43
    versao: 28,
    largura: 43,
    altura: 17,
    alinhamento: [21],
    M: { ecPorBloco: 22, blocos: [[1, 39]] },
    H: { ecPorBloco: 20, blocos: [[1, 10], [1, 11]] },
  },
  {
    // R17x59
    versao: 29,
    largura: 59,
    altura: 17,
    alinhamento: [19, 39],
    M: { ecPorBloco: 16, blocos: [[2, 28]] },
    H: { ecPorBloco: 30, blocos: [[2, 14]] },
  },
  {
    // R17x77
    versao: 30,
    largura: 77,
    altura: 17,
    alinhamento: [25, 51],
    M: { ecPorBloco: 22, blocos: [[2, 39]] },
    H: { ecPorBloco: 28, blocos: [[1, 12], [2, 13]] },
  },
  {
    // R17x99
    versao: 31,
    largura: 99,
    altura: 17,
    alinhamento: [23, 49, 75],
    M: { ecPorBloco: 20, blocos: [[2, 33], [1, 34]] },
    H: { ecPorBloco: 26, blocos: [[4, 14]] },
  },
  {
    // R17x139
    versao: 32,
    largura: 139,
    altura: 17,
    alinhamento: [27, 55, 83, 111],
    M: { ecPorBloco: 20, blocos: [[4, 38]] },
    H: { ecPorBloco: 26, blocos: [[2, 12], [4, 13]] },
  },
];

/**
 * Os bits do indicador de caracteres, por modo e por versao.
 *
 * ISO/IEC 23941:2022 7.4.1, Tabela 3. Sao **32 valores por modo**, e
 * nao tres grupos como no QR: no QR o numero de bits so muda tres vezes -
 * versoes 1-9, 10-26 e 27-40 - e no rMQR muda em quase todas as 32. E' a
 * razao de isto ser uma tabela e nao uma regra, e a razao de nao se poder
 * reaproveitar a do QR mesmo sendo o mesmo formato deCharacter.
 *
 * O indice e' a versao menos um, igual ao de `SIMBOLOS`.
 */
export const BITS_DE_CONTAGEM = {
  numeric: [
    4, 5, 6, 7, 7, 5, 6, 7,
    7, 8, 4, 6, 7, 7, 8, 8,
    5, 6, 7, 7, 8, 8, 7, 7,
    8, 8, 9, 7, 8, 8, 8, 9,
  ],
  alphanum: [
    3, 5, 5, 6, 6, 5, 5, 6,
    6, 7, 4, 5, 6, 6, 7, 7,
    5, 6, 6, 7, 7, 8, 6, 7,
    7, 7, 8, 6, 7, 7, 8, 8,
  ],
  byte: [
    3, 4, 5, 5, 6, 4, 5, 5,
    6, 6, 3, 5, 5, 6, 6, 7,
    4, 5, 6, 6, 7, 7, 6, 6,
    7, 7, 7, 6, 6, 7, 7, 8,
  ],
  kanji: [
    2, 3, 4, 5, 5, 3, 4, 5,
    5, 6, 2, 4, 5, 5, 6, 6,
    3, 5, 5, 6, 6, 7, 5, 5,
    6, 6, 7, 5, 6, 6, 6, 7,
  ],
};

/**
 * A capacidade em codewords de dados, para o nivel pedido.
 *
 * Sao os dois **menores** valores - o que limita e' sempre o M, porque o
 * M e' o que tem menos dados. E' o que o `rmqr.js` usa para escolher o
 * simbolo: se o conteudo nao cabe em M, nao cabe em lado nenhum.
 */
export function capacidadeDe(versao, nivel) {
    const simbolo = SIMBOLOS[versao - 1];
    if (!simbolo) throw new Error(`versao de rMQR invalida: ${versao}`);
    const b = nivel === 'H' ? simbolo.H : simbolo.M;
    return b.blocos.reduce((total, [n, cw]) => total + n * cw, 0);
}

/**
 * O nivel de correccao a usar. O rMQR so tem **dois**: M e H.
 *
 * E nao e' uma escolha de quem gera, e' uma consequencia de ser
 * rectangular: um QR tem 40 versoes para escolher o melhor compromisso
 * entre dados e redundancia, e um rMQR que se apresenta de lado nao pode
 * dar a si mesmo esse luxo. O valor por omissao e' H, e e' o que o
 * `CreateBarcode.cpp` do zxing-cpp usa.
 */
export const NIVEL_PADRAO = 'H';
