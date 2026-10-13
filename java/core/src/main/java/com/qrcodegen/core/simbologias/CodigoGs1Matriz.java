package com.qrcodegen.core.simbologias;

import java.util.List;

/**
 * O resultado de um GS1 DataMatrix.
 *
 * <p><strong>E' uma classe a parte, e nao {@link CodigoMatriz} com dois campos a
 * mais</strong>, pela mesma razao que o {@link CodigoGs1} e' a parte do
 * {@link CodigoDeBarras}: o que o leitor precisa saber — <strong>onde acaba cada
 * campo</strong> e <strong>quantos separadores foram emitidos</strong> — nao existe
 * num {@code CodigoMatriz} nem num {@code CodigoDeBarras}.
 *
 * <p><strong>E' 2D, e por isso que o {@code codigo()} devolve um
 * {@link CodigoMatriz}</strong> e nao um {@code CodigoDeBarras}: o desenho de um GS1
 * DataMatrix e' uma grelha com guias, como qualquer Data Matrix, e a conversao e' uma
 * convenience — o formato do codigo e' o {@link CodigoMatriz} com os campos GS1
 * por cima.
 */
public final class CodigoGs1Matriz {

    private final CodigoMatriz codigo;
    private final String legenda;
    private final String payload;
    private final String gs1;
    private final List<CodigoGs1.Campo> campos;
    private final int separadores;

    /**
     * @param codigo a grelha e os codewords, ja' desenhados
     * @param legenda a forma humana, com os AIs entre parenteses
     * @param payload a forma de maquina, com o separador onde o encoder o pos
     * @param gs1 a forma legivel
     * @param campos os campos, na ordem em que foram escritos
     * @param separadores quantos FNC1 foram emitidos, contando o do inicio
     */
    public CodigoGs1Matriz(CodigoMatriz codigo, String legenda, String payload, String gs1,
            List<CodigoGs1.Campo> campos, int separadores) {
        this.codigo = codigo;
        this.legenda = legenda;
        this.payload = payload;
        this.gs1 = gs1;
        this.campos = List.copyOf(campos);
        this.separadores = separadores;
    }

    /** A grelha, como {@link CodigoMatriz}, para o desenho e para o ZXing. */
    public CodigoMatriz codigo() {
        return codigo;
    }

    /** Os campos, na ordem em que foram escritos. */
    public List<CodigoGs1.Campo> campos() {
        return campos;
    }

    /**
     * Quantos FNC1 foram emitidos, contando o do inicio.
     *
     * <p><strong>E' a unica coisa que apanha um separador a mais.</strong> No GS1-128
     * o numero de modulos nao apanha, porque o GS1-128 e o Code 128 dao o mesmo numero
     * de modulos com o mesmo texto. Aqui a diferenca e' o tamanho do simbolo — um
     * separador a mais da um codeword a mais e um simbolo possivelmente maior.
     */
    public int separadores() {
        return separadores;
    }

    /**
     * A forma de maquina: os AIs e os valores sem parenteses, com o separador
     * <strong>onde o encoder o pos</strong> — que e' o que o ZXing devolve em
     * {@code bytes}, com o {@code 0x1D} cru.
     */
    public String payload() {
        return payload;
    }

    /** A forma legivel. */
    public String gs1() {
        return gs1;
    }

    /**
     * A forma humana, com os AIs entre parenteses e <strong>sem</strong> separador —
     * que e' a que o ZXing devolve em {@code text}.
     */
    public String legenda() {
        return legenda;
    }
}