package com.qrcodegen.core.simbologias;

/**
 * As tabelas dos codigos de barras de uma linha, extraidas do
 * `python-barcode`.
 *
 * <pre>
 *     python spec/gerar-tabelas-lineares.py
 * </pre>
 *
 * <strong>NAO EDITE ESTE FICHEIRO A MAO.</strong> E' gerado, e a razao esta no
 * Python: a tabela do Code 39 foi escrita de memoria com doze elementos por
 * caractere em vez de nove, e a do ITF com dois na moldura de paragem em vez
 * de tres. Nenhum dos dois foi apanhado por um teste — desenhavam-se com aspecto
 * de estar certo e o leitor nao lia.
 *
 * <h2>Porquê uma classe so para isto</h2>
 *
 * <p>Porque e' <strong>a mesma extracao que escreve o modulo Python</strong>, e
 * nao uma transcricao. Um {@code String[]} copiado a mao da lista do Python e' a
 * mesma tabela duas vezes, e diverge no mesmo silencio — e sem nenhum teste de
 * estrutura que as compare, porque cada stack so conhece a sua.
 *
 * <p>E' por isso que {@code modulosMaximos} e as formas do FieldQR do web usam
 * o mesmo codigo e nao duas implementacoes: a regra deste repositorio e' nao
 * escrever as tabelas de memoria, e a segunda leitura dessa regra e' nao as
 * escrever duas vezes.
 *
 * <h2>A notacao de 'N' e 'W'</h2>
 *
 * <p><code>N</code> barra estreita, <code>n</code> espaco estreito,
 * <code>W</code> barra larga, <code>w</code> espaco largo.
 *
 * <p><strong>Maiuscula e' largo, minuscula e' estreito — e nao barra e
 * espaco.</strong> Sao duas perguntas independentes, e mistura-las produz uma
 * barra inicial com a largura do espaco.
 */
public final class Tabelas {

    private Tabelas() {
    }

    /** O Code 39, por ordem, com o asterisco de inicio e paragem a parte. */
    public static final String COD39_ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

    /** Cada entrada tem quinze caracteres, ja expandidos a 3:1. */
    public static final String[] COD39_PADROES = {
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
    };

    /** O asterisco de inicio e de paragem. */
    public static final String COD39_PARAGEM = "100010111011101";

    /** O ITF: cinco elementos por digito. */
    public static final String[] ITF_PADROES = {
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
    };

    /** A moldura de inicio do ITF, com quatro elementos estreitos. */
    public static final String ITF_INICIO = "NnNn";

    /**
     * A moldura de paragem do ITF, com <strong>tres</strong> elementos: barra
     * larga, espaco estreito, barra estreita. Sao tres e nao dois — a segunda
     * versao tinha dois e o codigo nao lia.
     */
    public static final String ITF_PARAGEM = "WnN";

    /** O Codabar, por caracter de dados: sete elementos cada. */
    private static final String[] CODABAR_CHAVES = {
        "$",
        "+",
        "-",
        ".",
        "/",
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        ":",
    };

    private static final String[] CODABAR_VALORES = {
        "NnWwNnN",
        "NnWnWnW",
        "NnNwWnN",
        "WnWnWnN",
        "WnWnNnW",
        "NnNnNwW",
        "NnNnWwN",
        "NnNwNnW",
        "WwNnNnN",
        "NnWnNwN",
        "WnNnNwN",
        "NwNnNnW",
        "NwNnWnN",
        "NwWnNnN",
        "WnNwNnN",
        "WnNnWnW",
    };

    /** Os quatro caracteres que so podem ser inicio ou paragem. */
    private static final String[] CODABAR_MOLDURA_CHAVES = {
        "A",
        "B",
        "C",
        "D",
    };

    private static final String[] CODABAR_MOLDURA_VALORES = {
        "NnWwNwN",
        "NwNwNnW",
        "NnNwNwW",
        "NnNwWwN",
    };

    /**
     * O Code 128: os 106 primeiros valores, por indice.
     *
     * <p><strong>Cada entrada tem onze caracteres, ja expandidos</strong>, e nao
     * os seis elementos <code>NnWw</code> dos outros: a cadeia e' a soma das
     * larguras dos seis elementos.
     */
    public static final String[] CODE128_PADROES = {
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
    };

    /**
     * A paragem do Code 128: treze modulos, sete elementos.
     *
     * <p><strong>E' a unica tabela deste ficheiro que nao vem do
     * `python-barcode`, porque a da biblioteca esta truncada</strong> — onze
     * modulos em vez de treze, sem a barra final. Com a cadeia da biblioteca o
     * ZXing devolve "NAO LEU" e com esta devolve a string certa. A barra e' a
     * ancora do leitor, porque o Code 128 nao tem barras-guarda como o EAN.
     */
    public static final String CODE128_PARAGEM = "1100011101011";

    /**
     * O padrao de um caracter do Codabar, ou {@code null} se nao existir.
     *
     * <p><strong>O Codabar tem duas tabelas e uma funcao</strong>, e nao uma
     * tabela com tudo: os quatro caracteres de moldura so podem ser inicio ou
     * paragem, e por isso vivem separadas. Uma tabela unica dava ao encoder a
     * possibilidade de codificar um <code>A</code> nos dados, e o leitor lia-o
     * como uma moldura — o codigo passava a parte estrutural e partia a meio.
     */
    public static String codabar(String caractere) {
        for (int i = 0; i < CODABAR_MOLDURA_CHAVES.length; i++) {
            if (CODABAR_MOLDURA_CHAVES[i].equals(caractere)) {
                return CODABAR_MOLDURA_VALORES[i];
            }
        }

        for (int i = 0; i < CODABAR_CHAVES.length; i++) {
            if (CODABAR_CHAVES[i].equals(caractere)) {
                return CODABAR_VALORES[i];
            }
        }

        return null;
    }

    /** As medidas do Codabar nas duas variantes de espacado. */
    public static final int[] CODABAR_ESTREITO = {2, 2};
    public static final int[] CODABAR_LARGO = {2, 2};
}
