package com.qrcodegen.core.simbologias;

/**
 * O resultado de uma simbologia de codigo de barras.
 *
 * <p><strong>Os {@code modulos} sao a grelha, e nao os pixels.</strong> A
 * grelha e' o que a correccao de erros reconstroi e o que o leitor mede; os
 * pixels sao uma escolha de quem desenha, e mudam com o tamanho pedido.
 *
 * <h2>As guardas</h2>
 *
 * <p>{@code guardas} sao os <strong>indices de modulo</strong> das barras que
 * descem mais do que o corpo, e nao os caracteres. O desenho usa-as para saber
 * o que e' guarda, e um codigo de barras sem elas desenha-se com tudo a mesma
 * altura — o que alguns leitores aceitam e outros nao, e e' o tipo de falha que
 * a {@code AGENTS.md} diz que nunca entra: nao ha "quase".
 *
 * <p><strong>Uma lista vazia e' um valor legitimo</strong>, e nao a mesma coisa
 * que {@code null}: o Code 128 nao tem guardas, porque e' a barra final da
 * paragem que serve de referencia. Confundir as duas coisas dava um codigo que
 * o ZXing lia e um leitor de etiqueta recusava.
 */
public final class CodigoDeBarras {

    private final String simbologia;
    private final boolean[] modulos;
    private final int[] guardas;
    private final String legenda;

    public CodigoDeBarras(String simbologia, boolean[] modulos, int[] guardas, String legenda) {
        this.simbologia = simbologia;
        this.modulos = modulos;
        this.guardas = guardas;
        this.legenda = legenda;
    }

    public String simbologia() {
        return simbologia;
    }

    /** A grelha: {@code true} e' barra escura, {@code false} e' espaco. */
    public boolean[] modulos() {
        return modulos;
    }

    /** Os indices de modulo das guardas, ou uma lista vazia se nao as houver. */
    public int[] guardas() {
        return guardas;
    }

    /** O texto que o leitor vai devolver. */
    public String legenda() {
        return legenda;
    }
}