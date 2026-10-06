package com.qrcodegen.core.simbologias

/**
 * Um codigo de barras de uma linha, ja desenhado: os modulos e onde sao as
 * guardas.
 *
 * ## O que e' uma guarda
 *
 * **A moldura do codigo, e as colunas onde ela esta.** O desenho pinta-as mais
 * altas, e essa e' a razao de o leitor as encontrar: sao a ancora que diz onde o
 * codigo comeca e acaba.
 *
 * **Sao indices de modulo, e nao de elemento — e a distincao e' o que separates
 * este codigo de uma versao anterior.** A conta `len(moldura) * largo` assume
 * que todos os elementos da moldura sao largos, e no Codabar a moldura do inicio
 * ocupa 23 modulos enquanto a conta dava 35: as 12 colunas a mais eram do
 * **primeiro caractere de dados**, pintadas com a altura da moldura. E no
 * Codabar isso nao e' cosmete — e' da moldura que o leitor tira a razao
 * larga/estreita.
 *
 * A regra nao e' uma conta melhor, e' **medir**: a guarda vai de onde a
 * moldura comeca ate onde acaba, e isso sabe-se porque se acabou de acrescentar.
 */
data class CodigoDeBarras(
    /** O nome da simbologia, como a pessoa a pede: `Code 39`, `ITF`, ... */
    val simbologia: String,

    /**
     * Um modulo por posicao, escuro (`true`) ou claro (`false`).
     *
     * **Um `BooleanArray` e nao um `List<Boolean>`,** e a razao e' o desenho: o
     * canvas do Android e a imagem em Java percorrem isto para desenhar, e um
     * array de primitivas nao faz caixa por elemento. Uma lista de `Boolean` aqui
     * seria um byte por modulo e uma indireccao por modulo, num sitio que o
     * `AGENTS.md` chama de "o custo que ninguem mede".
     */
    val modulos: BooleanArray,

    /** Os indices de modulo que sao moldura. Vazio nos formatos sem guardas. */
    val guardas: IntArray,

    /**
     * O texto que o leitor devolve, que e' o que se escreve por baixo.
     *
     * **O Code 128 devolve vazio de guarda** porque nao tem barras-guarda como
     * o EAN, e marca-las fazia-as descer mais do que o leitor espera: um
     * `guardas` de `[0, len-1]` dava um codigo que o ZXing lia e um leitor de
     * etiqueta recusava.
     */
    val legenda: String,
) {
    /**
     * A igualdade estrutural, que o `data class` nao dá.
     *
     * **Um `BooleanArray` compara por referencia**, que e' o defeito classico de
     * um `data class` com array: dois codigos identicos davam `false` na
     * igualdade, e um teste que os comparasse falhava sem razao. Por isso que os
     * campos sao `val` e nao `var`, e a igualdade e' escrita a mao.
     */
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CodigoDeBarras) return false

        return simbologia == other.simbologia &&
            legenda == other.legenda &&
            modulos.contentEquals(other.modulos) &&
            guardas.contentEquals(other.guardas)
    }

    override fun hashCode(): Int {
        var resultado = simbologia.hashCode()
        resultado = 31 * resultado + modulos.contentHashCode()
        resultado = 31 * resultado + guardas.contentHashCode()
        resultado = 31 * resultado + legenda.hashCode()
        return resultado
    }
}
