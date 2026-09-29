/**
 * Data Matrix: as tabelas do C40 e do Text.
 *
 * ## Gerado, nao escrito a mao
 *
 *     python web/tests/gerar-tabela-dm-modos.py
 *
 * De:
 *     https://raw.githubusercontent.com/zint/zint/master/backend/dmatrix.h
 *     Licenca: BSD-3-Clause, Zint (Robin Stuart)
 *
 * Sao as **Tabela C.1** e **Tabela C.2** da ISO/IEC 16022, citadas na
 * propria fonte. E o Zint, a implementacao de referencia da GS1, que e'
 * tambem quem escreve estes codigos.
 *
 * ## Sao quatro tabelas e nao duas
 *
 * Cada modo tem uma de **deslocamento** e uma de **valor**, e sao coisas
 * diferentes: o valor e' o que o caracter vale dentro do modo, e o
 * deslocamento diz **em que conjunto** ele vive.
 *
 * Um erro em qualquer uma das duas da um codigo que se desenha e nao le - e
 * nao le com o texto errado, que e' o pior, porque parece correcto.
 *
 * **E o `TEXT_SHIFT` nao e' o `C40_SHIFT`, mesmo tendo os quatro
 * conjuntos nos dois.** A diferenca esta nos caracteres 64 a 95: no C40
 * e' o conjunto 2 e no Text e' o 3. E' onde vivem os sinais de pontuacao
 * alta, que nao aparecem num numero de serie normal - por isso que um
 * codigo com a tabela trocada passa nos testes e falha no campo.
 *
 * E os **valores** diferem ainda mais: no C40 o `A` vale 14 (conjunto
 * basico) e no Text vale 1 (conjunto 3). Sao os mesmos caracteres em
 * alfabetos diferentes, e um encoder que use o valor de um para o outro
 * escreve as maiusculas no sitio errado - e o codigo **le-se com o texto
 * errado**, que e' o pior resultado porque parece certo.
 */

/** O espaco vale 3, e nao 0. Ver a nota acima - e' a armadilha do modo. */
const ESPACO = 3;

/** deslocamento do C40 (Tabela C.1), por codigo ASCII. */
export const C40_SHIFT = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2,
  2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
];

/** valor do C40 (Tabela C.1), por codigo ASCII. */
export const C40_VALOR = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  3, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20,
  21, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 22, 23, 24, 25, 26,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
];

/** deslocamento do Text (Tabela C.2), por codigo ASCII. */
export const TEXT_SHIFT = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2,
  2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2,
  3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3,
];

/** valor do Text (Tabela C.2), por codigo ASCII. */
export const TEXT_VALOR = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  3, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20,
  21, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 22, 23, 24, 25, 26,
  0, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 27, 28, 29, 30, 31,
];

/**
 * O valor e o deslocamento de um caracter num modo, ou `null` se o modo
 * nao o tem.
 *
 * **`null` e nao um valor inventado.** Um caracter que o C40 nao tem e'
 * `-1` na fonte, e um `-1` escrito no codigo sai como caractere estranho no
 * leitor em vez de dizer que nao cabe. A razao de a funcao devolver `null` e'
 * que quem chama **tem de decidir**: mudar para o modo Text, ou para ASCII,
 * ou recusar.
 */
export function valorEm(modo, codigo) {
    if (codigo < 0 || codigo > 127) return null;
    const valor = modo === 'C40' ? C40_VALOR[codigo] : TEXT_VALOR[codigo];
    return valor;
}

/**
 * O conjunto de um caracter, ou `null` se o modo nao o tem.
 *
 * O `C40_SHIFT` **nao tem o valor 3** — o conjunto 3 e' reservado no C40 —
 * e o `TEXT_SHIFT` tem. E' a diferenca entre os dois modos, e quem escrever
 * o encoder tem de a respeitar: um 3 no C40 e' um codigo invalido.
 */
export function conjuntoEm(modo, codigo) {
    if (codigo < 0 || codigo > 127) return null;
    return modo === 'C40' ? C40_SHIFT[codigo] : TEXT_SHIFT[codigo];
}

export { ESPACO };
