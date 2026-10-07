package com.qrcodegen.core.simbologias;

/**
 * O resultado de uma simbologia <strong>bidimensional</strong>.
 *
 * <p><strong>E' uma classe a parte, e nao {@link CodigoDeBarras} com a
 * matriz achatada.</strong> Nao e' por haver mais um campo: e' porque as duas
 * coisas que os separam nao sao opcoes.
 *
 * <h2>As guardas nao existem</h2>
 *
 * <p>Num codigo de barras as guardas sao os <em>indices de modulo</em> das barras
 * que descem abaixo do corpo, e sao a ancora de um leitor de mao. Num codigo 2D
 * <strong>a orientacao vem das guias em L nas pontas</strong> — uma cheia em baixo
 * e a esquerda, outra tracejada em cima e a direita — e essas guias ja estao nos
 * modulos que o encoder devolveu. Nao ha nada a acrescentar, e um
 * {@code guardas} vazio seria um campo que o desenho le e nao usa.
 *
 * <h2>A legenda nao existe</h2>
 *
 * <p>Um EAN-13 tem os dois digitos impressos por baixo do codigo, e o C# ja
 * apanhou o custo de os perder: o leitor funciona e a folha impressa nao bate com
 * o que esta inscrito. Um codigo 2D nao tem texto impresso por baixo, e meter
 * um campo para ele seria um campo vazio que parece uma omissao.
 *
 * <p><strong>Um campo que existe e esta sempre vazio e' pior do que um campo que
 * nao existe</strong>, porque quem o le nao sabe se o encoder se esqueceu ou se
 * e' verdade.
 *
 * <h2>A matriz e' a grelha, e nao os pixels</h2>
 *
 * <p>{@code modulos[y][x]} e' {@code true} onde o modulo e' escuro. O que o ZXing
 * mede e' a grelha; os pixels sao uma escolha de quem desenha, e mudam com o
 * tamanho pedido.
 */
public final class CodigoMatriz {

    private final String simbologia;
    private final boolean[][] modulos;
    private final int[] codewords;
    private final int dados;
    private final int correccao;
    private final int usado;

    public CodigoMatriz(String simbologia, boolean[][] modulos, int[] codewords,
            int dados, int correccao, int usado) {
        this.simbologia = simbologia;
        this.modulos = modulos;
        this.codewords = codewords;
        this.dados = dados;
        this.correccao = correccao;
        this.usado = usado;
    }

    public String simbologia() {
        return simbologia;
    }

    /** A grelha: {@code true} e' modulo escuro, {@code false} e' modulo claro. */
    public boolean[][] modulos() {
        return modulos;
    }

    /** O numero de colunas da grelha, guias incluidas. */
    public int colunas() {
        return modulos[0].length;
    }

    /** O numero de linhas da grelha, guias incluidas. */
    public int linhas() {
        return modulos.length;
    }

    /** Os codewords de dados que o texto ocupa, antes do enchimento. */
    public int[] codewords() {
        return codewords;
    }

    /** A capacidade do simbolo escolhido, em codewords de dados. */
    public int dados() {
        return dados;
    }

    /** Quantos codewords de correccao de erros o simbolo tem. */
    public int correccao() {
        return correccao;
    }

    /** Quantos codewords de dados o texto ocupa. */
    public int usado() {
        return usado;
    }

    /**
     * Todos os modulos escuros, por linha.
     *
     * <p><strong>Os caracteres sao ASCII, e nao os blocos do terminal.</strong> Um
     * ficheiro Java com caracteres de desenho nao se abre igual em todo o lado,
     * e a fonte do console decide o que aparece - que e' a pior coisa para uma
     * representacao que existe precisamente para se ver.
     *
     * <p><strong>E' uma convenience para o desenho e para o teste</strong>, e
     * nao o formato do codigo. Um teste que affirmasse a lista dava um erro que
     * dizia "o modulo 47 da linha 3" em vez de dizer "(3, 47)", que e' onde o
     * problema esta'.
     */
    public String comoTexto() {
        StringBuilder saida = new StringBuilder();
        for (boolean[] linha : modulos) {
            for (boolean modulo : linha) {
                saida.append(modulo ? '#' : '.');
            }
            saida.append('\n');
        }
        return saida.toString();
    }
}