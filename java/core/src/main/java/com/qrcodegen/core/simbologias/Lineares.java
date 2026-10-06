package com.qrcodegen.core.simbologias;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Code 39, ITF-14 e Codabar.
 *
 * <h2>O bug que estes tres formatos partilham, e que a AGENTS.md ja registou</h2>
 *
 * <p><strong>O Code 39, o ITF e o Codabar tem um caracter de inicio que acaba
 * numa barra, e o primeiro caracter de dados comeca noutra.</strong> Sem um
 * espaco entre eles, as duas somam-se numa barra larga a mais.
 *
 * <p><strong>O sintoma e' o pior possivel:</strong> o codigo desenha-se com o
 * aspecto certo, o comprimento total e' quase o correcto, e o leitor devolve
 * outra coisa sem dizer porque. E' a razao de haver aqui um {@code _fechar}
 * explicito entre caracteres e nao uma concatenacao.
 *
 * <p><strong>O ITF e' a excecao que prova a regra.</strong> Nao leva separador
 * entre os pares, porque a intercalacao ja termina num espaco. Acrescentar o
 * separador do Code 39 junta dois espacos num so e desloca todos os digitos
 * seguintes: o codigo desenha-se com o aspecto certo e nao le nada.
 *
 * <h2>As larguras nao sao tabelas, e cada formato tem as suas</h2>
 *
 * <table>
 *   <caption>As larguras em modulos</caption>
 *   <tr><th></th><th>estreito</th><th>largo</th></tr>
 *   <tr><td>Code 39</td><td>1</td><td>3</td></tr>
 *   <tr><td>ITF</td><td>1</td><td>2</td></tr>
 *   <tr><td>Codabar</td><td>2</td><td>5</td></tr>
 * </table>
 *
 * <p><strong>O Codabar e' 5:2 e nao 3:1, e nao e' arbitrario.</strong> E' a
 * razao que a implementacao de referencia usa, e o leitor mede-a na moldura e
 * aplica-a a todo o resto. Um Codabar a 3:1 tem o aspecto certo e nao le,
 * porque a barra larga fica curta demais para o leitor a distinguir de duas
 * estreitas.
 *
 * <h2>A notacao de N e W</h2>
 *
 * <p><strong>Maiuscula e' largo, minuscula e' estreito â— e nao barra e
 * espaco.</strong> Sao duas perguntas independentes. E' aqui que a confusao
 * entre as duas coisas custa caro: ler a largura pela caixa da letra da ao
 * {@code w} a largura de um {@code n}, e o codigo sai sem um unico espaco largo.
 */
public final class Lineares {

    private Lineares() {
    }

    // --- o que os tres tem em comum ----------------------------------------

    /**
     * Acrescenta o espaco que separa este elemento do proximo.
     *
     * <p><strong>E' a funcao mais importante deste ficheiro.</strong> Sem ela,
     * o caracter de inicio â— que acaba em barra â— encosta ao primeiro caracter de
     * dados â— que comeca em barra â— e as duas fundem-se numa barra larga a mais.
     */
    private static void fechar(List<Boolean> modulos, int n) {
        for (int i = 0; i < n; i++) {
            modulos.add(Boolean.FALSE);
        }
    }

    /**
     * Converte {@code NnWw} em larguras.
     *
     * <p><strong>E' a letra que decide a largura, e nao a caixa.</strong> {@code W}
     * e {@code w} sao largos, {@code N} e {@code n} sao estreitos. A caixa
     * existia so por legibilidade — o {@code n} minúsculo distinguia o espaço
     * estreito da barra estreita, e as posicoes é que dizem qual é qual.
     *
     * <p><strong>Decidir pela caixa dava o ITF errado, e o sintoma era um
     * código que o ZXing não lia.</strong> A moldura de início do ITF é
     * {@code "NnNn"}, e os quatro elementos têm de ser estreitos. Lidos pela
     * caixa, davam largo-estreito-largo-estreito: 45 módulos a mais num ITF-14
     * de 14 dígitos, e a moldura de paragem errada pelo mesmo motivo.
     *
     * <p>O Python decide pela letra — o dicionário dele é
     * {@code {"N": 1, "n": 1, "W": 2, "w": 2}} — e as duas implementações têm
     * de decidir o mesmo, ou a paridade não fecha.
     *
     * <p><strong>E o que diz se o elemento é barra ou espaço é a
     * <strong>posição</strong>: 0, 2 e 4 são barras, 1 e 3 são espaços.</p>
     *
     * @param medidas a largura do elemento largo e do estreito
     */
    private static List<Boolean> modulosDe(String elementos, int[] medidas) {
        List<Boolean> saida = new ArrayList<>(elementos.length() * 2);
        for (int posicao = 0; posicao < elementos.length(); posicao++) {
            int largura = medidas[largura(elementos.charAt(posicao))];
            boolean escuro = posicao % 2 == 0;
            for (int k = 0; k < largura; k++) {
                saida.add(escuro);
            }
        }
        return saida;
    }

    private static boolean[] paraArray(List<Boolean> modulos) {
        boolean[] saida = new boolean[modulos.size()];
        for (int i = 0; i < saida.length; i++) {
            saida[i] = modulos.get(i);
        }
        return saida;
    }

        /**
     * Acrescenta uma faixa de indices as guardas.
     *
     * <p><strong>Existe porque {@code List.addAll(int[])} nao compila em Java.</strong>
     * Um {@code int[]} nao e' um {@code Collection}, e o compilador da erro em
     * vez de fazer a caixa sozinho â— o que e' o comportamento certo, porque
     * converter um array de {@code int} num {@code Collection} faz
     * {@code Integer} em cada elemento, e o custo aparece no que ninguem mede.
     */
    private static void acrescentarFaixa(List<Integer> guardas, int inicio, int fim) {
        for (int i = inicio; i < fim; i++) {
            guardas.add(i);
        }
    }

    // --- Code 39 ------------------------------------------------------------

    /** Os 43 caracteres, por indice. */
    private static final Map<Character, Integer> COD39_INDICE = new HashMap<>();

    static {
        String alfabeto = Tabelas.COD39_ALFABETO;
        for (int i = 0; i < alfabeto.length(); i++) {
            COD39_INDICE.put(alfabeto.charAt(i), i);
        }
    }

    /**
     * O indice de um caracter no alfabeto do Code 39.
     *
     * <p><strong>Existe porque um {@code Map<Character, Integer>} devolve
     * {@code Integer} e o Java nao desempaca sozinho.</strong> A primeira versao
     * indexava o array com {@code COD39_INDICE.get(c)}, e o compilador dava erro
     * em {@code Integer} e {@code int} — que e' o comportamento certo, porque
     * desempacar um {@code Integer} nulo rebenta em runtime e o compilador nao o
     * apanha.
     *
     * <p>E a funcao <strong>recusa o que nao existe</strong>, em vez de devolver
     * menos um e dar ao chamador um indice do fim da tabela. Um
     * {@code -1} silencioso e' o pior resultado possivel: produz um codigo com a
     * barra do ultimo caractere e nenhuma indicacao de que o texto tinha um
     * caracter invalido.
     */
    private static int indice39(char c) {
        Integer indice = COD39_INDICE.get(c);
        if (indice == null) {
            throw new SimbologiaException(
                "Code 39: o caracter '" + c + "' nao existe neste formato (sao "
                    + Tabelas.COD39_ALFABETO + ")");
        }
        return indice;
    }

    /**
     * Code 39. Os 43 caracteres do alfabeto, mais o asterisco de moldura.
     *
     * <p><strong>O digito de controlo e' o resto da divisao por 43.</strong>
     * Soma-se o indice de cada letra, divide-se por 43, e o digito e' a letra
     * que fica na posicao do resto. Vem ligado porque e' o que o web faz, e o
     * arbrito e' o web.
     *
     * <p><strong>Este comentario dizia antes o contrario, e foi quase um bug.</strong>
     * Afirmava que "a implementacao de referencia nao cumpre a regra", e a
     * regra que descrevia — a letra que torna a soma multipla de 43, ou seja
     * {@code (43 - soma % 43) % 43} — <strong>nao e' a do formato</strong>. A
     * regra e' o resto, e ha autoridade independente a provar:
     *
     * <ul>
     *   <li>A <strong>Zebra</strong>, na documentacao do ZPL, da o exemplo
     *       trabalhado: {@code 12345ABCDE/} soma 115, e {@code 115 / 43 = 2}
     *       com resto 29, e 29 e' a letra {@code T}.
     *   <li>O <strong>ZXing</strong>, lido com o {@code Code39Reader(true)} que
     *       valida o digito, aceita este e rejeita o complementar.
     *   <li>O <strong>python-barcode</strong>, de onde vem a tabela, faz o mesmo.
     * </ul>
     *
     * <p><strong>Anearly: as tres stacks e o script de leitura concordam.</strong>
     * Um comentario que descreve a regra ao contrario convida a "corrigir" tres
     * stacks para um erro, e foi o que aconteceu quando se leu este ficheiro sem
     * verificar. <strong>Uma regra que se sabe de cor merece um exemplo
     * publicado que a confirme</strong>, e nao uma confianca.
     *
     * <p><strong>O texto sobe a maiusculas, e nao e' opcional.</strong> O Code 39
     * e' caixa alta por desenho, e escrever minusculas nao dava um codigo
     * diferente: dava o mesmo codigo com a legenda diferente.
     */
    public static CodigoDeBarras code39(String valor) {
        return code39(valor, true);
    }

    public static CodigoDeBarras code39(String valor, boolean comControlo) {
        String texto = valor == null ? "" : valor.toUpperCase();

        if (texto.isEmpty()) {
            throw new SimbologiaException("Code 39: o texto esta vazio.");
        }

        if (texto.indexOf('*') >= 0) {
            throw new SimbologiaException(
                "Code 39: o asterisco e' o caracter de inicio e de paragem, e nao "
                    + "pode estar nos dados. O encoder poe-o nas duas pontas, "
                    + "por isso nao faz falta escreve-lo: passou \"" + texto
                    + "\" e o codigo seria \"" + texto + "\" com asteriscos a mais.");
        }

        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            if (!COD39_INDICE.containsKey(c)) {
                throw new SimbologiaException(
                    "Code 39: o caracter '" + c + "' nao existe neste formato (sao "
                        + Tabelas.COD39_ALFABETO + ")");
            }
        }

        // O asterisco nao esta no alfabeto: o python-barcode guarda-o a parte,
        // porque nao e' um caracter que a pessoa escreva, e' a moldura.
        String moldura = Tabelas.COD39_PARAGEM;

        String dados = texto;
        if (comControlo) {
            int soma = 0;
            for (int i = 0; i < texto.length(); i++) {
                soma += COD39_INDICE.get(texto.charAt(i));
            }
            dados = texto + Tabelas.COD39_ALFABETO.charAt(soma % 43);
        }

        List<Boolean> modulos = new ArrayList<>();
        List<Integer> guardas = new ArrayList<>();

        // O asterisco de inicio e de paragem, e e' o mesmo. **Sem separador
        // atras da ultima**, que e' a ultima coisa do codigo: com ele a zona
        // ficava um modulo mais larga que a do outro cliente.
        int inicio = modulos.size();
        append(modulos, moldura);
        acrescentarFaixa(guardas, inicio, modulos.size());
        fechar(modulos, 1);

        for (int i = 0; i < dados.length(); i++) {
            append(modulos, Tabelas.COD39_PADROES[indice39(dados.charAt(i))]);
            fechar(modulos, 1);
        }

        inicio = modulos.size();
        append(modulos, moldura);
        acrescentarFaixa(guardas, inicio, modulos.size());

        return new CodigoDeBarras("Code 39", paraArray(modulos), toIntArray(guardas), dados);
    }

    private static void append(List<Boolean> destino, String cadeia) {
        for (int i = 0; i < cadeia.length(); i++) {
            /*
             * **O `Boolean.valueOf` nao e' um mismodo, e' o que o Java exige.**
             *
             * Um `List<Boolean>` e' um `List` de `Boolean` e nao de `boolean`,
             * porque `boolean` e' um primitivo e nao pode ser o tipo de um objecto
             * guardado numa coleccao. Passar o `boolean` directamente nao compila
             * — e o compilador estar a recusar e' o comportamento certo.
             *
             * E `Boolean.valueOf` devolve a instancia de `TRUE` ou `FALSE`, ao
             * contrario de `new Boolean(...)`, que cria sempre um objecto novo:
             * dois objectos com o mesmo valor que `==` nao reconhece, numa lista
             * que ocupa mais memoria sem precisar.
             */
            destino.add(Boolean.valueOf(cadeia.charAt(i) == '1'));
        }
    }

    private static int[] toIntArray(List<Integer> lista) {
        int[] saida = new int[lista.size()];
        for (int i = 0; i < saida.length; i++) {
            saida[i] = lista.get(i);
        }
        return saida;
    }

    // --- ITF ----------------------------------------------------------------

    /** Estreito 1, largo 2 â— e nao 3, como o Code 39. */
    private static final int[] ITF_MEDIDAS = {1, 2};

    /**
     * ITF. <strong>So digitos</strong>, e sempre em numero par.
     *
     * <p><strong>Os digitos leem-se aos pares</strong>, e e' por isso que o numero
     * tem de ser par: um digito isolado nao tem par com quem ler.
     *
     * <p><strong>Sem separador entre os pares</strong>, ao contrario do Code 39 e
     * do Codabar. A intercalacao termina no elemento 4 do segundo digito, que e'
     * desenhado como espaco, e o par seguinte comeca em barra. Acrescentar o
     * separador do outro formato junta dois espacos num so e desloca todos os
     * digitos seguintes.
     */
    public static CodigoDeBarras itf(String valor) {
        String digitos = limparDigitos(valor, "ITF");

        if (digitos.length() % 2 != 0) {
            throw new SimbologiaException(
                "ITF: " + digitos.length() + " digitos, e o formato le-os aos pares. "
                    + "Faltou um digito. Se o numero e' fixo, use ITF-14, que "
                    + "acrescenta o digito de controlo que falta.");
        }

        return _itf(digitos);
    }

    /**
     * ITF-14: treze digitos de dados mais um de controlo, sempre quatorze.
     *
     * <p><strong>A direccao dos pesos nao se nota aqui, e vale a pena dizer
     * porquÃª.</strong> A GS1 pesa o GTIN-14 com 3, 1, 3, 1 a partir da
     * esquerda, e o EAN pesa a partir da direita. Com treze digitos â— e o
     * ITF-14 tem sempre treze â— as duas direccoes dao a mesma soma, porque com
     * um numero impar as duas comecam com o peso 3.
     *
     * <p><strong>A primeira versao deste comentario afirmava que a diferenca
     * dava sempre um digito errado, e estava errado.</strong> A diferenca so
     * aparece com um numero par, e o ITF simples e' sempre par: e' por isso que
     * os digitos se leem aos pares.
     */
    public static CodigoDeBarras itf14(String valor) {
        String digitos = limparDigitos(valor, "ITF-14");

        if (digitos.length() != 13) {
            throw new SimbologiaException(
                "ITF-14: espera 13 digitos de dados, recebeu " + digitos.length()
                    + ". O ultimo, o digito de controlo, calcula-se sozinho.");
        }

        int soma = 0;
        for (int i = 0; i < 13; i++) {
            soma += (digitos.charAt(i) - '0') * (i % 2 == 0 ? 3 : 1);
        }
        int controlo = (10 - soma % 10) % 10;

        CodigoDeBarras codigo = _itf(digitos + controlo);
        return new CodigoDeBarras(
            "ITF-14", codigo.modulos(), codigo.guardas(), digitos + controlo);
    }

    private static String limparDigitos(String valor, String nome) {
        if (valor == null) {
            throw new SimbologiaException(nome + ": o texto esta vazio.");
        }

        StringBuilder saida = new StringBuilder();
        for (int i = 0; i < valor.length(); i++) {
            char c = valor.charAt(i);
            if (Character.isWhitespace(c) || c == '-') {
                continue;
            }
            if (!Character.isDigit(c)) {
                throw new SimbologiaException(
                    nome + ": so aceita digitos, recebeu \"" + valor + "\"");
            }
            saida.append(c);
        }

        if (saida.length() == 0) {
            throw new SimbologiaException(nome + ": o texto esta vazio.");
        }

        return saida.toString();
    }

    private static CodigoDeBarras _itf(String digitos) {
        List<Boolean> modulos = new ArrayList<>();
        List<Integer> guardas = new ArrayList<>();

        // A moldura de inicio, que e' guarda: quatro elementos estreitos.
        int inicio = modulos.size();
        modulos.addAll(modulosDe(Tabelas.ITF_INICIO, ITF_MEDIDAS));
        acrescentarFaixa(guardas, inicio, modulos.size());

        for (int i = 0; i < digitos.length(); i += 2) {
            String barras = Tabelas.ITF_PADROES[digitos.charAt(i) - '0'];
            String espacos = Tabelas.ITF_PADROES[digitos.charAt(i + 1) - '0'];

            // **A intercalacao.** As larguras do primeiro digito vao nas barras,
            // as do segundo nos espacos, elemento a elemento. E' o
            // "interleaved" que da o nome ao formato: um par de digitos ocupa as
            // mesmas cinco posicoes que um digito so.
            for (int e = 0; e < 5; e++) {
                for (int k = 0; k < ITF_MEDIDAS[largura(barras.charAt(e))]; k++) {
                    modulos.add(Boolean.TRUE);
                }
                for (int k = 0; k < ITF_MEDIDAS[largura(espacos.charAt(e))]; k++) {
                    modulos.add(Boolean.FALSE);
                }
            }
        }

        // A moldura de paragem, com os seus **tres** elementos â— e tambem guarda.
        inicio = modulos.size();
        modulos.addAll(modulosDe(Tabelas.ITF_PARAGEM, ITF_MEDIDAS));
        acrescentarFaixa(guardas, inicio, modulos.size());

        return new CodigoDeBarras("ITF", paraArray(modulos), toIntArray(guardas), digitos);
    }

    /**
     * O índice da largura: 1 para largo, 0 para estreito.
     *
     * <p><strong>Decide pela letra e não pela caixa</strong>, e a razão está em
     * {@link #modulosDe}. {@code W}/{@code w} são largos; {@code N}/{@code n}
     * são estreitos.
     */
    private static int largura(char letra) {
        return letra == 'W' || letra == 'w' ? 1 : 0;
    }

    // --- Codabar ------------------------------------------------------------

    /**
     * O Codabar. <strong>Estreito 2, largo 5</strong> â— e nao 3:1, que tem o
     * aspecto certo e nao le.
     */
    private static final int[] CODABAR_NORMAL = {2, 5};
    private static final int[] CODABAR_LARGO = {2, 5};

    /** O intervalo entre caracteres, em modulos, por variante. */
    private static final int CODABAR_ESPACO_NORMAL = 2;
    private static final int CODABAR_ESPACO_LARGO = 3;

    /**
     * Codabar. O texto e' <strong>sÃ³ os dados</strong>, e a moldura sao opcoes.
     *
     * <p><strong>O valor nao leva o {@code A} do inicio nem o da paragem.</strong>
     * Sao os parametros {@code inicio} e {@code paragem}, e o que fica no meio
     * e' o texto.
     *
     * <p>A primeira versao desta funcao pegava na cadeia toda e tirava as
     * pontas â— {@code codabar("A123456A")} â— que e' a leitura mais natural e
     * <strong>esta errada</strong>. A razao e' a {@code AGENTS.md}: duas
     * implementacoes do mesmo campo com semanticas diferentes sao um bug de
     * paridade, <strong>mesmo que o teste de cada uma passe</strong>, porque cada
     * uma le a que espera e nenhuma acusa a outra.
     *
     * <p><strong>Os caracteres de moldura nao podem estar nos dados.</strong> E' a
     * mesma razao pela qual eles sao opcoes: {@code A}, {@code B}, {@code C} e
     * {@code D} so existem nas pontas, e um {@code A} no meio do texto era
     * codificado com a tabela de dados e o leitor lia-o como moldura â— o codigo
     * passava a parte estrutural e partia a meio.
     */
    public static CodigoDeBarras codabar(String valor) {
        return codabar(valor, "A", "A", false);
    }

    public static CodigoDeBarras codabar(String valor, boolean largo) {
        return codabar(valor, "A", "A", largo);
    }

    public static CodigoDeBarras codabar(String valor, String inicio, String paragem,
            boolean largo) {
        String dados = valor == null ? "" : valor.toUpperCase();

        if (dados.isEmpty()) {
            throw new SimbologiaException("Codabar: o texto esta vazio.");
        }

        for (String[] par : new String[][] {{"inicio", inicio}, {"paragem", paragem}}) {
            if (!isMoldura(par[1])) {
                throw new SimbologiaException(
                    "Codabar: " + par[0] + " e paragem tem de ser A, B, C ou D, e "
                        + "recebeu \"" + par[1] + "\"");
            }
        }

        for (int i = 0; i < dados.length(); i++) {
            char c = dados.charAt(i);
            if (isMoldura(String.valueOf(c))) {
                throw new SimbologiaException(
                    "Codabar: \"" + c + "\" e um caracter de inicio ou de paragem e "
                        + "nao pode estar nos dados. A, B, C e D so existem nas pontas.");
            }
            if (Tabelas.codabar(String.valueOf(c)) == null) {
                throw new SimbologiaException(
                    "Codabar: o caracter '" + c + "' nao existe neste codigo.");
            }
        }

        int[] medidas = largo ? CODABAR_LARGO : CODABAR_NORMAL;
        int espaco = largo ? CODABAR_ESPACO_LARGO : CODABAR_ESPACO_NORMAL;

        List<Boolean> modulos = new ArrayList<>();
        List<Integer> guardas = new ArrayList<>();

        // A moldura de inicio, que e' guarda.
        int from = modulos.size();
        modulos.addAll(modulosDe(Tabelas.codabar(inicio), medidas));
        acrescentarFaixa(guardas, from, modulos.size());
        fechar(modulos, espaco);

        // Os dados, cada um seguido do seu intervalo â— inclusive o ultimo, que
        // e' o que o separa da moldura de paragem.
        for (int i = 0; i < dados.length(); i++) {
            modulos.addAll(modulosDe(Tabelas.codabar(String.valueOf(dados.charAt(i))), medidas));
            fechar(modulos, espaco);
        }

        // A moldura de paragem, sem intervalo atras: e' a ultima coisa do codigo.
        from = modulos.size();
        modulos.addAll(modulosDe(Tabelas.codabar(paragem), medidas));
        acrescentarFaixa(guardas, from, modulos.size());

        return new CodigoDeBarras("Codabar", paraArray(modulos), toIntArray(guardas),
            inicio + dados + paragem);
    }

    private static boolean isMoldura(String c) {
        return "A".equals(c) || "B".equals(c) || "C".equals(c) || "D".equals(c);
    }
}