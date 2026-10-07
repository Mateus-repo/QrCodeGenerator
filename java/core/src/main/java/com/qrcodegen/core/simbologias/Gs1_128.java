package com.qrcodegen.core.simbologias;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * GS1-128, outrora chamado EAN/UCC-128.
 *
 * <p>O Code 128 com as regras do GS1 por cima. E' o codigo de barras que vai na
 * etiqueta de uma caixa de armario de farmacia, e a diferenca para o Code 128 normal
 * nao esta no desenho: esta em <strong>saber onde acaba cada campo</strong>.
 *
 * <h2>O problema que ele resolve</h2>
 *
 * <p>O GTIN sozinho e' um numero de comprimento fixo, e o leitor sabe que tem de ler
 * catorze digitos. Com varios campos ja nao: em {@code (10)LOTE-A1(17)270630}, onde
 * acaba {@code LOTE-A1}? Sem regra o leitor tem de adivinhar, e adivinhar mal e' ler
 * um campo invalido.
 *
 * <p>A regra e' o <strong>FNC1</strong>, um codeword que nao desenha um caracter
 * visivel e que marca "o campo de comprimento variavel acabou aqui".
 *
 * <h2>As tres coisas que sao FNC1</h2>
 *
 * <ol>
 *   <li><strong>No inicio</strong>, logo a seguir ao caracter de inicio do conjunto.
 *       E' o que diz ao leitor "este e' um GS1-128". Sem ele o leitor devolve o texto
 *       e nao sabe para que serve — e o {@code symbology_identifier} do ZXing diz
 *       {@code ]C0} em vez de {@code ]C1}.</li>
 *   <li><strong>No fim de cada campo de comprimento variavel</strong>, menos no
 *       ultimo. E' o separador. A regra "menos no ultimo" e' da propria GS1: um
 *       separador no fim nao separa de nada.</li>
 *   <li><strong>Nunca</strong> dentro de um campo de comprimento fixo, porque ai o
 *       comprimento ja esta no AI e um FNC1 a meio leria-se como parte do valor.</li>
 * </ol>
 *
 * <h2>Porque os campos sao todos no conjunto B</h2>
 *
 * <p>O GS1-128 so usa o conjunto B — o ASCII imprimivel. Nao por ser mais curto, mas
 * porque e' o unico em que o FNC1 faz sentido: uma comutacao para o conjunto C
 * partiria um campo ao meio sem o leitor dar por isso. O preco e' um codigo mais
 * longo, e e' o comprimento que a GS1-128 aceita.
 *
 * <h2>Deliberadamente nao chama o {@code code128()}</h2>
 *
 * <p>Aquele escolhe os conjuntos e faz as comutacoes, e o GS1-128 nao pode: tem de
 * ficar no conjunto B e o FNC1 e' um codeword que o {@code code128()} nao sabe
 * emitir. Chama-lo e forcar o conjunto B por opcao seria meio caminho, e <strong>o
 * meio caminho e' onde estao os bugs</strong>.
 *
 * <h2>O que o leitor devolve, medido</h2>
 *
 * <ul>
 *   <li>{@code bytes} — a forma de maquina, com o {@code 0x1D} onde o encoder pôs o
 *       separador;</li>
 *   <li>{@code text} — a <strong>forma humana entre parenteses</strong>: o ZXing
 *       parseia o GS1 e escreve os AIs entre parenteses;</li>
 *   <li>{@code symbology_identifier} — {@code ]C1}, onde um Code 128 sem FNC1 diz
 *       {@code ]C0}. <strong>E' a unica coisa que distingue os dois com os mesmos
 *       caracteres.</strong></li>
 * </ul>
 *
 * <p><strong>Sao tres representacoes do mesmo codigo e a comparacao e' com os
 * {@code bytes}.</strong> Um leitor que devolve duas representacoes tem uma para
 * comparar e outra para mostrar a uma pessoa.
 */
public final class Gs1_128 {

    private Gs1_128() {
    }

    /**
     * O valor do codeword do FNC1 no Code 128.
     *
     * <p>102 nao e' um valor de conjunto nem um caracter: e' uma funcao, e e' o mesmo
     * em todos os contextos — no inicio e como separador. <strong>Nao ha um "FNC1 de
     * inicio" e um "FNC1 separador" com numeros diferentes</strong>, ao contrario do
     * que se pode supor.
     */
    public static final int FNC1 = 102;

    /**
     * O separador GS, {@code 0x1D} — o mesmo byte que o ZXing devolve nos bytes.
     *
     * <p><strong>Nao e' uma escolha de interface.</strong> E' o valor que a GS1 chama
     * de Group Separator e o mesmo que o leitor devolve, para que o texto que a
     * aplicacao mostra e o que o leitor le sejam o mesmo numero e nao duas tradicoes.
     */
    public static final char GS = '\u001D';

    /** O codeword de inicio do conjunto B, que e' o unico que o GS1-128 usa. */
    private static final int INICIO_B = 104;

    /** O codeword de paragem. */
    private static final int PARAGEM = 106;

    /**
     * O codigo de barras GS1-128.
     *
     * @param elementoString o texto com os AIs entre parenteses, na forma de leitura
     *     humana da GS1: {@code (01)04012345678901(10)LOTE-A1}. Os parenteses
     *     <strong>nao</strong> vao para dentro do codigo de barras — fazem parte da
     *     notacao humana e o leitor nao os ve. <strong>Os digitos do AI vao</strong>,
     *     ao contrario dos parenteses.
     */
    public static CodigoGs1 gs1_128(String elementoString) {
        List<CodigoGs1.Campo> campos = analisar(elementoString);

        /*
         * A forma de maquina: os campos concatenados, com o FNC1 onde a GS1 o quer.
         *
         * O FNC1 do inicio vai **depois** do caracter de inicio do conjunto B — e' o
         * primeiro codeword de dados, nao parte do cabecalho. Po-lo antes produz um
         * codigo que o ZXing le como ]C0, ou seja, como Code 128 normal, e o
         * utilizador nunca ve a diferenca — so o leitor de um sistema GS1.
         */
        List<Integer> valores = new ArrayList<>();
        valores.add(Integer.valueOf(INICIO_B));
        valores.add(Integer.valueOf(FNC1));

        int ultimo = campos.size() - 1;
        int separadores = 1;

        for (int i = 0; i < campos.size(); i++) {
            CodigoGs1.Campo campo = campos.get(i);

            /*
             * **Os digitos do AI vao no codigo de barras, sem parenteses.**
             *
             * A primeira versao emitia so `campo.valor` e o AI ficava de fora, por
             * causa de uma confusao entre a forma humana e a de maquina: em
             * `(10)LOTE-A1` os parenteses sao para quem le e nao vao para o codigo —
             * mas os **digitos do AI vao**. O resultado eram 17 codewords em vez de
             * 20, o ZXing nao lia nada, e a razao nao era visivel no codigo.
             *
             * E o `resto` entra **antes** do conteudo: num `3103` o digito da posicao
             * decimal implicita faz parte do valor, nao do AI.
             */
            String conteudo = campo.ai() + campo.valor();
            for (int c = 0; c < conteudo.length(); c++) {
                valores.add(Integer.valueOf(valorNoConjuntoB(conteudo.charAt(c), campo.ai())));
            }

            /*
             * O separador vai no fim de cada campo variavel **excepto o ultimo**.
             *
             * **Um separador no fim nao separa de nada**, e o leitor conta-o como parte
             * do campo seguinte. A primeira versao metia um em todos os campos
             * variaveis, e o `descodificar` falhava em seis de oito casos: o ZXing
             * devolvia o mesmo codigo com um `0x1D` a mais e o codigo continuava a ler
             * bem — a falha era so na comparacao, e sem ela nao se via.
             */
            if (campo.separador() && i != ultimo) {
                valores.add(Integer.valueOf(FNC1));
                separadores++;
            }
        }

        /*
         * O caracter de verificacao: o valor de inicio com peso 1, cada valor de dados
         * multiplicado pela sua posicao — a primeira a valer 1 — e o resultado modulo
         * 103.
         *
         * **Nao e' uma soma simples.** A primeira versao fazia `reduce((s, v) => s + v,
         * 0) % 103`, que e' a soma sem pesos, e produzia um valor de verificacao
         * diferente do certo: 222 modulos em vez dos 200 que a conta pedia, o ZXing a
         * recusar **sem dizer por que**, e nenhuma diferenca visivel no desenho.
         *
         * O FNC1 entra na conta com o valor 102 e com o peso da sua posicao, como
         * qualquer outro codeword — e e' por isso que ele tem de estar na lista
         * **antes** de se calcular a soma, e nao a ser acrescentado a parte.
         */
        int soma = valores.get(0).intValue();
        for (int i = 1; i < valores.size(); i++) {
            soma += valores.get(i).intValue() * i;
        }
        int verificacao = soma % 103;

        List<Integer> todos = new ArrayList<>(valores);
        todos.add(Integer.valueOf(verificacao));
        todos.add(Integer.valueOf(PARAGEM));

        boolean[] modulos = new boolean[0];
        List<Boolean> desenhados = new ArrayList<>();
        for (int i = 0; i < todos.size(); i++) {
            // **O `v` ja e' um `int` depois do desempacotar.** Um `.intValue()` aqui
            // dava "int cannot be dereferenced", que e' o compilador a dizer que a
            // segunda caixa nao existe.
            int v = todos.get(i).intValue();
            desenhados.addAll(Code128.modulosDoValor(v));
        }
        modulos = _paraArray(desenhados);

        return new CodigoGs1(modulos, _legivel(campos), maquina(campos), _legivel(campos),
                campos, separadores);
    }

    private static boolean[] _paraArray(List<Boolean> lista) {
        boolean[] saida = new boolean[lista.size()];
        for (int i = 0; i < saida.length; i++) {
            saida[i] = lista.get(i).booleanValue();
        }
        return saida;
    }

    /**
     * O valor Code 128 de um caracter no conjunto B.
     *
     * <p>No conjunto B o valor e' o ASCII menos 32, para 0 a 95. Os caracteres que nao
     * cabem no GS1-128 — os acentos, por exemplo — sao recusados aqui e nao no desenho,
     * porque o erro e' do dado e nao do codigo.
     */
    private static int valorNoConjuntoB(char caractere, String ai) {
        int codigo = caractere;

        if (codigo < 32 || codigo > 127) {
            throw new SimbologiaException("GS1-128: o AI (" + ai + ") tem o caractere \""
                    + caractere + "\" (U+" + String.format("%04X", Integer.valueOf(codigo))
                    + "), e o conjunto B so transporta ASCII. O GS1-128 nao tem acento.");
        }

        // 128 e' o valor de paragem e nao pode estar nos dados — dava um codigo que se
        // desenhava e nao se lia.
        if (codigo == 128) {
            throw new SimbologiaException(
                    "GS1-128: o AI (" + ai + ") tem um caracter de paragem nos dados");
        }

        return codigo - 32;
    }

    /**
     * Separa o texto nos campos, e valida cada um contra a tabela de AIs.
     *
     * <p>E' aqui que a tabela de 541 AIs paga. Sem ela o encoder teria de adivinhar o
     * comprimento de cada campo, e adivinhar mal significa que o campo seguinte e' lido
     * a partir do meio do anterior.
     *
     * <p>A forma humana da GS1 nao tem separadores: os campos estao separados por
     * parenteses. O FNC1 so existe na forma de maquina, e e' o encoder que o poe.
     */
    static List<CodigoGs1.Campo> analisar(String texto) {
        List<CodigoGs1.Campo> campos = new ArrayList<>();
        String fonte = texto == null ? "" : texto;
        int i = 0;

        while (i < fonte.length()) {
            if (fonte.charAt(i) != '(') {
                throw new SimbologiaException("GS1-128: esperava um \"(\" na posicao "
                        + i + " de \"" + fonte + "\". A forma de leitura humana e' "
                        + "(01)04012345678901(10)LOTE-A1, com os AIs entre parenteses.");
            }

            /*
             * O AI tem dois, tres ou quatro digitos, e **nao se pode saber qual pelo
             * primeiro digito**: `3103` e' um AI de quatro, e `31` seria um de dois com
             * a posicao decimal implicita no ultimo digito. Le-se o numero todo e a
             * tabela diz onde acaba.
             */
            int fecho = fonte.indexOf(')', i);
            if (fecho < 0) {
                throw new SimbologiaException(
                        "GS1-128: o \"(\" na posicao " + i + " de \"" + fonte + "\" nao fecha.");
            }

            String numero = fonte.substring(i + 1, fecho);
            if (!numero.matches("\\d+")) {
                throw new SimbologiaException(
                        "GS1-128: o AI \"" + numero + "\" nao e' so digitos.");
            }

            TabelasGs1.Ai encontrado = TabelasGs1.aiDe(numero);
            if (encontrado == null) {
                throw new SimbologiaException("GS1-128: o AI (" + numero
                        + ") nao existe. A tabela tem " + TabelasGs1.AIS.size() + " AIs.");
            }

            /*
             * O valor comeca logo a seguir ao `)`, e e' o comprimento que decide ate
             * onde vai. **E' a razao de a tabela trazer `fixo` e `maximo`.**
             *
             * O `resto` que o `aiDe` devolve e' o que sobrou do numero depois do AI — o
             * digito da posicao decimal implicita num `3103`. Faz parte do valor, e por
             * isso entra no campo antes dos caracteres.
             */
            int inicioValor = fecho + 1;
            int fim;
            String conteudo;

            if (encontrado.fixo() != null) {
                // Comprimento fixo: o campo tem `fixo` caracteres, ponto final. Sem FNC1.
                fim = inicioValor + encontrado.fixo().intValue();
                conteudo = _recorta(fonte, inicioValor, fim);
            } else {
                /*
                 * Comprimento variavel: vai ate ao fim do texto ou ate ao proximo `(`.
                 *
                 * **O `(` e' que marca o fim, e nao um FNC1 na forma humana.** A
                 * primeira versao procurava um separador na forma humana, que nao
                 * existe, e cortava o valor no sitio errado.
                 */
                int proximo = fonte.indexOf('(', inicioValor);
                fim = proximo < 0 ? fonte.length() : proximo;
                conteudo = fonte.substring(inicioValor, fim);
            }

            String limpo = validar(encontrado, conteudo);

            campos.add(new CodigoGs1.Campo(encontrado.numero(),
                    (encontrado.resto() == null ? "" : encontrado.resto()) + limpo,
                    limpo, encontrado.separador()));

            i = fim;
        }

        if (campos.isEmpty()) {
            throw new SimbologiaException(
                    "GS1-128: o texto nao tem nenhum campo. Escreve (01)04012345678901.");
        }

        return campos;
    }

    /**
     * {@code substring} que devolve {@code ""} em vez de lancar.
     *
     * <p><strong>Um valor fixo mais curto do que a tabela diz tem de recusar, e nao
     * estourar uma excepcao de indice.</strong> A primeira versao chamava
     * {@code substring(inicio, fim)} a direito, e um {@code (01)} sem valor dava
     * {@code StringIndexOutOfBoundsException} — que e' uma excepcao do Java e nao uma
     * recusa do encoder, e o teste que a apanhava affirmava {@code SimbologiaException}.
     */
    private static String _recorta(String texto, int inicio, int fim) {
        if (inicio >= texto.length()) {
            return "";
        }
        return texto.substring(inicio, Math.min(fim, texto.length()));
    }

    /**
     * Confere o valor de um campo contra o que a GS1 diz dele.
     *
     * <p>A expressao regular vem da propria GS1, e da tabela. E' mais forte do que contar
     * caracteres: {@code (\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01]))} para uma data recusa
     * {@code 275630} — mes 56 — e o leitor do GS1 recusa tambem.
     *
     * <p><strong>O {@code trim} e' o que torna a forma humana legivel.</strong> A GS1
     * escreve os campos com um espaco de cada lado nos exemplos — {@code (10) LOTE-A1}
     * — e o espaco nao faz parte do valor. Um {@code trim} sem isto recusa metade dos
     * exemplos que a propria GS1 escreve.
     *
     * <p><strong>O regex e' ancorado, e ancorar e' o que impede que um valor mais longo
     * passe.</strong> Sem {@code ^} e {@code $} um regex nao ancorado aceita o valor
     * se <em>contiver</em> um match.
     */
    static String validar(TabelasGs1.Ai ai, String valor) {
        String limpo = valor.trim();

        if (limpo.isEmpty()) {
            throw new SimbologiaException("GS1-128: o AI (" + ai.numero() + ") nao tem valor.");
        }

        /*
         * O comprimento fixo conferido, e **com os dois numeros na mensagem**.
         *
         * A versao que so tinha o `regex` dizia "nao corresponde ao que a GS1 define" —
         * que e' verdade e nao ajuda ninguem: o utilizador tem um campo de catorze e
         * nao sabe qual. **Uma recusa sem numeros e' uma recusa com que ninguem
         * consegue corrigir o campo.**
         */
        if (ai.fixo() != null && limpo.length() != ai.fixo().intValue()) {
            throw new SimbologiaException("GS1-128: o AI (" + ai.numero() + ") tem "
                    + ai.fixo() + " digitos fixos e o valor \"" + limpo + "\" tem "
                    + limpo.length() + ".");
        }

        /*
         * **O maximo e' a soma dos componentes, e nao o do ultimo.**
         *
         * A tabela so traz o do ultimo componente, que e' o que serve para **dividir**
         * o valor. Para **conferir** o numero certo e' a soma de todos: o AI `253` e'
         * `N3+N13[+X..17]`, o ultimo componente tem maximo 17 e um valor valido pode ter
         * trinta. **47 dos 541 AIs recusavam um valor que a GS1 aceita.**
         */
        Integer maximo = comprimentoTotal(ai);
        if (maximo != null && limpo.length() > maximo.intValue()) {
            throw new SimbologiaException("GS1-128: o AI (" + ai.numero() + ") aceita no maximo "
                    + maximo + " caracteres e o valor \"" + limpo + "\" tem " + limpo.length() + ".");
        }

        if (!Pattern.matches(ai.regex(), limpo)) {
            throw new SimbologiaException("GS1-128: o valor \"" + limpo + "\" do AI ("
                    + ai.numero() + ") nao corresponde ao que a GS1 define. O formato e' "
                    + ai.formato() + ".");
        }

        return limpo;
    }

    /**
     * O comprimento maximo do valor de um AI, e nao o do ultimo componente.
     *
     * <p>**A tabela so traz o do ultimo componente, e os dois numeros sao
     * diferentes.** E' o que serve para <strong>dividir</strong> o valor — o ultimo
     * componente e' o que vai ate ao fim do texto — e nao para o <strong>conferir</strong>:
     * um AI de varios componentes tem um valor que e' a soma deles.
     *
     * <p>Sao 47 dos 541 AIs que tem mais de um componente, e todos eles recusavam um
     * valor que a GS1 aceita.
     *
     * <p><strong>E' publico porque a interface e o teste precisam dele, e nao
     * porque seja um segredo.</strong> Quem tem de mostrar a um utilizador o
     * comprimento que o campo aceita le-o daqui, e um {@code public} sem
     * <em>chamador</em> seria um campo que ninguem sabe porque existe.
     *
     * @return o comprimento maximo, ou {@code null} se o AI nao tem componente variavel
     */
    public static Integer comprimentoTotal(TabelasGs1.Ai ai) {
        int soma = 0;
        boolean temVariavel = false;

        for (TabelasGs1.Componente campo : ai.campos()) {
            if (campo.fixo() != null) {
                soma += campo.fixo().intValue();
            }
            if (campo.maximo() != null) {
                soma += campo.maximo().intValue();
                temVariavel = true;
            }
        }

        return temVariavel ? Integer.valueOf(soma) : null;
    }

    /**
     * A forma de maquina: os campos <strong>sem parenteses</strong>, com o separador no
     * sitio certo.
     *
     * <p><strong>Sem os parenteses, e sem eles no {@code gs1}.</strong> Os parenteses
     * sao a notacao humana e o leitor nao os ve; os <em>digitos do AI</em> vao. E'
     * esta a forma que o ZXing devolve em {@code bytes}, com o {@code 0x1D} cru.
     *
     * <p>O separador vai <strong>depois</strong> de um campo de comprimento variavel, e so
     * se esse campo nao for o ultimo. E' a regra da GS1 e e' a mesma que o
     * {@link #gs1_128} usa ao montar os codewords — <strong>as duas tem de concordar</strong>,
     * e e' por isso que a lista se percorre com o mesmo criterio nas duas.
     *
     * <p><strong>Nao e' a mesma coisa que juntar todos os campos com um separador.</strong>
     * A diferenca e' o que apanha um separador no ultimo campo: um separador no fim nao
     * separa de nada, e o leitor conta-o como parte do campo seguinte. A primeira
     * versao nao existia, e o gerador de testes fazia a sua — juntando um separador
     * entre todos os campos. O ZXing devolvia o mesmo codigo com menos um
     * {@code 0x1D} nos bytes.
     */
    static String maquina(List<CodigoGs1.Campo> campos) {
        StringBuilder saida = new StringBuilder();
        int ultimo = campos.size() - 1;

        for (int i = 0; i < campos.size(); i++) {
            CodigoGs1.Campo campo = campos.get(i);
            saida.append(campo.ai()).append(campo.valor());
            if (campo.separador() && i != ultimo) {
                saida.append(GS);
            }
        }

        return saida.toString();
    }

    /**
     * A forma humana, com os AIs entre parenteses e <strong>sem</strong> separador.
     *
     * <p><strong>E' a mesma cadeia que o {@code gs1}, e nao uma segunda forma.</strong>
     * O nome {@code gs1} e' o nome da notacao e {@code legenda} e' o nome do campo que
     * o desenho imprime; a cadeia e' uma so, e a paridade mede os dois para saber que
     * nao divergiram.
     *
     * <p>A primeira versao punha um separador entre os campos, e foi o separador a mais
     * que fez o {@code descodificar} falhar em seis dos oito casos: o ZXing devolvia o
     * mesmo codigo com um {@code 0x1D} a mais e o codigo continuava a ler bem — a falha
     * era so na comparacao, e sem ela nao se via.
     *
     * <p>E' o que o ZXing devolve em {@code text}, porque o ZXing parseia o GS1 e escreve
     * os AIs entre parenteses.
     */
    static String _legivel(List<CodigoGs1.Campo> campos) {
        StringBuilder saida = new StringBuilder();

        for (CodigoGs1.Campo campo : campos) {
            saida.append('(').append(campo.ai()).append(')').append(campo.valor());
        }

        return saida.toString();
    }
}
