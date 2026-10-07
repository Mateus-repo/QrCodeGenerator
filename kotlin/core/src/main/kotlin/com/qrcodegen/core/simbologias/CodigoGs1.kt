package com.qrcodegen.core.simbologias

/**
 * O resultado de um GS1-128.
 *
 * **E' uma classe a parte, e nao [CodigoDeBarras] com dois campos a mais.** O
 * GS1-128 desenha-se como um Code 128 - e' o mesmo formato com o FNC1 no sitio
 * certo - mas o que o leitor devolve depende de duas coisas que um
 * [CodigoDeBarras] nao tem: **onde acaba cada campo** e **quantos separadores
 * foram emitidos**.
 *
 * ## Porque sao tres textos e nao um
 *
 * O mesmo GS1-128 tem **tres representacoes**, e confundir duas delas e' o erro
 * que o `AGENTS.md` ja registou tres vezes - uma delas nos caracteres de
 * controlo do Code 93, que o ZXing devolve em tres notacoes e o teste comparava
 * duas:
 *
 *  - [payload] - a forma de maquina: os AIs e os valores sem parenteses, com o
 *    separador onde o encoder o pôs. **E' esta a que o ZXing em Java devolve em
 *    `getRawBytes`... nao: em `bytes`, e so' o `zxingcpp` do Python.** Ver a
 *    nota do `Gs1_128`.
 *  - [gs1] - a forma legivel com separadores entre os campos.
 *  - [legenda] - a forma humana, com os AIs entre parenteses e sem separador
 *    nenhum. **E' a que a GS1 pede que se imprima.**
 *
 * **Um [payload] e um [legenda] que devolvessem a mesma cadeia seriam um codigo
 * que se desenha bem e que nao diz nada** - e o primeiro rascunho desta classe
 * tinha exactamente isso, com dois metodos a devolver `codigo.legenda`.
 *
 * ## Os campos e' o que a interface mostra, e nao o que o codigo transporta
 *
 * Cada [Campo] tem o AI, o valor, e o valor sem a parte do AI implicito. Sao
 * tres coisas porque o `3103` tem um digito que e' do valor e nao do AI, e um
 * [Campo] com so [ai] e [valor] esconde isso.
 */
data class CodigoGs1(
    /**
     * A grelha: `true` e' barra escura, `false` e' espaco.
     *
     * **Um [BooleanArray] e nao um [List],** pelo mesmo motivo que o
     * [CodigoDeBarras]: o canvas do Android percorre isto para desenhar, e um
     * array de primitivas nao faz caixa por elemento.
     */
    val modulos: BooleanArray,

    /** A forma humana, com os AIs entre parenteses e sem separador. */
    val legenda: String,

    /**
     * A forma de maquina, com o separador **onde o encoder o pôs**.
     *
     * **Nao e' a mesma coisa que juntar todos os campos com um separador.** A
     * diferenca e' o que apanha um separador no ultimo campo: um separador no
     * fim nao separa de nada, e o leitor conta-o como parte do campo seguinte.
     */
    val payload: String,

    /** A forma legivel, com o separador entre os campos. */
    val gs1: String,

    /** Os campos, na ordem em que foram escritos. */
    val campos: List<Campo>,

    /**
     * Quantos FNC1 foram emitidos, contando o do inicio.
     *
     * **E' a unica coisa que apanha um separador a mais.** O numero de modulos
     * nao apanha: o GS1-128 e o Code 128 dao *exactamente* o mesmo numero de
     * modulos com o mesmo texto, porque dao treze codewords nos dois - o Code
     * 128 comutativo gasta um codeword na troca de conjunto e o GS1-128 gasta um
     * no FNC1. E um separador a mais da treze codewords em vez de treze.
     */
    val separadores: Int,
) {

    /**
     * O codigo de barras como [CodigoDeBarras], para o desenho e para o ZXing.
     *
     * **Um GS1-128 nao tem desenho proprio**: tem o desenho do Code 128 com mais
     * uns codewords. **E' uma convenience e nao o formato do codigo**, que e' a
     * razao de [modulos] ser o campo.
     */
    fun codigo(): CodigoDeBarras =
        CodigoDeBarras("GS1-128", modulos.copyOf(), IntArray(0), legenda)

    /**
     * Um campo de um GS1-128.
     *
     * @param ai o numero do AI, dois a quatro digitos, **sem** a parte que
     *   sobrou da procura
     * @param valor o valor do campo, com a parte implicita do AI no inicio
     * @param conteudo o valor sem a parte implicita
     * @param separador se o campo precisa de um FNC1 a separa-lo do seguinte
     *
     * **O [valor] e o [conteudo] sao dois campos porque num `3103` o ultimo digito
     * e' a posicao decimal implicita** e faz parte do valor. E' a razao de a
     * procura do AI ir do mais comprido para o mais curto: o `31` seguido de `03`
     * e' o mesmo campo com o digito no sitio certo.
     */
    data class Campo(
        val ai: String,
        val valor: String,
        val conteudo: String,
        val separador: Boolean,
    )
}