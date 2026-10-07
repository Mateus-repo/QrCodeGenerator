package com.qrcodegen.core.simbologias

/**
 * O resultado de uma simbologia **bidimensional**.
 *
 * **E' um tipo a parte, e nao [CodigoDeBarras] com a matriz achatada.** Nao e'
 * por haver mais um campo: e' porque as duas coisas que os separam nao sao
 * opcoes.
 *
 * ## As guardas nao existem
 *
 * Num codigo de barras as guardas sao os *indices de modulo* das barras que
 * descem abaixo do corpo, e sao a ancora de um leitor de mao. Num codigo 2D
 * **a orientacao vem das guias em L nas pontas** — uma cheia em baixo e a
 * esquerda, outra tracejada em cima e a direita — e essas guias ja estao nos
 * modulos que o encoder devolveu. Nao ha nada a acrescentar, e um `guardas` vazio
 * seria um campo que o desenho le e nao usa.
 *
 * ## A legenda nao existe
 *
 * Um EAN-13 tem os dois digitos impressos por baixo do codigo, e o C# ja
 * apanhou o custo de os perder: o leitor funciona e a folha impressa nao bate com
 * o que esta inscrito. Um codigo 2D nao tem texto impresso por baixo, e meter um
 * campo para ele seria um campo vazio que parece uma omissao.
 *
 * **Um campo que existe e esta sempre vazio e' pior do que um campo que nao
 * existe**, porque quem o le nao sabe se o encoder se esqueceu ou se e' verdade.
 *
 * ## A igualdade estrutural
 *
 * **Um `Array<BooleanArray>` ou `Array<Boolean>` compara por referencia**, que e'
 * o defeito classico de um `data class` com array: duas matrizes identicas dariam
 * `false` na igualdade, e um teste que as comparasse falhava sem razao. Por isso
 * que a igualdade e' escrita a mao — e o mesmo que o [CodigoDeBarras] faz com o
 * `BooleanArray` dele.
 */
data class CodigoMatriz(
    /** O nome da simbologia, como a pessoa a pede: `Data Matrix`. */
    val simbologia: String,

    /**
     * A grelha, `modulos[y][x]`, com `true` onde o modulo e' escuro.
     *
     * **Array de arrays e nao `Array<BooleanArray>`**, porque quem desenha e'
     * o ZXing e o script de paridade, e ambos percorrem linha a linha.
     */
    val modulos: Array<BooleanArray>,

    /** Os codewords de dados que o texto ocupa, antes do enchimento. */
    val codewords: IntArray,

    /** A capacidade do simbolo escolhido, em codewords de dados. */
    val dados: Int,

    /** Quantos codewords de correccao de erros o simbolo tem. */
    val correccao: Int,
) {
    /** Quantos codewords de dados o texto ocupa. */
    val usado: Int get() = codewords.size

    /** O numero de colunas da grelha, guias incluidas. */
    val colunas: Int get() = modulos[0].size

    /** O numero de linhas da grelha, guias incluidas. */
    val linhas: Int get() = modulos.size

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CodigoMatriz) return false

        if (simbologia != other.simbologia) return false
        if (dados != other.dados || correccao != other.correccao) return false
        if (!codewords.contentEquals(other.codewords)) return false
        if (modulos.size != other.modulos.size) return false

        for (y in modulos.indices) {
            if (!modulos[y].contentEquals(other.modulos[y])) return false
        }

        return true
    }

    override fun hashCode(): Int {
        var resultado = simbologia.hashCode()
        resultado = 31 * resultado + codewords.contentHashCode()
        resultado = 31 * resultado + dados
        resultado = 31 * resultado + correccao
        for (linha in modulos) {
            resultado = 31 * resultado + linha.contentHashCode()
        }
        return resultado
    }

    /**
     * A grelha em texto, com `#` no escuro e `.` no claro.
     *
     * **ASCII, e nao os blocos do terminal.** Um ficheiro Kotlin com caracteres de
     * desenho nao se abre igual em todo o lado, e a fonte do console decide o que
     * aparece — que e' a pior coisa para uma representacao que existe
     * precisamente para se ver.
     *
     * **E' para meter na mensagem de um teste que falhou**, e por isso devolve uma
     * linha por linha da grelha: um modulo solto dizia "o modulo 137" quando o
     * que interessa e' "(linha 8, modulo 9)".
     */
    fun comoTexto(): String = buildString {
        for (linha in modulos) {
            for (modulo in linha) {
                append(if (modulo) '#' else '.')
            }
            append('\n')
        }
    }
}