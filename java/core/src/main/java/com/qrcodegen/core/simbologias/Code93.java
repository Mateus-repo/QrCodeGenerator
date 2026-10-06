package com.qrcodegen.core.simbologias;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * O Code 93.
 *
 * <p>E' o codigo de barras dos automoveis e da defesa, e o unico que transporta
 * os 128 caracteres ASCII com a mesma correccao de erros — e ao mesmo tempo e'
 * <strong>compacto demais</strong>: seis caracteres, tres barras e tres espacos,
 * onde o Code 39 usa nove elementos por caracter.
 *
 * <h2>Onde e' que ele ganha ao Code 39</h2>
 *
 * <p>A razao esta no numero de elementos. O Code 39 e' "sete de nove e dois de
 * cinco", porque cada caracter e' um start, seis barras e espacos, e um stop — e
 * o espaco entre caracteres e' um espaco estreito. <strong>O Code 93 nao tem
 * separacao</strong>: os caracteres correm uns nos outros, e a barra de inicio e
 * a de fim servem de separador.
 *
 * <p>Isso da um codigo <strong>13% mais curto</strong> para o mesmo texto, e o
 * Code 93 acrescenta uma correccao de erros que o Code 39 nao tem — sao os dois
 * digitos de controlo.
 *
 * <h2>Os quatro caracteres de controlo da tabela</h2>
 *
 * <p>A tabela tem 48 entradas e as ultimas quatro sao de controle, escritas no
 * ZXing como {@code a}, {@code b}, {@code c} e {@code d} para se poderem
 * imprimir. Sao o que permite ao Code 93 codificar os 128 caracteres ASCII num
 * codigo que so tem 48 valores: um caracter de controle e' o par "letra de
 * escape" mais a letra seguinte, e o leitor sabe que a leu.
 *
 * <p>E' por isso que <strong>nao ha minusculas na tabela</strong>: vao como o
 * par de escape das minusculas, que e' o {@code d}, mais a letra seguinte.
 *
 * <h2>Os dois digitos de controlo</h2>
 *
 * <p>Ao contrario do Code 39, que tem um, o Code 93 tem <strong>dois</strong>,
 * com pesos diferentes: o primeiro pesa 1 a 20 e o segundo 1 a 15, ambos
 * aplicados de tras para a frente. E' o que torna o codigo seguro contra a
 * inversao de dois caracteres, que o Code 39 nao apanha.
 *
 * <h2>As tabelas sao geradas</h2>
 *
 * <p>Nem os 48 padroes nem os pares de escape estao neste ficheiro. Vem do
 * {@code spec/gerar-tabelas-code93.py}, que os extrai do
 * {@code Code93Reader.java} do ZXing — <strong>a mesma fonte que o leitor usa
 * para verificar o que este encoder produz</strong>. Nao ha um pacote de Java
 * com o Code 93, e escrever as tabelas a mao seria uma segunda implementacao
 * que divergiria em silencio.
 *
 * <p><strong>E a correccao do bug do web nao foi corrigir a escada: foi nao
 * haver escada.</strong> O encoder do web tinha os pares de escape escritos a
 * mao, e vinte e quatro dos trinta e dois caracteres de controle estavam
 * errados — o CR saia como o algarismo {@code 0}, e o ZXing devolvia um
 * {@code 0} onde estava um CR. Aqui o par e' uma busca, e uma busca nao
 * diverge entre linguagens porque a fonte e' a tabela.
 */
public final class Code93 {

    private Code93() {
    }

    /** O indice de cada caracter da tabela, para a busca ao inverso. */
    private static final Map<Character, Integer> INDICE = TabelasCode93.indice();

    /**
     * Codifica em Code 93.
     *
     * @param valor o que codificar. ASCII, minusculas e tudo — as minusculas e
     *     os controlos sao o que o Code 93 tem e o Code 39 nao.
     * @return o codigo com os modulos, as guardas e a legenda
     * @throws SimbologiaException se o texto estiver vazio, trouxer um
     *     asterisco, ou trouxer um caractere acima de 127
     */
    public static CodigoDeBarras code93(String valor) {
        String texto = validar(valor);

        // **O texto passa pela codificacao estendida antes de qualquer outra
        // coisa.** A tabela tem 48 entradas e nenhuma delas e' uma minuscula nem
        // um caracter de controle, e a `CONTROLES` da' ja o que vai no codigo:
        // uma letra para os valores e duas para os que precisam de escape.
        //
        // **O `toCharArray` e' o que torna isto correcto.** A entrada tem uma
        // letra ou duas, e o `checksum` conta **um caracter de cada vez**: juntar
        // a entrada como uma cadeia daria um digito diferente em qualquer texto
        // com minusculas.
        char[] estendido = codificarEstendido(texto);

        char[] verificacao = doisControlos(estendido);

        // **O asterisco no inicio e no fim, e nao e' opcional.** E' o start e o
        // stop do Code 93, e sem eles o leitor nao sabe onde comeca o codigo. A
        // razao de ser o **mesmo** nas duas pontas, e nao dois caracteres
        // diferentes, e' que o Code 93 nao tem start e stop proprios como o Code
        // 39: usa um caractere normal da tabela, que o leitor reconhece pela
        // forma.
        char asterisco = TabelasCode93.ALFABETO.charAt(TabelasCode93.ASTERISCO);
        List<Character> comAsteriscos = new ArrayList<>();
        comAsteriscos.add(asterisco);
        for (char c : estendido) {
            comAsteriscos.add(c);
        }
        comAsteriscos.add(verificacao[0]);
        comAsteriscos.add(verificacao[1]);
        comAsteriscos.add(asterisco);

        List<Boolean> modulos = new ArrayList<>();
        List<Integer> guardas = new ArrayList<>();

        for (int i = 0; i < comAsteriscos.size(); i++) {
            Character caractere = comAsteriscos.get(i);

            // Os asteriscos do inicio e do fim sao as guardas: sao o unico ponto
            // de referencia que o leitor tem, porque o Code 93 nao tem barras de
            // guarda como o EAN. Descem mais para se verem a olho.
            if (i == 0 || i == comAsteriscos.size() - 1) {
                guardas.add(modulos.size());
            }

            modulos.addAll(modulosDo(caractere));
        }

        // **A barra de terminacao.** O ZXing acrescenta **uma barra preta** no
        // fim, depois da barra de fim, e sem ela o codigo nao le. Nao e' um start
        // nem um stop: e' a unica barra solitaria do codigo, e o que da ao leitor
        // a certeza de que leu ate ao fim.
        //
        // **Foi uma das tres coisas que a primeira versao nao tinha**, e o
        // sintoma foi o pior possivel — o codigo desenhava-se certo, o
        // comprimento era o que o ZXing esperava, e a leitura dava nada **sem
        // dizer porque**.
        modulos.add(Boolean.TRUE);

        StringBuilder legenda = new StringBuilder();
        for (char c : estendido) {
            legenda.append(c);
        }
        legenda.append(verificacao[0]).append(verificacao[1]);

        // **As guardas vao por `toIntArray` e nao por `paraArray`.** Duas
        // sobrecargas que so se diferem em `<T>` sao a mesma assinatura em Java,
        // porque o tipo generico e' apagado — e a mensagem que da, «name clash:
        // ... have the same erasure», nao diz nada sobre a solucao. **O
        // `Lineares.java` ja resolve assim, e o que um sitio resolve o outro
        // repete.**
        return new CodigoDeBarras("Code 93", paraArray(modulos),
                toIntArray(guardas), legenda.toString());
    }

    /**
     * O texto em codificacao estendida.
     *
     * <p><strong>E' uma busca na tabela, e nao uma escada de regras.</strong> Os
     * pares vem do {@code decodeExtended} do ZXing invertido, e a tabela e'
     * gerada. A escada que o web tinha estava errada em vinte e quatro dos
     * trinta e dois caracteres de controle, e nenhum dos dez casos de leitura a
     * tocava.
     *
     * @param texto o que a pessoa escreveu
     * @return um caracter por letra, ja no vocabulario da tabela
     */
    private static char[] codificarEstendido(String texto) {
        List<Character> saida = new ArrayList<>();

        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            String escape = TabelasCode93.CONTROLES[c];

            if (escape == null) {
                throw new SimbologiaException(
                        "Code 93: o caractere '" + c + "' nao tem par de escape");
            }

            // **Um caracter da letra, e nao a cadeia toda.** E' o que o
            // `checksum` conta, e por isso que o `toCharArray`.
            for (int j = 0; j < escape.length(); j++) {
                saida.add(escape.charAt(j));
            }
        }

        char[] resultado = new char[saida.size()];
        for (int i = 0; i < resultado.length; i++) {
            resultado[i] = saida.get(i);
        }
        return resultado;
    }

    /**
     * Os dois digitos de controlo.
     *
     * <p>O primeiro pesa 1 a 20 e o segundo 1 a 15, e os dois se leem de tras
     * para a frente com o peso a subir. <strong>O modulo e' 47</strong> — e nao
     * 43, que e' o numero de caracteres de dados — porque na conta entram
     * tambem os quatro de controle e o asterisco.
     *
     * <p><strong>E o segundo digito e' calculado sobre o texto mais o
     * primeiro</strong>, e o texto e' um array. Juntar o digito como caractere e'
     * correcto.
     *
     * @param texto o texto ja estendido
     * @return os dois caracteres da tabela
     */
    private static char[] doisControlos(char[] texto) {
        int primeiro = checksum(texto, 20);

        char[] comPrimeiro = new char[texto.length + 1];
        System.arraycopy(texto, 0, comPrimeiro, 0, texto.length);
        comPrimeiro[texto.length] = TabelasCode93.ALFABETO.charAt(primeiro);

        int segundo = checksum(comPrimeiro, 15);

        return new char[] {
                TabelasCode93.ALFABETO.charAt(primeiro),
                TabelasCode93.ALFABETO.charAt(segundo)
        };
    }

    /**
     * A soma ponderada, com o peso a reiniciar em {@code maximo}.
     *
     * <p><strong>O peso reinicia quando passa o maximo, e nao quando chega ao
     * fim.</strong> O sintoma do que nao reinicia e' o mais enganador de todos
     * os codigos de barras: o codigo desenha-se bem, o primeiro digito bate
     * certo e o segundo nao, e o leitor recusa por checksum <strong>sem dizer
     * qual dos dois</strong>.
     *
     * @param texto os caracteres, ja no vocabulario da tabela
     * @param maximo o peso maximo antes de recomecar
     * @return o indice do digito, de 0 a 46
     */
    private static int checksum(char[] texto, int maximo) {
        int peso = 1;
        int total = 0;

        for (int i = texto.length - 1; i >= 0; i--) {
            Integer indice = INDICE.get(texto[i]);
            if (indice == null) {
                throw new SimbologiaException(
                        "Code 93: '" + texto[i] + "' nao esta no alfabeto, e o "
                                + "checksum nao sabe o indice. A tabela esta errada.");
            }

            total += peso * indice;
            peso += 1;
            if (peso > maximo) {
                peso = 1;
            }
        }

        return total % TabelasCode93.MODULO_CHECKSUM;
    }

    /**
     * Os nove modulos de um padrao.
     *
     * <p><strong>O padrao sao os nove modulos, um a um, do mais significativo
     * para o menos</strong>, e nao larguras a extrair nem pares de bits. O
     * {@code appendPattern} do ZXing e'
     *
     * <pre>
     * for (i = 0; i &lt; 9; i++) {
     *   temp = a &amp; (1 &lt;&lt; (8 - i));
     *   target[pos + i] = temp != 0;
     * }
     * </pre>
     *
     * <p>e esta e' a leitura ao inverso, bit a bit.
     *
     * <p><strong>Tres versoes erraram aqui, e as tres por tentar ser espertas</strong>
     * — uma leu pares de dois bits a comecar em espaco, outra pôs o comprimento
     * nos dois bits altos, e uma terceira contou as runs de zeros. Nenhuma deu os
     * nove modulos, e a soma de nove e' o que teria dizendo logo qual das
     * hipoteses era a boa.
     *
     * @param caractere um caractere do alfabeto
     * @return os nove modulos
     */
    private static List<Boolean> modulosDo(char caractere) {
        Integer indice = INDICE.get(caractere);
        if (indice == null) {
            throw new SimbologiaException(
                    "Code 93: '" + caractere + "' nao tem padrao.");
        }

        int padrao = TabelasCode93.PADROES[indice];

        List<Boolean> modulos = new ArrayList<>(9);
        for (int i = 0; i < 9; i++) {
            modulos.add(((padrao >> (8 - i)) & 1) == 1);
        }

        // **O que se verifica aqui e' que o primeiro modulo e' uma barra**, que
        // e' a propriedade de que o leitor depende para ancorar. Um padrao que
        // comece em espaco desenha-se bem e nao e' lido por nada.
        //
        // **E o `gerar-tabelas-code93.py` verifica o mesmo nos 48 valores**, antes
        // de os escrever. Aqui e' a segunda verificacao do mesmo invariante, e
        // nao e' redundancia: o gerador protege a tabela, e isto protege o
        // codigo de uma tabela que um dia chegue errada de outra fonte.
        if (!modulos.get(0)) {
            throw new SimbologiaException(String.format(
                    "Code 93: o padrao '%c' (0x%03X) comeca em espaco, e o leitor "
                            + "precisa de uma barra para ancorar. A tabela esta errada.",
                    caractere, padrao));
        }

        return modulos;
    }

    /**
     * O que o Code 93 aceita, e o que recusa com a razao.
     *
     * <p><strong>O asterisco e' a marca de inicio e de fim, e nao pode estar nos
     * dados.</strong> E' o mesmo cuidado que o Code 39 tem, e pela mesma razao:
     * um asterisco nos dados faz o leitor terminar a leitura ali, e o que vem a
     * seguir e' lido como lixo. <strong>O codigo desenha-se e le-se — a metade,
     * que e' pior do que nao ler nada, porque parece que leu.</strong>
     *
     * @param valor o que a pessoa escreveu
     * @return o texto, se passar
     * @throws SimbologiaException com a razao, sempre
     */
    private static String validar(String valor) {
        String texto = valor == null ? "" : valor;

        if (texto.isEmpty()) {
            throw new SimbologiaException("Code 93: o texto esta vazio.");
        }

        if (texto.indexOf('*') >= 0) {
            throw new SimbologiaException(
                    "Code 93: o asterisco e' a marca de inicio e de fim, e nao pode "
                            + "estar nos dados. Passou \"" + texto + "\".");
        }

        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            if (c > 127) {
                throw new SimbologiaException(String.format(
                        "Code 93 e ASCII e '%c' (U+%04X) nao e. Para acentos ou "
                                + "alfabetos nao latinos, usa QR.",
                        c, (int) c));
            }
        }

        return texto;
    }

    /** A {@code List<Boolean>} em array, que e' o que o desenho consome. */
    private static boolean[] paraArray(List<Boolean> lista) {
        boolean[] resultado = new boolean[lista.size()];
        for (int i = 0; i < resultado.length; i++) {
            resultado[i] = lista.get(i);
        }
        return resultado;
    }

    /**
     * A {@code List<Integer>} em array.
     *
     * <p><strong>Chama-se {@code toIntArray} e nao {@code paraArray} porque
     * {@code paraArray(List<Boolean>)} ja existe</strong>, e em Java duas
     * sobrecargas que so se diferem no tipo generico sao a mesma assinatura: o
     * tipo e' apagado. O {@code Lineares.java} usa os dois nomes pelo mesmo
     * motivo.
     */
    private static int[] toIntArray(List<Integer> lista) {
        int[] resultado = new int[lista.size()];
        for (int i = 0; i < resultado.length; i++) {
            resultado[i] = lista.get(i);
        }
        return resultado;
    }
}
