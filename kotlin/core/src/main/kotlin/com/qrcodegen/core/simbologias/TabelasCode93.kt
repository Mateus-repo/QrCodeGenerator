package com.qrcodegen.core.simbologias

/**
 * As tabelas do Code 93. **Gerado** por `spec/gerar-tabelas-code93.py`.
 *
 * Sao 48 inteiros de nove bits, e nao padroes em texto. **Os nove bits sao os
 * nove modulos, um a um, do mais significativo para o menos** - o bit mais
 * significativo e' a primeira barra e o menos significativo e' o ultimo modulo.
 * Nao ha larguras a extrair.
 *
 * **Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada - o
 * mesmo genre de falha do Code 39 com doze elementos por caracter em vez de nove,
 * que ja aconteceu neste repositorio.
 *
 * A origem e' a implementacao de referencia do ZXing ([Code93Reader.java]), que
 * e' tambem o leitor que vai verificar o encoder. **E' a unica tabela do
 * repositorio que nao vem do python-barcode**, porque o python-barcode nao tem
 * Code 93.
 */
object TabelasCode93 {
    /** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
    const val ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcd*"

    /**
     * Os 128 caracteres ASCII ja escritos como vao no codigo.
     *
     * **E uma tabela cheia de proposito.** Um `""` para os caracteres que estao no
     * alfabeto obrigaria o encoder a perguntar "o par esta vazio?" em cada
     * caractere, e esse ramo e' cinco linguagens a escrever cinco versoes que
     * ninguem testa directamente. Aqui `CONTROLES[c.code]` da sempre o que sai, e
     * uma busca nao diverge entre linguagens.
     *
     * **Vem do `decodeExtended` do ZXing, invertido**, e nao de uma escada escrita a
     * mao — que foi o que o encoder do web tinha, com vinte e quatro dos trinta e
     * dois caracteres de controlo errados. Um CR saia como o algarismo `0`.
     */
    val CONTROLES = arrayOf(
        "bU", "aA", "aB", "aC", "aD", "aE",  // 0x00 a 0x05
        "aF", "aG", "aH", "aI", "aJ", "aK",  // 0x06 a 0x0B
        "aL", "aM", "aN", "aO", "aP", "aQ",  // 0x0C a 0x11
        "aR", "aS", "aT", "aU", "aV", "aW",  // 0x12 a 0x17
        "aX", "aY", "aZ", "bA", "bB", "bC",  // 0x18 a 0x1D
        "bD", "bE", " ", "cA", "cB", "cC",  // 0x1E a #
        "$", "%", "cF", "cG", "cH", "cI",  // $ a )
        "*", "+", "cL", "-", ".", "/",  // * a /
        "0", "1", "2", "3", "4", "5",  // 0 a 5
        "6", "7", "8", "9", "cZ", "bF",  // 6 a ;
        "bG", "bH", "bI", "bJ", "bV", "A",  // < a A
        "B", "C", "D", "E", "F", "G",  // B a G
        "H", "I", "J", "K", "L", "M",  // H a M
        "N", "O", "P", "Q", "R", "S",  // N a S
        "T", "U", "V", "W", "X", "Y",  // T a Y
        "Z", "bK", "bL", "bM", "bN", "bO",  // Z a _
        "bW", "dA", "dB", "dC", "dD", "dE",  // ` a e
        "dF", "dG", "dH", "dI", "dJ", "dK",  // f a k
        "dL", "dM", "dN", "dO", "dP", "dQ",  // l a q
        "dR", "dS", "dT", "dU", "dV", "dW",  // r a w
        "dX", "dY", "dZ", "bP", "bQ", "bR",  // x a }
        "bS", "bT",  // ~ a 0x7F
    )

    /**
     * Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto.
     *
     * **`IntArray` e nao `Array<String>`** porque cada padrao e' um inteiro de nove
     * bits e nao uma cadeia de barras e espacos.
     */
    val PADROES = intArrayOf(
        0x114, 0x148, 0x144, 0x142, 0x128, 0x124,  // 012345
        0x122, 0x150, 0x112, 0x10A, 0x1A8, 0x1A4,  // 6789AB
        0x1A2, 0x194, 0x192, 0x18A, 0x168, 0x164,  // CDEFGH
        0x162, 0x134, 0x11A, 0x158, 0x14C, 0x146,  // IJKLMN
        0x12C, 0x116, 0x1B4, 0x1B2, 0x1AC, 0x1A6,  // OPQRST
        0x196, 0x19A, 0x16C, 0x166, 0x136, 0x13A,  // UVWXYZ
        0x12E, 0x1D4, 0x1D2, 0x1CA, 0x16E, 0x176,  // -. $/+
        0x1AE, 0x126, 0x1DA, 0x1D6, 0x132, 0x15E,  // %abcd*
    )

    /** O asterisco, que marca o inicio e o fim. E' o indice 47. */
    const val ASTERISCO = 47

    /**
     * O modulo do checksum, **47 e nao 44**.
     *
     * Contam o asterisco e os quatro de controle, e nao so os caracteres de dados.
     */
    const val MODULO_CHECKSUM = 47

    /**
     * O indice de cada caractere, para a busca ao inverso.
     *
     * **E' calculado e nao gerado**, pelas mesmas razoes que o web o calcula: sao
     * 48 entradas de um `withIndex`, e escreve-las seria 48 linhas que so se
     * podem enganar.
     *
     * **`withIndex()` e nao um `for` com contador** porque o `Char` do Kotlin
     * nao e' promovido a `Int` automaticamente, e o `associate` de cada `Char`
     * para `Int` e' o que evita a conversao a mao em cada encoder.
     *
     * **O `associate` recebe um `IndexedValue`, nao dois parametros.** Com
     * `{ i, c -> c to i }` o compilador da quatro erros em cadeia — o primeiro
     * e' o tipo do argumento, e os outros tres sao consequencia de nao inferir o
     * tipo do parametro. E' o `associate { it.value to it.index }` que resolve,
     * e o `it` explicito porque o `associate` nao desestrutura.
     */
    val INDICE: Map<Char, Int> = ALFABETO.withIndex().associate { it.value to it.index }
}
