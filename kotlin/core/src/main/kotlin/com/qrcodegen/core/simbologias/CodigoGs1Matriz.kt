package com.qrcodegen.core.simbologias

/**
 * O resultado de um GS1 DataMatrix.
 *
 * **E' uma classe a parte, e nao [CodigoMatriz] com dois campos a mais**, pela mesma
 * razao que o [CodigoGs1] e' a parte do [CodigoDeBarras]: o que o leitor precisa saber
 * — **onde acaba cada campo** e **quantos separadores foram emitidos** — nao existe num
 * `CodigoMatriz` nem num `CodigoDeBarras`.
 *
 * **E' 2D, e por isso que o [codigo] devolve um [CodigoMatriz]** e nao um
 * `CodigoDeBarras`: o desenho de um GS1 DataMatrix e' uma grelha com guias, como
 * qualquer Data Matrix, e a conversao e' uma convenience — o formato do codigo e' o
 * `CodigoMatriz` com os campos GS1 por cima.
 */
class CodigoGs1Matriz(
    private val codigo: CodigoMatriz,
    private val legenda: String,
    private val payload: String,
    private val gs1: String,
    private val campos: List<CodigoGs1.Campo>,
    private val separadores: Int,
) {

    /** A grelha, como [CodigoMatriz], para o desenho e para o ZXing. */
    fun codigo(): CodigoMatriz = codigo

    /** Os campos, na ordem em que foram escritos. */
    fun campos(): List<CodigoGs1.Campo> = campos

    /**
     * Quantos FNC1 foram emitidos, contando o do inicio.
     *
     * **E' a unica coisa que apanha um separador a mais.** Um separador a mais da um
     * codeword a mais e um simbolo possivelmente maior, e o numero de modulos nao da
     * conta.
     */
    fun separadores(): Int = separadores

    /**
     * A forma de maquina: os AIs e os valores sem parenteses, com o separador
     * **onde o encoder o pos** — que e' o que o ZXing devolve em `bytes`, com o `0x1D`
     * cru.
     */
    fun payload(): String = payload

    /** A forma legivel. */
    fun gs1(): String = gs1

    /**
     * A forma humana, com os AIs entre parenteses e **sem** separador — que e' a que o
     * ZXing devolve em `text`.
     */
    fun legenda(): String = legenda
}