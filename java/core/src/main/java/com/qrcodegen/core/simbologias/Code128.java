package com.qrcodegen.core.simbologias;

import java.util.ArrayList;
import java.util.List;

/**
 * Code 128.
 *
 * <h2>O que o torna o unico codigo que codifica os 128 caracteres do ASCII</h2>
 *
 * <p>Sao tres conjuntos de caracteres que se sobrepoem, e o encoder muda de um
 * para o meio:
 *
 * <ul>
 *   <li><strong>A</strong> — os controlos (ASCII 0-31) e as maiusculas</li>
 *   <li><strong>B</strong> — o ASCII imprimivel (32-127)</li>
 *   <li><strong>C</strong> — so digitos, dois de cada vez (valores 0-99)</li>
 * </ul>
 *
 * <p>O conjunto {@code C} e' o que torna o Code 128ozinho: um numero de dez
 * digitos ocupa cinco caracteres em vez de dez. E por isso que a logistica o usa.
 *
 * <h2>A troca de conjunto, que e' a unica coisa realmente dificil</h2>
 *
 * <p>Os tres conjuntos se sobrepoem, e <strong>ambos o A e o B usam o mesmo valor
 * para as maiusculas</strong>. O leitor nao sabe em que conjunto le sem uma
 * pista, e a pista e' o caracter de troca.
 *
 * <p><strong>Sem a troca o codigo desenha-se com o comprimento certo, o leitor
 * le, e devolve caracteres completamente errados</strong> — {@code ABC123} volta
 * como {@code ABC,3}. Foi o primeiro bug deste encoder no repositorio, apanhado
 * pelo ZXing e por nenhum teste estrutural, porque o comprimento batia certo.
 *
 * <h2>O valor de verificacao nao e' um digito</h2>
 *
 * <p>E' a <strong>soma ponderada dos valores de conjunto, modulo 103</strong> — o
 * inicio mais cada valor multiplicado pela sua posicao, a primeira a valer 1.
 * <strong>Pode valer de 0 a 102</strong>, porque um valor de troca de conjunto e'
 * 101 e o {@code FNC1} e' 102.
 *
 * <p>Um verificador de EAN aplicado aqui daria sempre um valor errado, e o
 * sintoma seria o pior dos possiveis: o codigo <strong>desenha-se, o leitor le-o,
 * e recusa-o</strong> por causa da unica coisa que ele nao sabe corrigir.
 */
public final class Code128 {

    private Code128() {
    }

    /** Os valores de inicio, por conjunto. */
    private static final int[] INICIO = {0, 103, 104, 105};

    /**
     * Os valores que mudam de conjunto, e o valor de inicio, por indice do
     * conjunto: {@code 1} e' A, {@code 2} e' B, {@code 3} e' C.
     *
     * <p><strong>E' uma tabela e nao tres constantes</strong> porque o codigo
     * circula por um indice numerico — o {@code conjunto} e' {@code 1}, {@code 2}
     * ou {@code 3} — e um array de tres entradas e' mais barato de comparar do
     * que um {@code switch} com nomes.
     */
    private static final int[] IR_PARA = {0, 101, 100, 99};

    private static final int PARAGEM = 106;

    /**
     * Os modulos de um valor, alternando barra e espaco a partir da barra.
     *
     * <p><strong>A posicao e' que diz a cor, e nao o digito da cadeia</strong> —
     * a cadeia so tem {@code 0} e {@code 1} para dizer a largura, e a barra
     * inicial e' sempre barra.
     */
    private static List<Boolean> modulosDoValor(int valor) {
        if (valor < 0 || valor > PARAGEM) {
            throw new SimbologiaException("Code 128: o valor " + valor + " nao existe");
        }

        String cadeia = valor == PARAGEM
            ? Tabelas.CODE128_PARAGEM
            : Tabelas.CODE128_PADROES[valor];

        List<Boolean> saida = new ArrayList<>(cadeia.length());

        // **As larguras leem-se nas corridas**: a cadeia e' a soma das larguras dos
        // seis elementos, e nao os elementos. Uma corrida de um e' um elemento
        // estreito, e uma de tres e' um largo.
        int atual = 0;
        int contagem = 1;
        for (int i = 0; i < cadeia.length(); i++) {
            if (cadeia.charAt(i) == cadeia.charAt(atual)) {
                contagem++;
            } else {
                empurrar(cadeia.charAt(atual), contagem, i, saida);
                atual = i;
                contagem = 1;
            }
        }
        empurrar(cadeia.charAt(atual), contagem, cadeia.length(), saida);

        return saida;
    }

    private static void empurrar(char bit, int largura, int posicao, List<Boolean> saida) {
        boolean escuro = posicao % 2 == 0;
        for (int k = 0; k < largura; k++) {
            saida.add(Boolean.valueOf(escuro));
        }
    }

    /**
     * O valor de um caracter ASCII dentro de um conjunto.
     *
     * <p><strong>No {@code A}, os valores 0 a 63 sao o proprio ASCII e os 64 a 95
     * sao as maiusculas com 32 subtraidos</strong> — e' a diferenca entre o
     * conjunto A e o B. {@code A} vale 33 no A e 65 no B, e e' essa diferenca que
     * torna a troca de conjunto obrigatoria em vez de opcional.
     */
    private static int valorNoConjunto(char c, int conjunto) {
        int codigo = c;
        if (conjunto == 1) {
            return codigo <= 63 ? codigo : codigo - 32;
        }
        return codigo - 32;
    }

    /**
     * O conjunto em que vale a pena codificar a partir desta posicao.
     *
     * <p><strong>Dois digitos seguidos vao em {@code C}</strong>, porque dois
     * caracteres cabem num so valor de 0 a 99. Um digito isolado <strong>nao</strong>:
     * sair de {@code B} para {@code C} e voltar custa tres caracteres para gravar
     * um, e o codigo fica maior sem ganho.
     */
    private static int melhorConjunto(String texto, int i) {
        if (i + 1 < texto.length() && isDigito(texto.charAt(i)) && isDigito(texto.charAt(i + 1))) {
            return 3;
        }
        if (texto.charAt(i) < 32) {
            return 1;
        }
        return 2;
    }

    /**
     * Com que conjunto se comeca.
     *
     * <p><strong>So o {@code C} vale a pena quando ha quatro digitos
     * seguidos</strong> — ai cada par gasta um caracter em vez de dois, e o ganho
     * paga a troca. Com dois digitos o {@code C} poupa um caracter e a troca custa
     * um: fica igual, e nao vale a pena.
     *
     * <p><strong>O {@code A} so quando o texto comeca por um controlo.</strong> As
     * maiusculas vivem em A e em B com o mesmo valor, e o B tambem transporta os
     * minusculos, portanto comecar em A para uma letra nao traria nada.
     */
    private static int conjuntoInicial(String texto) {
        if (texto.charAt(0) < 32) {
            return 1;
        }
        for (int i = 0; i + 3 < texto.length(); i++) {
            boolean quatro = true;
            for (int k = 0; k < 4; k++) {
                if (!isDigito(texto.charAt(i + k))) {
                    quatro = false;
                    break;
                }
            }
            if (quatro) {
                return 3;
            }
        }
        return 2;
    }

    private static boolean isDigito(char c) {
        return c >= '0' && c <= '9';
    }

    /**
     * O texto na lista de valores, ja com as trocas de conjunto.
     *
     * <p><strong>A cada posicao pergunta-se qual e' o melhor conjunto para o que
     * vem a seguir, e se for diferente do em que estamos emite-se o caracter de
     * troca.</strong>
     */
    private static int[] valores(String texto, int conjuntoForcado) {
        int conjunto = conjuntoForcado > 0 ? conjuntoForcado : conjuntoInicial(texto);
        List<Integer> saida = new ArrayList<>();
        saida.add(INICIO[conjunto]);

        int i = 0;
        while (i < texto.length()) {
            int desejado = conjuntoForcado > 0 ? conjuntoForcado : melhorConjunto(texto, i);

            if (desejado != conjunto) {
                saida.add(IR_PARA[desejado]);
                conjunto = desejado;
            }

            if (conjunto == 3) {
                saida.add(Integer.valueOf(
                    Integer.parseInt(texto.substring(i, i + 2))));
                i += 2;
            } else {
                saida.add(Integer.valueOf(valorNoConjunto(texto.charAt(i), conjunto)));
                i += 1;
            }
        }

        int[] resultado = new int[saida.size()];
        for (int k = 0; k < resultado.length; k++) {
            resultado[k] = saida.get(k).intValue();
        }
        return resultado;
    }

    /**
     * Code 128, com os conjuntos escolhidos pelo encoder.
     */
    public static CodigoDeBarras code128(String valor) {
        return _code128(valor, 0);
    }

    /**
     * Code 128, com o conjunto forcado.
     *
     * @param conjuntoForcado {@code 1}, {@code 2} ou {@code 3}; {@code 0} deixa
     *     o encoder escolher
     *
     * <p><strong>Forcar um conjunto serve para comparar com outra
     * implementacao, nunca em producao</strong>: forcar o {@code C} sobre texto
     * que nao e' todo de digitos da um codigo maior sem ganho nenhum.
     */
    public static CodigoDeBarras code128(String valor, int conjuntoForcado) {
        /*
         * **A precedencia do `&&` e do `||` e' o que fez esta linha errada.**
         *
         * A primeira versao escrevia `f != 0 && f < 1 || f > 3`, e o Java le
         * `&&` antes de `||` — ou seja, `(f != 0 && f < 1) || (f > 3)`. O
         * primeiro termo e' sempre falso (ou `f` e' 0 e a segunda parte e' o que
         * conta, ou `f` e' pelo menos 1 e `f < 1` e' falso), e o resultado da
         * expressao e' um **`boolean`** que da para usar. Compilava, e o que
         * compilava era outra coisa: o `f < 1` nunca chegava a ser avaliado
         * como erro.
         *
         * **Com os parenteses a intenção fica visível e deixa de haver segunda
         * leitura possível.**
         */
        if ((conjuntoForcado != 0 && conjuntoForcado < 1) || conjuntoForcado > 3) {
            throw new SimbologiaException(
                "Code 128: o conjunto tem de ser A, B ou C.");
        }
        return _code128(valor, conjuntoForcado);
    }

    private static CodigoDeBarras _code128(String valor, int conjuntoForcado) {
        String texto = valor == null ? "" : valor;

        if (texto.isEmpty()) {
            throw new SimbologiaException("Code 128: o texto esta vazio.");
        }

        for (int i = 0; i < texto.length(); i++) {
            int codigo = texto.charAt(i);
            if (codigo == 128) {
                throw new SimbologiaException(
                    "Code 128: o valor 128 e' o da paragem e nao pode estar nos dados.");
            }
            if (codigo > 127) {
                throw new SimbologiaException(
                    "Code 128: so ASCII, e '" + texto.charAt(i) + "' (U+"
                        + String.format("%04X", Integer.valueOf(codigo)) + ") nao e. "
                        + "Para acentos e alfabetos nao latinos use o QR.");
            }
        }

        int[] dados = valores(texto, conjuntoForcado);

        int soma = dados[0];
        for (int i = 1; i < dados.length; i++) {
            soma += dados[i] * i;
        }
        int verificacao = soma % 103;

        List<Integer> todos = new ArrayList<>(dados.length + 2);
        for (int d : dados) {
            todos.add(Integer.valueOf(d));
        }
        todos.add(Integer.valueOf(verificacao));
        todos.add(Integer.valueOf(PARAGEM));

        List<Boolean> modulos = new ArrayList<>();
        for (int v : todos) {
            // **O `v` ja e' um `int`.** Um `for (int v : List<Integer>)`
            // desempaca o `Integer` sozinho, e um `.intValue()` aqui dava "int
            // cannot be dereferenced" — que e' o compilador a dizer que o `v` ja
            // foi desempacado e que a segunda caixa nao existe.
            modulos.addAll(modulosDoValor(v));
        }

        boolean[] grelha = new boolean[modulos.size()];
        for (int i = 0; i < grelha.length; i++) {
            grelha[i] = modulos.get(i).booleanValue();
        }

        /*
         * **Guardas vazias, e nao as pontas.**
         *
         * O Code 128 nao tem barras-guarda como o EAN: e' a barra final de dois
         * modulos da paragem que serve de referencia. Marcar as pontas como
         * guardas fazia-as descer mais do que o leitor espera, e dava um codigo
         * que o ZXing lia e um leitor de etiqueta recusava — que e' o nivel tres
         * da AGENTS.md, o que so se descobre a exportar.
         */
        return new CodigoDeBarras("Code 128", grelha, new int[0], texto);
    }

    /** O valor de verificacao, para um texto. Util em testes e na interface. */
    public static int verificacao(String texto) {
        int[] dados = valores(texto, 0);
        int soma = dados[0];
        for (int i = 1; i < dados.length; i++) {
            soma += dados[i] * i;
        }
        return soma % 103;
    }

    /** Os valores de conjunto de um texto, ja com as trocas. Para testes. */
    public static int[] valoresDe(String texto) {
        return valores(texto, 0);
    }
}