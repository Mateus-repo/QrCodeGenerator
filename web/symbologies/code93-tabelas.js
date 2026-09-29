/**
 * As tabelas do Code 93. **Gerado** por `tests/gerar-tabela-code93.py`.
 *
 * Sao 48 inteiros de nove bits, e nao padroes em texto, que e' o que torna esta
 * tabela diferente de todas as outras do repositorio. Cada inteiro tem nove bits
 * significant, e cada par de bits diz uma coisa: o primeiro e' o bit menos
 * significativo do par, e o par e' (largo?, comprimento). Tres barras, tres
 * espacos, e cada um com uma largura de 1 a 4 modulos.
 *
 * **Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada -
 * o mesmo genre de falha do Code 39 com doze elementos por caracter em vez de
 * nove, que ja aconteceu neste repositorio.
 *
 * A origem e' a implementacao de referencia do ZXing (`Code93Reader.java`), que
 * e' tambem o leitor que vai verificar o encoder.
 */

/** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
export const ALFABETO =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcd*";

/** Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto. */
export const PADROES = [
  0x114, 0x148, 0x144, 0x142, 0x128, 0x124,  // 012345
  0x122, 0x150, 0x112, 0x10A, 0x1A8, 0x1A4,  // 6789AB
  0x1A2, 0x194, 0x192, 0x18A, 0x168, 0x164,  // CDEFGH
  0x162, 0x134, 0x11A, 0x158, 0x14C, 0x146,  // IJKLMN
  0x12C, 0x116, 0x1B4, 0x1B2, 0x1AC, 0x1A6,  // OPQRST
  0x196, 0x19A, 0x16C, 0x166, 0x136, 0x13A,  // UVWXYZ
  0x12E, 0x1D4, 0x1D2, 0x1CA, 0x16E, 0x176,  // -. $/+
  0x1AE, 0x126, 0x1DA, 0x1D6, 0x132, 0x15E,  // %abcd*
];

/** O indice de cada caractere, para a busca ao inverso. */
export const INDICE = new Map(
  [...ALFABETO].map((caractere, i) => [caractere, i]),
);

/** O asterisco, que marca o inicio e o fim. E' o indice 47. */
export const ASTERISCO = 47;
