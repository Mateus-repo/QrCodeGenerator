package com.qrcodegen.core.simbologias

/**
 * GS1 DataMatrix.
 *
 * **O Data Matrix com o FNC1, e nada mais.** E' o que vai na etiqueta de uma ampola de
 * farmacia e de um chip: quadradinho, minusculo, e com a capacidade de um simbolo que
 * se le de longe e de lado.
 *
 * ## O que muda em relacao ao Data Matrix
 *
 * Duas coisas, e as duas sao o FNC1 — o codeword 232:
 *
 *  1. **No inicio**, logo no primeiro codeword de dados. E' o que diz ao leitor "isto e'
 *     GS1" e nao texto solto.
 *  2. **No fim de cada campo de comprimento variavel**, menos no ultimo. E' o separador,
 *     e e' o que permite ao leitor saber onde acaba `(10)LOTE-A1` e onde comeca o campo
 *     seguinte.
 *
 * ## Porque isto nao e' "o texto com um 232 a frente"
 *
 * **O 232 e' simultaneamente o FNC1 e o par de digitos "02"**, porque `232 - 130 = 102`.
 * So a posicao os distingue: na posicao 0 e' o FNC1, no meio e' um "02" qualquer.
 * Passar pelo `compactar` perderia essa estrutura, e o separador no meio do lote seria
 * lido como os digitos "02".
 *
 * Por isso o encoder emite codewords e nao texto, e por isso que o
 * [dataMatrixDeCodewords] existe. Todo o resto — a escolha do simbolo, o enchimento, a
 * correccao de erros, a colocacao — **e' o mesmo** que o Data Matrix normal, porque
 * uma segunda implementacao de cada uma delas seria uma segunda fonte de verdade
 * sobre a parte que o ZXing verifica.
 *
 * ## A validacao dos AI vem do GS1-128, e nao e' uma copia
 *
 * A tabela dos 541 AIs, o `fixo`, o `maximo`, o `resto` e o `regex` da GS1 sao **os
 * mesmos** que o GS1-128 usa, e vem do [analisar] com um rotulo. **Nao ha uma segunda
 * tabela de AI nem uma segunda notacao**: os campos de um GS1 DataMatrix sao os mesmos
 * campos de um GS1-128, e um `(10)` tem o mesmo comprimento num e no outro.
 *
 * O que muda e' so a notacao dos AIs **dentro do simbolo**: no Data Matrix, os digitos
 * do AI e do valor numerico vao no modo de digitos, que emparelha e soma 130. E e' por
 * isso que o FNC1 e' ambiguo — o "02" de `(02)` e o 232 sao o mesmo codeword.
 *
 * ## Nao e' uma copia do Java
 *
 * A `AGENTS.md` diz que o objectivo nao e' codigo partilhado entre linguagens: sao
 * cinco implementacoes do mesmo formato normalizado, e o que tem de bater e' a spec. Este
 * ficheiro e' o mesmo algoritmo com a sintaxe do Kotlin, e nao uma traducao linha a
 * linha — **e a razao de a paridade existir**: e' ela que diz que os dois fizeram a
 * mesma coisa, e nao que este ficheiro foi copiado do outro.
 */
object Gs1_DataMatrix {

    /**
     * O rotulo do formato, para as mensagens de recusa.
     *
     * O [analisar] e' o mesmo para os dois formatos, e o rotulo diz qual deles esta' a
     * ser codificado.
     */
    const val ROTULO: String = "GS1 DataMatrix"

    /** O GS que separa os campos, o mesmo byte que o leitor devolve. */
    const val GS: Char = Gs1_128.GS

    /**
     * O modo de digitos: emparelha e soma 130.
     *
     * O Data Matrix tem um modo so para numeros, em que dois digitos cabem num
     * codeword. O GS1 usa-o para **os AI e para os valores numericos**, que e' o que
     * torna o 232 ambiguo: o par "02" da `2 + 130 = 132`, e o FNC1 e' 232.
     *
     * Um digito que fica sem par — o ultimo de um AI com numero impar de digitos — vai
     * no modo ASCII, o valor mais um. Nao ha outro jeito: o modo de digitos trabalha aos
     * pares.
     */
    internal fun digitos(texto: String): IntArray {
        val saida = mutableListOf<Int>()
        var i = 0

        while (i < texto.length) {
            if (i + 1 < texto.length) {
                saida.add(texto.substring(i, i + 2).toInt() + 130)
                i += 2
            } else {
                saida.add(texto[i].code + 1)
                i++
            }
        }

        return saida.toIntArray()
    }

    /** O modo ASCII: o valor mais um. */
    internal fun ascii(texto: String): IntArray =
        IntArray(texto.length) { texto[it].code + 1 }

    /**
     * O codigo GS1 DataMatrix.
     *
     * @param elementoString os campos na forma humana da GS1, com os AI entre
     *   parenteses: `(01)04012345678901(10)LOTE-A1`. Igual ao GS1-128, e pela mesma
     *   razao — e' a forma que a GS1 define e a que a pessoa le. Os parenteses nao vao
     *   para o simbolo.
     */
    fun gs1DataMatrix(elementoString: String): CodigoGs1Matriz {
        val campos = Gs1_128.analisar(elementoString, ROTULO)

        /*
         * **Cada campo vai codificado conforme o que e': o AI e os valores numericos no
         * modo de digitos, o resto em ASCII.** Um `(10)LOTE-A1` da o "10" em digitos e o
         * "LOTE-A1" em ASCII, e e' essa mistura que faz o 232 ser ambiguo.
         *
         * E **o `numerico` decide do AI e nao do valor** — o `01` e' o GTIN e e' numerico
         * por definicao, e o `10` e' o lote e e' alfanumerico; perguntar "o valor so tem
         * digitos?" mandaria o lote para o modo de digitos, e o `LOTE` nao cabe la.
         */
        val valores = mutableListOf(DataMatrix.FNC1)

        val ultimo = campos.size - 1
        for ((i, campo) in campos.withIndex()) {
            valores.addAll(digitos(campo.ai).toList())

            val valor = if (campo.numerico) digitos(campo.conteudo) else ascii(campo.conteudo)
            valores.addAll(valor.toList())

            // O separador vai no fim de cada campo variavel **excepto o ultimo**.
            // **Um separador no fim nao separa de nada**, e o leitor accounta-o como parte
            // do campo seguinte.
            if (campo.separador && i != ultimo) {
                valores.add(DataMatrix.FNC1)
            }
        }

        val codigo = DataMatrix.dataMatrixDeCodewords(valores.toIntArray(), ROTULO)

        val gs1 = StringBuilder()
        val maquina = StringBuilder()
        for ((i, campo) in campos.withIndex()) {
            gs1.append('(').append(campo.ai).append(')').append(campo.valor)
            maquina.append(campo.ai).append(campo.valor)
            if (campo.separador && i != ultimo) {
                maquina.append(GS)
            }
        }

        return CodigoGs1Matriz(
            codigo = codigo,
            legenda = gs1.toString(),
            payload = maquina.toString(),
            gs1 = gs1.toString(),
            campos = campos,
            separadores = valores.count { it == DataMatrix.FNC1 },
        )
    }

    /**
     * O registo, pelo id que o selector usa.
     *
     * **A chave e' a mesma nos cinco clientes**, e e' o que a `AGENTS.md` chama de lista
     * escrita duas vezes: o selector de formatos vive no cliente e o registo vive no
     * modulo, e nada os ligava. Um registo sem `<option>` no selector e' um formato
     * invisivel.
     */
    val SIMBOLOGIAS_GS1_DATAMATRIX: Map<String, (String) -> CodigoGs1Matriz> =
        mapOf("gs1-datamatrix" to { texto -> gs1DataMatrix(texto) })
}