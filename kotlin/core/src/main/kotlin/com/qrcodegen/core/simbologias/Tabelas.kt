package com.qrcodegen.core.simbologias

/**
 * As tabelas dos codigos de barras de uma linha, extraidas do
 * `python-barcode`.
 *
 *     python spec/gerar-tabelas-lineares.py
 *
 * **NAO EDITE ESTE FICHEIRO A MAO.** E' gerado, e a razao esta no Python: a
 * tabela do Code 39 foi escrita de memoria com doze elementos por caractere em
 * vez de nove, e a do ITF com dois na moldura de paragem em vez de tres. Nenhum
 * dos dois foi apanhado por um teste — desenhavam-se com aspecto de estar certo
 * e o leitor nao lia.
 *
 * ## Porque um objecto so para as tabelas
 *
 * Porque e' **a mesma extracao que escreve o modulo Python e o Java**, e nao uma
 * transcricao. A regra deste repositorio e' nao escrever as tabelas de memoria,
 * e a segunda leitura dessa regra e' nao as escrever duas vezes — que e' o que
 * acontece quando cada stack transcreve a sua.
 *
 * ## A notacao de 'N' e 'W'
 *
 *     `N` barra estreita    `n` espaco estreito
 *     `W` barra larga       `w` espaco largo
 *
 * **Decide a letra, e nao a caixa.** `W` e `w` sao largos, `N` e `n` sao
 * estreitos, e a caixa existia so por legibilidade. Ler pela caixa dava ao ITF
 * uma moldura de inicio com barras largas onde o formato nao tem nenhuma, e o
 * codigo saia com 45 modulos a mais.
 */
object Tabelas {

    /** O Code 39, por ordem, com o asterisco de inicio e paragem a parte. */
    const val COD39_ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"

    /** Cada entrada tem quinze caracteres, ja expandidos a 3:1. */
    val COD39_PADROES: Array<String> = arrayOf(
        "101000111011101",
        "111010001010111",
        "101110001010111",
        "111011100010101",
        "101000111010111",
        "111010001110101",
        "101110001110101",
        "101000101110111",
        "111010001011101",
        "101110001011101",
        "111010100010111",
        "101110100010111",
        "111011101000101",
        "101011100010111",
        "111010111000101",
        "101110111000101",
        "101010001110111",
        "111010100011101",
        "101110100011101",
        "101011100011101",
        "111010101000111",
        "101110101000111",
        "111011101010001",
        "101011101000111",
        "111010111010001",
        "101110111010001",
        "101010111000111",
        "111010101110001",
        "101110101110001",
        "101011101110001",
        "111000101010111",
        "100011101010111",
        "111000111010101",
        "100010111010111",
        "111000101110101",
        "100011101110101",
        "100010101110111",
        "111000101011101",
        "100011101011101",
        "100010001000101",
        "100010001010001",
        "100010100010001",
        "101000100010001",
    )

    /** O asterisco de inicio e de paragem. */
    const val COD39_PARAGEM = "100010111011101"

    /** O ITF: cinco elementos por digito. */
    val ITF_PADROES: Array<String> = arrayOf(
        "NNWWN",
        "WNNNW",
        "NWNNW",
        "WWNNN",
        "NNWNW",
        "WNWNN",
        "NWWNN",
        "NNNWW",
        "WNNWN",
        "NWNWN",
    )

    /** A moldura de inicio do ITF, com quatro elementos estreitos. */
    const val ITF_INICIO = "NnNn"

    /**
     * A moldura de paragem do ITF, com **tres** elementos: barra larga, espaco
     * estreito, barra estreita. Sao tres e nao dois — a segunda versao tinha
     * dois e o codigo nao lia.
     */
    const val ITF_PARAGEM = "WnN"

    /**
     * Os caracteres de dados do Codabar, por letra.
     *
     * **Os quatro de moldura nao estao aqui**, e sao de propósito: `A`, `B`, `C`
     * e `D` so existem nas pontas, e um `A` no meio do texto era codificado com
     * a tabela de dados e o leitor lia-o como moldura — o codigo passava a parte
     * estrutural e partia a meio.
     */
    val CODABAR_DADOS: Map<String, String> = mapOf(
        "$" to "NnWwNnN",
        "+" to "NnWnWnW",
        "-" to "NnNwWnN",
        "." to "WnWnWnN",
        "/" to "WnWnNnW",
        "0" to "NnNnNwW",
        "1" to "NnNnWwN",
        "2" to "NnNwNnW",
        "3" to "WwNnNnN",
        "4" to "NnWnNwN",
        "5" to "WnNnNwN",
        "6" to "NwNnNnW",
        "7" to "NwNnWnN",
        "8" to "NwWnNnN",
        "9" to "WnNwNnN",
        ":" to "WnNnWnW",
    )

    /** Os quatro caracteres que so podem ser inicio ou paragem. */
    val CODABAR_MOLDURA: Map<String, String> = mapOf(
        "A" to "NnWwNwN",
        "B" to "NwNwNnW",
        "C" to "NnNwNwW",
        "D" to "NnNwWwN",
    )

    /**
     * O Code 128: os 106 primeiros valores, por indice.
     *
     * **Cada entrada tem onze caracteres, ja expandidos**, e nao os seis
     * elementos `NnWw` dos outros: a cadeia e' a soma das larguras dos seis
     * elementos, e as larguras vao de 1 a 4.
     */
    val CODE128_PADROES: Array<String> = arrayOf(
        "11011001100",
        "11001101100",
        "11001100110",
        "10010011000",
        "10010001100",
        "10001001100",
        "10011001000",
        "10011000100",
        "10001100100",
        "11001001000",
        "11001000100",
        "11000100100",
        "10110011100",
        "10011011100",
        "10011001110",
        "10111001100",
        "10011101100",
        "10011100110",
        "11001110010",
        "11001011100",
        "11001001110",
        "11011100100",
        "11001110100",
        "11101101110",
        "11101001100",
        "11100101100",
        "11100100110",
        "11101100100",
        "11100110100",
        "11100110010",
        "11011011000",
        "11011000110",
        "11000110110",
        "10100011000",
        "10001011000",
        "10001000110",
        "10110001000",
        "10001101000",
        "10001100010",
        "11010001000",
        "11000101000",
        "11000100010",
        "10110111000",
        "10110001110",
        "10001101110",
        "10111011000",
        "10111000110",
        "10001110110",
        "11101110110",
        "11010001110",
        "11000101110",
        "11011101000",
        "11011100010",
        "11011101110",
        "11101011000",
        "11101000110",
        "11100010110",
        "11101101000",
        "11101100010",
        "11100011010",
        "11101111010",
        "11001000010",
        "11110001010",
        "10100110000",
        "10100001100",
        "10010110000",
        "10010000110",
        "10000101100",
        "10000100110",
        "10110010000",
        "10110000100",
        "10011010000",
        "10011000010",
        "10000110100",
        "10000110010",
        "11000010010",
        "11001010000",
        "11110111010",
        "11000010100",
        "10001111010",
        "10100111100",
        "10010111100",
        "10010011110",
        "10111100100",
        "10011110100",
        "10011110010",
        "11110100100",
        "11110010100",
        "11110010010",
        "11011011110",
        "11011110110",
        "11110110110",
        "10101111000",
        "10100011110",
        "10001011110",
        "10111101000",
        "10111100010",
        "11110101000",
        "11110100010",
        "10111011110",
        "10111101110",
        "11101011110",
        "11110101110",
        "11010000100",
        "11010010000",
        "11010011100",
    )

    /**
     * A paragem do Code 128: treze modulos, sete elementos.
     *
     * **E' a unica tabela que nao vem do `python-barcode`, porque a da
     * biblioteca esta truncada** — onze modulos em vez de treze, sem a barra
     * final. Com a cadeia da biblioteca o ZXing devolve "NAO LEU" e com esta
     * devolve a string certa. A barra e' a ancora do leitor, porque o Code 128
     * nao tem barras-guarda como o EAN.
     */
    const val CODE128_PARAGEM = "1100011101011"

    /**
     * O padrao de um caracter do Codabar, ou `null` se nao existir.
     *
     * **A moldura e' procurada primeiro, e `A`, `B`, `C` e `D` devolvem o padrao
     * de moldura** — que e' o que esta funcao promete: o padrao daquele
     * caractere. Quem recusa um `A` no meio dos dados e' o encoder, e nao esta
     * funcao; aqui so se resolve o nome.
     *
     * **Um `A` nos dados e' um bug de leitura, nao de codificacao.** O encoder
     * desenhava o mesmo, e o leitor lia-o como moldura: o codigo passava a parte
     * estrutural e partia a meio, sem erro nenhum pelo caminho.
     */
    fun codabar(caractere: String): String? =
        CODABAR_MOLDURA[caractere] ?: CODABAR_DADOS[caractere]
}
