package com.qrcodegen.core.simbologias;

import java.util.ArrayList;
import java.util.List;

/**
 * GS1 DataMatrix.
 *
 * <p><strong>O Data Matrix com o FNC1, e nada mais.</strong> E' o que vai na etiqueta
 * de uma ampola de farmacia e de um chip: quadradinho, minusculo, e com a
 * capacidade de um simbolo que se le de longe e de lado.
 *
 * <h2>O que muda em relacao ao Data Matrix</h2>
 *
 * <p>Duas coisas, e as duas sao o FNC1 — o codeword {@value DataMatrix#FNC1}:
 *
 * <ol>
 *   <li><strong>No inicio</strong>, logo no primeiro codeword de dados. E' o que diz ao
 *       leitor "isto e' GS1" e nao texto solto.</li>
 *   <li><strong>No fim de cada campo de comprimento variavel</strong>, menos no ultimo.
 *       E' o separador, e e' o que permite ao leitor saber onde acaba
 *       {@code (10)LOTE-A1} e onde comeca o campo seguinte.</li>
 * </ol>
 *
 * <h2>Porque isto nao e' "o texto com um 232 a frente"</h2>
 *
 * <p><strong>O 232 e' simultaneamente o FNC1 e o par de digitos "02"</strong>, porque
 * {@code 232 - 130 = 102}. So a posicao os distingue: na posicao 0 e' o FNC1, no meio e'
 * um "02" qualquer. Passar pelo {@link DataMatrix#compactar} perderia essa estrutura, e
 * o separador no meio do lote seria lido como os digitos "02".
 *
 * <p>Por isso o encoder emite codewords e nao texto, e por isso que o
 * {@link DataMatrix#dataMatrixDeCodewords} existe. Todo o resto — a escolha do simbolo,
 * o enchimento, a correccao de erros, a colocacao — <strong>e' o mesmo</strong> que o
 * Data Matrix normal, porque uma segunda implementacao de cada uma delas seria uma
 * segunda fonte de verdade sobre a parte que o ZXing verifica.
 *
 * <h2>A validacao dos AI vem do GS1-128, e nao e' uma copia</h2>
 *
 * <p>A tabela dos 541 AIs, o {@code fixo}, o {@code maximo}, o {@code resto} e o
 * {@code regex} da GS1 sao <strong>os mesmos</strong> que o GS1-128 usa, e vem do
 * {@link Gs1_128#analisar} com um rotulo. <strong>Nao ha uma segunda tabela de AI nem
 * uma segunda notacao</strong>: os campos de um GS1 DataMatrix sao os mesmos campos de
 * um GS1-128, e um {@code (10)} tem o mesmo comprimento num e no outro.
 *
 * <p>O que muda e' so a notacao dos AIs <strong>dentro do simbolo</strong>: no Data
 * Matrix, os digitos do AI e do valor numerico vao no modo de digitos, que emparelha e
 * soma 130. E e' por isso que o FNC1 e' ambiguo — o "02" de {@code (02)} e o 232 sao o
 * mesmo codeword.
 */
public final class Gs1_DataMatrix {

    /**
     * O rotulo do formato, para as mensagens de recusa.
     *
     * <p>O {@link Gs1_128#analisar} e' o mesmo para os dois formatos, e o rotulo diz qual
     * deles esta' a ser codificado.
     */
    static final String ROTULO = "GS1 DataMatrix";

    /**
     * O GS que separa os campos, o mesmo byte que o leitor devolve.
     *
     * <p><strong>E' publico porque o teste de leitura precisa dele.</strong> O ZXing
     * escreve o separador no {@code getText()} como {@code 0x1D}, e o teste compara
     * esse texto com o payload que o encoder montou — sem a constante nao ha como
     * escrever a comparacao sem repetir o {@code "0x1D"} a mao, que e' a razao de as
     * duas metades deixarem de bater. **E' a mesma razao que o {@code GS} do GS1-128
     * e' publico.**
     */
    public static final char GS = Gs1_128.GS;

    private Gs1_DataMatrix() {
    }

    /**
     * O modo de digitos: emparelha e soma 130.
     *
     * <p>O Data Matrix tem um modo so para numeros, em que dois digitos cabem num
     * codeword. O GS1 usa-o para <strong>os AI e para os valores numericos</strong>, que
     * e' o que torna o 232 ambiguo: o par "02" da {@code 2 + 130 = 132}, e o FNC1 e' 232.
     *
     * <p>Um digito que fica sem par — o ultimo de um AI com numero impar de digitos —
     * vai no modo ASCII, o valor mais um. Nao ha outro jeito: o modo de digitos trabalha
     * aos pares.
     */
    static int[] digitos(String texto) {
        List<Integer> saida = new ArrayList<>();
        int i = 0;

        while (i < texto.length()) {
            if (i + 1 < texto.length()) {
                saida.add(Integer.parseInt(texto.substring(i, i + 2)) + 130);
                i += 2;
            } else {
                saida.add((int) texto.charAt(i) + 1);
                i++;
            }
        }

        int[] resultado = new int[saida.size()];
        for (int j = 0; j < resultado.length; j++) {
            resultado[j] = saida.get(j);
        }
        return resultado;
    }

    /** O modo ASCII: o valor mais um. */
    static int[] ascii(String texto) {
        int[] resultado = new int[texto.length()];
        for (int i = 0; i < texto.length(); i++) {
            resultado[i] = (int) texto.charAt(i) + 1;
        }
        return resultado;
    }

    /**
     * O codigo GS1 DataMatrix.
     *
     * @param elementoString os campos na forma humana da GS1, com os AI entre
     *     parenteses: {@code (01)04012345678901(10)LOTE-A1}. Igual ao GS1-128, e pela
     *     mesma razao — e' a forma que a GS1 define e a que a pessoa le. Os parenteses
     *     nao vao para o simbolo.
     */
    public static CodigoGs1Matriz gs1DataMatrix(String elementoString) {
        List<CodigoGs1.Campo> campos = Gs1_128.analisar(elementoString, ROTULO);

        /*
         * Os codewords, na ordem: FNC1, e depois cada campo com o seu separador.
         *
         * **Cada campo vai codificado conforme o que e': o AI e os valores numericos no
         * modo de digitos, o resto em ASCII.** Um `(10)LOTE-A1` da o "10" em digitos e o
         * "LOTE-A1" em ASCII, e e' essa mistura que faz o 232 ser ambiguo.
         */
        List<Integer> valores = new ArrayList<>();
        valores.add(DataMatrix.FNC1);

        int ultimo = campos.size() - 1;
        for (int i = 0; i < campos.size(); i++) {
            CodigoGs1.Campo campo = campos.get(i);

            for (int cw : digitos(campo.ai())) {
                valores.add(cw);
            }

            // **O `numerico` decide do AI e nao do valor.** O `01` e' o GTIN e e' numerico
            // por definicao, e o `10` e' o lote e e' alfanumerico; perguntar "o valor so
            // tem digitos?" mandaria o lote para o modo de digitos, e o `LOTE` nao cabe
            // la. E o `numerico` que veio do `analisar`, que o tirou da tabela.
            int[] valor = campo.numerico() ? digitos(campo.conteudo()) : ascii(campo.conteudo());
            for (int cw : valor) {
                valores.add(cw);
            }

            // O separador vai no fim de cada campo variavel **excepto o ultimo**.
            //
            // **Um separador no fim nao separa de nada**, e o leitor accounta-o como parte
            // do campo seguinte.
            if (campo.separador() && i != ultimo) {
                valores.add(DataMatrix.FNC1);
            }
        }

        int[] codewords = new int[valores.size()];
        for (int i = 0; i < codewords.length; i++) {
            codewords[i] = valores.get(i);
        }

        CodigoMatriz codigo = DataMatrix.dataMatrixDeCodewords(codewords, ROTULO);

        StringBuilder gs1 = new StringBuilder();
        StringBuilder maquina = new StringBuilder();
        for (int i = 0; i < campos.size(); i++) {
            CodigoGs1.Campo campo = campos.get(i);
            gs1.append('(').append(campo.ai()).append(')').append(campo.valor());
            maquina.append(campo.ai()).append(campo.valor());
            if (campo.separador() && i != ultimo) {
                maquina.append(GS);
            }
        }

        return new CodigoGs1Matriz(codigo, gs1.toString(), maquina.toString(),
                gs1.toString(), campos, countar(codewords, DataMatrix.FNC1));
    }

    private static int countar(int[] codewords, int valor) {
        int quantos = 0;
        for (int cw : codewords) {
            if (cw == valor) {
                quantos++;
            }
        }
        return quantos;
    }

    /**
     * O registo, pelo id que o selector usa.
     *
     * <p><strong>A chave e' a mesma nos cinco clientes</strong>, e e' o que a
     * {@code AGENTS.md} chama de lista escrita duas vezes: o selector de formatos vive
     * no cliente e o registo vive no modulo, e nada os ligava. Um registo sem
     * {@code <option>} no selector e' um formato invisivel.
     */
    public static final java.util.Map<String, java.util.function.Function<String, CodigoGs1Matriz>>
            SIMBOLOGIAS_GS1_DATAMATRIX =
            java.util.Map.of("gs1-datamatrix", Gs1_DataMatrix::gs1DataMatrix);
}