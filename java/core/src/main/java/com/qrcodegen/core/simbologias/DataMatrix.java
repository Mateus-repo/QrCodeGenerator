package com.qrcodegen.core.simbologias;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * O Data Matrix (ECC200).
 *
 * <p>E' o codigo da industria: a farmacia, a aeroespacial, a defesa e a
 * logistica. Ve-se em ampolas, em chips e em etiquetas de peca, e e' o formato
 * que substituiu o codigo de barras quando a etiqueta ficou pequena demais para
 * ele.
 *
 * <h2>Porque e' quadrado e nao tem padroes de localizacao</h2>
 *
 * <p>O QR tem tres quadrados nos cantos e o Code 128 tem barras. O Data Matrix
 * nao tem nenhum dos dois: a orientacao vem de <strong>duas guias em L</strong>,
 * uma <strong>cheia</strong> em baixo e a esquerda e outra <strong>tracejada</strong>
 * em cima e a direita.
 *
 * <p><strong>A assimetria das duas guias e' o que o leitor usa para se
 * orientar.</strong> Trocar uma delas de cheia para tracejada - ou o sitio -
 * da um codigo que se parece com um Data Matrix e nao e' lido por nada, e nenhum
 * teste estrutural o apanha porque a estrutura continua valida.
 *
 * <h2>Os cinco modos, e porque so dois entram</h2>
 *
 * <p>A ISO/IEC 16022 define cinco modos de codificacao de nivel alto: ASCII, C40,
 * Text, X12 e EDIFACT. <strong>Este encoder so usa dois</strong>: ASCII e o
 * deslocamento para ASCII estendido.
 *
 * <p>Os outros tres sao modos de <em>compressao</em>, e nao de correccao: o
 * codigo que sai sem eles e' perfeitamente valido e le-se em qualquer leitor. A
 * diferenca e' o tamanho - {@code MAST-2024-0001} sai num simbolo maior do que
 * sairia em C40 - e isso e' otimizacao, nao conformidade.
 *
 * <p><strong>Nao ha mascaras, nao ha versoes com nomes e nao ha nivel a
 * escolher.</strong> Escolhe-se o menor simbolo que caiba e a correccao e fixa -
 * o ECC200 e' o unico modo. Isto e' o oposto do QR em tudo.
 *
 * <h2>O valor de {@code b - 127}, que parece um erro</h2>
 *
 * <p>O byte acima de 127 leva um {@code UPPER_SHIFT} a frente e <strong>o valor
 * menos 127</strong>, e nao menos 128 como a norma parece dizer. A leitura
 * literal da ISO daria {@code b - 128}; a implementacao de referencia do ZXing
 * emite {@code b - 128 + 1} e o leitor dela faz {@code valor + 128 - 1}, que e'
 * o mesmo numero. <strong>Os dois concordam, e o resultado e' que o valor certo
 * e' {@code b - 127}.</strong>
 *
 * <p>A primeira versao fazia {@code b - 128} "porque e' o que a norma diz", e o
 * ZXing devolvia cada byte alto <strong>um abaixo</strong> do que tinha sido
 * escrito: um {@code ç} saia como {@code r}, um {@code €} como {@code Ñ}. Todos
 * os payloads ASCII liam-se bem e so os com acentos e emojis falhavam - a
 * assinatura de um erro que so aparece no canto.
 *
 * <h2>As tabelas sao geradas</h2>
 *
 * <p>{@link TabelasDataMatrix} vem do {@code spec/gerar-tabelas-datamatrix.py}, que
 * as extrai da implementacao de referencia do ZXing - <strong>a mesma fonte que
 * o leitor usa para verificar o que este encoder produz</strong>. Nao ha um
 * pacote de Java com o Data Matrix, e escrever as tabelas a mao seria uma
 * segunda implementacao que divergiria em silencio.
 */
public final class DataMatrix {

    private DataMatrix() {
    }

    /** O codeword de enchimento. */
    public static final int PAD = 129;

    /** O deslocamento para ASCII estendido, que vale para o codeword seguinte. */
    public static final int UPPER_SHIFT = 235;

    /** O FNC1 do Data Matrix, que no GS1 faz as duas coisas: sinaliza e separa. */
    public static final int FNC1 = 232;

    /** O polinomio irredutivel do corpo finito, e o que o ZXing chama de 0x12D. */
    private static final int MODULO = 0x12D;

    /** A capacidade maxima, em codewords de dados, de qualquer simbolo. */
    public static final int CAPACIDADE_MAXIMA = TabelasDataMatrix.SIMBOLOS[23][0];

    // --- o corpo finito -------------------------------------------------------

    /**
     * As tabelas de logaritmos e anti-logaritmos de {@code GF(256)}.
     *
     * <p><strong>Sao calculadas, nao transcritas</strong>, e e' o que torna esta
     * classe diferente de uma que tenha de levar tabelas: o corpo e' gerado pelo
     * polinomio {@code 0x12D} a partir do 1, e cada multiplicacao e' uma soma de
     * logaritmos.
     *
     * <p>O indice 255 repete o 0 porque {@code LOG[a] + LOG[b]} chega a 508 e a
     * tabela de exponenciais e' usada com modulo 255.
     */
    private static final int[] EXP = new int[512];
    private static final int[] LOG = new int[256];

    static {
        int p = 1;
        for (int i = 0; i < 255; i++) {
            EXP[i] = p;
            LOG[p] = i;
            p <<= 1;
            if ((p & 0x100) != 0) {
                p ^= MODULO;
            }
        }
        for (int i = 255; i < 512; i++) {
            EXP[i] = EXP[i - 255];
        }
    }

    private static int multiplicar(int a, int b) {
        if (a == 0 || b == 0) {
            return 0;
        }
        return EXP[LOG[a] + LOG[b]];
    }

    // --- a geometria ----------------------------------------------------------

    /**
     * Quantas regioes de dados ha na horizontal, e quantas na vertical.
     *
     * <p><strong>E' o mesmo numero nas duas direccoes</strong>, e nao por simetria
     * do formato: e' que a tabela tem cinco chaves e {@code 1} e {@code 2} dao a
     * mesma resposta. Um simbolo de uma regiao e um de duas diferem no tamanho
     * do bloco de correccao, nunca na quantidade de regioes lado a lado.
     */
    private static final Map<Integer, Integer> REGIOES = new HashMap<>();

    static {
        REGIOES.put(1, 1);
        REGIOES.put(2, 1);
        REGIOES.put(4, 2);
        REGIOES.put(16, 4);
        REGIOES.put(36, 6);
    }

    private static int regioesDe(int n) {
        return REGIOES.getOrDefault(n, 1);
    }

    /**
     * A geometria de um simbolo, ja com os {@code -1} da tabela resolvidos.
     *
     * <p><strong>E' uma classe e nao uma array de sete inteiros</strong> porque
     * os campos sao usados em sitios diferentes e um {@code simbolo[5]} num
     * {@code if} nao diz nada. A excepcao e' a tabela gerada, que fica um
     * {@code int[][]} porque e' uma copia do ZXing e nao uma decisao.
     */
    static final class Geometria {
        final int dados;
        final int correccao;
        final int regiaoLargura;
        final int regiaoAltura;
        final int regioes;
        final int blocoDados;
        final int blocoErros;
        final int colunas;
        final int linhas;
        final int dadosColunas;
        final int dadosLinhas;

        Geometria(int[] simbolo) {
            this.dados = simbolo[0];
            this.correccao = simbolo[1];
            this.regiaoLargura = simbolo[2];
            this.regiaoAltura = simbolo[3];
            this.regioes = simbolo[4];
            // **Os dois ultimos valem -1 quando o bloco e' o simbolo inteiro**,
            // que e' o caso de quase todos os 24 simbolos.
            this.blocoDados = simbolo[5] == -1 ? dados : simbolo[5];
            this.blocoErros = simbolo[6] == -1 ? correccao : simbolo[6];

            int colunasRegiao = regioesDe(regioes);
            int linhasRegiao = regioesDe(regioes);
            this.dadosColunas = colunasRegiao * regiaoLargura;
            this.dadosLinhas = linhasRegiao * regiaoAltura;

            // **A largura e' a regiao mais duas guias, uma por regiao de cada
            // lado.** Com `+ regioes` o 144x144 dava 132 + 36 = 168 em vez de
            // 132 + 6 + 6 = 144, e a matriz saia 24 colunas mais larga do que o
            // encoder pintou.
            this.colunas = dadosColunas + colunasRegiao + linhasRegiao;
            this.linhas = dadosLinhas + linhasRegiao + colunasRegiao;
        }
    }

    private static Geometria geometria(int[] simbolo) {
        return new Geometria(simbolo);
    }

    /**
     * O menor simbolo quadrado que leva {@code codewords} de dados.
     *
     * <p>A lista esta por ordem de capacidade, e a primeira que chegue serve. Nao
     * ha escolha envolvida: e' o menor que caiba.
     *
     * @throws SimbologiaException se o texto for maior do que o maior simbolo
     */
    private static int[] simboloPara(int codewords) {
        if (codewords > CAPACIDADE_MAXIMA) {
            throw new SimbologiaException("Data Matrix: o conteudo da " + codewords
                    + " codewords e o maior simbolo leva " + CAPACIDADE_MAXIMA
                    + ". O limite e' " + CAPACIDADE_MAXIMA + " codewords de dados, e com "
                    + "acentos cada caractere pode gastar dois.");
        }

        for (int[] simbolo : TabelasDataMatrix.SIMBOLOS) {
            if (codewords <= simbolo[0]) {
                return simbolo;
            }
        }

        // **Isto e' inalcancavel** e nao esta aqui por enfeite: com a guarda de
        // cima o `for` devolve sempre, e um `throw` no fim e' a forma de o
        // compilador nao se queixar do `return` em falta.
        throw new SimbologiaException(
                "Data Matrix: nenhum simbolo leva " + codewords + " codewords");
    }

    // --- a codificacao de nivel alto -------------------------------------------

    /**
     * O texto em codewords, no modo ASCII.
     *
     * <p>Tres regras, e so tres:
     *
     * <ul>
     *   <li><strong>Digitos aos pares.</strong> {@code 2026} sao dois codewords e
     *       nao quatro. O valor e' {@code d1 * 10 + d2 + 130}. E' a compressao do
     *       ECC200 de que o Data Matrix tira o nome: um numero de serie longo
     *       entra em metade do espaco.</li>
     *   <li><strong>ASCII 0 a 127</strong> entra com o valor mais um. O
     *       {@code +1} e' para reservar o 0, que e' o valor de um codeword que nao
     *       existe.</li>
     *   <li><strong>Tudo o resto</strong> (128 a 255) leva um {@code UPPER_SHIFT}
     *       a frente e o valor menos 127. O deslocamento vale para um codeword so,
     *       e por isso um acento custa dois.</li>
     * </ul>
     *
     * <p>Nao ha aqui nenhum valor aleatorizado, e e' de proposito: a aleatorizacao
     * existe para que um 254 ou um 255 nao parecam um unlatch, e este encoder
     * nunca os emite; e o enchimento, esse sim, e' aleatorizado.
     */
    public static int[] compactar(byte[] dados) {
        List<Integer> codewords = new ArrayList<>();
        int i = 0;

        while (i < dados.length) {
            int b = dados[i] & 0xFF;

            if (b >= 0x30 && b <= 0x39 && i + 1 < dados.length) {
                int seguinte = dados[i + 1] & 0xFF;
                if (seguinte >= 0x30 && seguinte <= 0x39) {
                    codewords.add((b - 0x30) * 10 + (seguinte - 0x30) + 130);
                    i += 2;
                    continue;
                }
            }

            if (b < 128) {
                codewords.add(b + 1);
            } else {
                // **O `b - 127` e' o que a nota da classe explica.** A norma
                // parece dizer `b - 128`, e a implementacao de referencia do
                // ZXing emite `b - 128 + 1` porque o leitor dela faz
                // `valor + 128 - 1`.
                codewords.add(UPPER_SHIFT);
                codewords.add(b - 127);
            }
            i++;
        }

        return toIntArray(codewords);
    }

    /**
     * O estado 253 de aleatorizacao, para o enchimento.
     *
     * <p>O enchimento e' o mesmo problema do PDF417 com outro nome: uma fileira de
     * 129 seguida de mais 129 e' um padrao que o leitor pode confundir com o fim
     * dos dados. Em vez disso, o primeiro e' 129 a serio e os seguintes sao
     * valores calculados, que e' o que a ISO manda.
     *
     * <p>E a formula nao e' arbitraria: 149 e' primo, e e' o que faz com que os
     * valores saiem espalhados pelos 254 possiveis em vez de se agruparem.
     */
    static int aleatorizar253(int posicao) {
        int pseudo = ((149 * posicao) % 253) + 1;
        int temp = PAD + pseudo;
        return temp <= 254 ? temp : temp - 254;
    }

    /** Completa com 129 e depois com valores aleatorizados, ate a capacidade. */
    static int[] encher(int[] codewords, int capacidade) {
        List<Integer> cheios = new ArrayList<>(Arrays.stream(codewords).boxed().toList());
        if (cheios.size() < capacidade) {
            cheios.add(PAD);
        }
        while (cheios.size() < capacidade) {
            cheios.add(aleatorizar253(cheios.size() + 1));
        }
        return toIntArray(cheios);
    }

    // --- a correccao de erros -------------------------------------------------

    /**
     * O Reed-Solomon de um bloco, com a convencao do ECC200.
     *
     * <p>O laco vai de tras para a frente e o resultado sai <strong>invertido</strong>.
     * As duas coisas sao da tabela, nao uma escolha: a tabela dos factores poe o
     * {@code x^(n-1)} no primeiro lugar, e o {@code eccReversed} inverte a lista.
     * Sem o inverter, a correccao sai toda ao contrario - e o sintoma e' o pior
     * dos possiveis: a primeira linha do simbolo bate certo e nenhuma le.
     *
     * @throws SimbologiaException se nao houver factores para {@code quantos}
     */
    static int[] correccaoDeBloco(int[] codewords, int quantos) {
        int[] coeficientes = null;
        for (int[] conjunto : TabelasDataMatrix.FATORES) {
            if (conjunto.length == quantos) {
                coeficientes = conjunto;
                break;
            }
        }
        if (coeficientes == null) {
            throw new SimbologiaException(
                    "Data Matrix: nao ha factores para " + quantos + " codewords de correccao");
        }

        int[] ecc = new int[quantos];

        for (int c : codewords) {
            int m = ecc[quantos - 1] ^ c;
            for (int k = quantos - 1; k > 0; k--) {
                if (m != 0 && coeficientes[k] != 0) {
                    ecc[k] = ecc[k - 1] ^ multiplicar(m, coeficientes[k]);
                } else {
                    ecc[k] = ecc[k - 1];
                }
            }
            ecc[0] = (m != 0 && coeficientes[0] != 0) ? multiplicar(m, coeficientes[0]) : 0;
        }

        // Inverte. Ver a nota em cima: nao e' uma escolha, e' a convencao.
        int[] invertido = new int[quantos];
        for (int i = 0; i < quantos; i++) {
            invertido[i] = ecc[quantos - 1 - i];
        }
        return invertido;
    }

    private static boolean ehUltimo(int[] simbolo) {
        return Arrays.equals(simbolo, TabelasDataMatrix.SIMBOLOS[23]);
    }

    /**
     * A correccao de erros do simbolo todo, com o entrelacamento.
     *
     * <p><strong>O entrelacamento e' o que faz um rasgo vertical ser
     * recuperavel.</strong> Os codewords de dados sao espalhados pelos blocos
     * round-robin, de modo que um rasgo numa coluna parte o mesmo numero de
     * codewords em cada bloco, e cada bloco sabe corrigir os seus. Sem
     * entrelacar, uma linha inteira de dados ia para o mesmo bloco e nao havia por
     * onde recuperar.
     */
    private static int[] corrigir(int[] codewords, int[] simbolo) {
        Geometria g = geometria(simbolo);

        if (ehUltimo(simbolo)) {
            // **O 144x144 e' o unico com blocos de tamanho desigual**, e por isso
            // o comprimento de cada bloco vem dos dados e nao de uma divisao.
            //
            // A conta e' `cheios` blocos de 156 e os restantes de 155:
            // 8 x 156 + 2 x 155 = 1558, que e' a capacidade. Com 154 dava 1556, e
            // dois codewords a menos num codigo de 1558 e' o tipo de erro que o
            // leitor acusa como corrupcao e nao como tabela errada.
            //
            // O tamanho de cada bloco **nao e' preciso calcula-lo**: o
            // entrelacamento round-robin da 156 a quem tem indices a partir de 0
            // e 155 a quem comeca mais tarde, sozinho. O que a tabela regista e'
            // o facto, e e' o teste que confirma que a conta fecha.
            int blocos = TabelasDataMatrix.ULTIMO_BLOCOS;
            int erros = TabelasDataMatrix.ULTIMO_ERROS;

            int[] saida = Arrays.copyOf(codewords, codewords.length + erros * blocos);
            for (int bloco = 0; bloco < blocos; bloco++) {
                int[] dados = parte(codewords, bloco, blocos);
                int[] ecc = correccaoDeBloco(dados, erros);
                int p = 0;
                for (int e = bloco; e < erros * blocos; e += blocos) {
                    saida[g.dados + e] = ecc[p++];
                }
            }
            return saida;
        }

        int blocos = g.dados / g.blocoDados;
        if (blocos == 1) {
            int[] ecc = correccaoDeBloco(codewords, g.correccao);
            int[] saida = Arrays.copyOf(codewords, codewords.length + ecc.length);
            System.arraycopy(ecc, 0, saida, codewords.length, ecc.length);
            return saida;
        }

        // **A correccao e' reservada antes de a escrever.** Um `int[]` nao cresce
        // por atribuicao, e a mesma linha em JavaScript nao levanta nada porque
        // o `Array` cresce. E a razao de o Python e o Java precisarem desta
        // reserva e o web nao.
        int[] saida = Arrays.copyOf(codewords, codewords.length + blocos * g.blocoErros);

        for (int bloco = 0; bloco < blocos; bloco++) {
            int[] dados = parte(codewords, bloco, blocos);
            int[] ecc = correccaoDeBloco(dados, g.blocoErros);
            int p = 0;
            for (int e = bloco; e < g.blocoErros * blocos; e += blocos) {
                saida[g.dados + e] = ecc[p++];
            }
        }

        return saida;
    }

    /**
     * Os codewords do bloco {@code bloco}, entrelacados round-robin.
     *
     * <p>E' {@code codewords[bloco], codewords[bloco + n], ...}, e nao uma
     * divisao: e' essa a forma de o 144x144 dar 156 a uns blocos e 155 a outros
     * sem ninguem precisar de calcular o tamanho de cada um.
     */
    private static int[] parte(int[] codewords, int bloco, int blocos) {
        List<Integer> parte = new ArrayList<>();
        for (int i = bloco; i < codewords.length; i += blocos) {
            parte.add(codewords[i]);
        }
        return toIntArray(parte);
    }

    // --- a colocacao dos modulos ---------------------------------------------

    /**
     * A colocacao dos codewords na regiao de dados, do Anexo M.1 da
     * ISO/IEC 16022.
     *
     * <p>Esta e' a parte do Data Matrix que ninguem acerta de memoria, e nao por
     * ser complicada: e' uma <strong>varredura em zigue-zague com quatro cantos
     * especiais</strong>, e os cantos disparam em condicoes que dependem do
     * tamanho modulo a modulo ({@code colunas % 4 != 0},
     * {@code colunas % 8 == 4}, ...). Errar numa dessas condicoes da um codigo
     * que se desenha perfeitamente e nao le.
     *
     * <p>Cada codeword ocupa oito modulos com o formato em {@code utah}, que e' a
     * forma de "casa" que da nome ao {@code codeword}: dois modulos em cima, tres
     * no meio, dois em baixo, deslocados um para a esquerda a cada linha.
     */
    static int[] colocar(int[] codewords, int colunas, int linhas) {
        // **O -1 e' "ainda nao preenchido"**, e nao um bit. A distincao e' o que
        // permite ao laco perguntar se pode escrever: um zero e' um modulo branco e
        // ja foi posto, e escrever por cima dele estragaria o codigo anterior.
        int[] modulos = new int[colunas * linhas];
        Arrays.fill(modulos, -1);

        for (int linha = 4, col = 0, pos = 0; linha < linhas || col < colunas;) {
            if (linha == linhas && col == 0) {
                canto1(modulos, colunas, linhas, codewords, pos++);
            }
            if (linha == linhas - 2 && col == 0 && colunas % 4 != 0) {
                canto2(modulos, colunas, linhas, codewords, pos++);
            }
            if (linha == linhas - 2 && col == 0 && colunas % 8 == 4) {
                canto3(modulos, colunas, linhas, codewords, pos++);
            }
            if (linha == linhas + 4 && col == 2 && colunas % 8 == 0) {
                canto4(modulos, colunas, linhas, codewords, pos++);
            }

            for (;;) {
                if (linha < linhas && col >= 0 && livre(modulos, colunas, linhas, col, linha)) {
                    utah(modulos, colunas, linhas, codewords, linha, col, pos++);
                }
                linha -= 2;
                col += 2;
                if (!(linha >= 0 && col < colunas)) {
                    break;
                }
            }
            linha++;
            col += 3;

            for (;;) {
                if (linha >= 0 && col < colunas && livre(modulos, colunas, linhas, col, linha)) {
                    utah(modulos, colunas, linhas, codewords, linha, col, pos++);
                }
                linha += 2;
                col -= 2;
                if (!(linha < linhas && col >= 0)) {
                    break;
                }
            }
            linha += 3;
            col++;
        }

        // O canto de baixo a direita, se sobrou por preencher.
        //
        // **O indice e' `linhas * colunas - 1` e nao `+ colunas - 1`.** O web
        // escrevia `+ colunas - 1`, que e' `colunas - 1` posicoes a mais: um
        // `Uint8Array` fora do fim da `undefined`, e `undefined < 0` e' falso,
        // portanto **o bloco nunca corria**. O encoder desenhava o codigo, o
        // ZXing lia-o, e o canto ficava por preencher sem ninguem ver. Foi ao
        // portar para o Python que o `IndexError` na mesma linha o denunciou.
        //
        // **A leitura e a escrita sao expressoes diferentes para a mesma celula,
        // e corrigir a primeira deixa a segunda errada.** A leitura e'
        // `linhas * colunas - 1`, o ultimo modulo; a escrita e'
        // `(linhas - 1) * colunas + (colunas - 1)`, que e' a mesma celula escrita
        // como quem pensa. Sao o mesmo sitio com duas formas - e foi por isso que
        // a correccao da leitura deixou a escrita com o `+ colunas - 1` antigo,
        // que da `ArrayIndexOutOfBounds`. **Um indice fora do fim no canto de
        // baixo e' um sintoma que nao aponta para o indice.**
        if (modulos[linhas * colunas - 1] < 0) {
            modulos[(linhas - 1) * colunas + (colunas - 1)] = 1;
            modulos[(linhas - 2) * colunas + (colunas - 2)] = 1;
        }

        return modulos;
    }

    private static boolean livre(int[] modulos, int colunas, int linhas, int col, int linha) {
        if (col < 0 || linha < 0 || col >= colunas || linha >= linhas) {
            return false;
        }
        return modulos[linha * colunas + col] < 0;
    }

    /**
     * Um modulo de um codeword, com a inversao das coordenadas nas pontas.
     *
     * <p>A linha e a coluna saem <strong>as duas</strong> das pontas ao mesmo
     * tempo, e o quanto uma se desloca depende do tamanho da <strong>outra</strong>:
     * {@code (linhas + 4) % 8} para a coluna, {@code (colunas + 4) % 8} para a
     * linha. Trocar as duas, ou esquecer o {@code + 4}, da uma matriz que se
     * desenha com o aspecto certo e nao le - e nenhum teste estrutural diz o que
     * e', porque a estrutura continua valida: e' um erro de sincronizacao, e
     * sincronizacao nao se ve na geometria.
     */
    private static void modulo(int[] modulos, int colunas, int linhas, int[] codewords,
            int linha, int col, int pos, int bit) {
        int l = linha;
        int c = col;
        if (l < 0) {
            l += linhas;
            c += 4 - ((linhas + 4) % 8);
        }
        if (c < 0) {
            c += colunas;
            l += 4 - ((colunas + 4) % 8);
        }

        if (c < 0 || l < 0 || c >= colunas || l >= linhas) {
            throw new SimbologiaException("Data Matrix: o modulo (" + l + ", " + c
                    + ") saiu da regiao de " + linhas + "x" + colunas
                    + ". A colocacao esta' errada.");
        }

        modulos[l * colunas + c] = ((codewords[pos] >> (8 - bit)) & 1) != 0 ? 1 : 0;
    }

    private static void utah(int[] modulos, int colunas, int linhas, int[] codewords,
            int linha, int col, int pos) {
        modulo(modulos, colunas, linhas, codewords, linha - 2, col - 2, pos, 1);
        modulo(modulos, colunas, linhas, codewords, linha - 2, col - 1, pos, 2);
        modulo(modulos, colunas, linhas, codewords, linha - 1, col - 2, pos, 3);
        modulo(modulos, colunas, linhas, codewords, linha - 1, col - 1, pos, 4);
        modulo(modulos, colunas, linhas, codewords, linha - 1, col, pos, 5);
        modulo(modulos, colunas, linhas, codewords, linha, col - 2, pos, 6);
        modulo(modulos, colunas, linhas, codewords, linha, col - 1, pos, 7);
        modulo(modulos, colunas, linhas, codewords, linha, col, pos, 8);
    }

    // Os quatro cantos, nas condicoes em que a norma os poe.

    private static void canto1(int[] m, int c, int l, int[] cw, int pos) {
        modulo(m, c, l, cw, l - 1, 0, pos, 1);
        modulo(m, c, l, cw, l - 1, 1, pos, 2);
        modulo(m, c, l, cw, l - 1, 2, pos, 3);
        modulo(m, c, l, cw, 0, c - 2, pos, 4);
        modulo(m, c, l, cw, 0, c - 1, pos, 5);
        modulo(m, c, l, cw, 1, c - 1, pos, 6);
        modulo(m, c, l, cw, 2, c - 1, pos, 7);
        modulo(m, c, l, cw, 3, c - 1, pos, 8);
    }

    private static void canto2(int[] m, int c, int l, int[] cw, int pos) {
        modulo(m, c, l, cw, l - 3, 0, pos, 1);
        modulo(m, c, l, cw, l - 2, 0, pos, 2);
        modulo(m, c, l, cw, l - 1, 0, pos, 3);
        modulo(m, c, l, cw, 0, c - 4, pos, 4);
        modulo(m, c, l, cw, 0, c - 3, pos, 5);
        modulo(m, c, l, cw, 0, c - 2, pos, 6);
        modulo(m, c, l, cw, 0, c - 1, pos, 7);
        modulo(m, c, l, cw, 1, c - 1, pos, 8);
    }

    private static void canto3(int[] m, int c, int l, int[] cw, int pos) {
        modulo(m, c, l, cw, l - 3, 0, pos, 1);
        modulo(m, c, l, cw, l - 2, 0, pos, 2);
        modulo(m, c, l, cw, l - 1, 0, pos, 3);
        modulo(m, c, l, cw, 0, c - 2, pos, 4);
        modulo(m, c, l, cw, 0, c - 1, pos, 5);
        modulo(m, c, l, cw, 1, c - 1, pos, 6);
        modulo(m, c, l, cw, 2, c - 1, pos, 7);
        modulo(m, c, l, cw, 3, c - 1, pos, 8);
    }

    private static void canto4(int[] m, int c, int l, int[] cw, int pos) {
        modulo(m, c, l, cw, l - 1, 0, pos, 1);
        modulo(m, c, l, cw, l - 1, c - 1, pos, 2);
        modulo(m, c, l, cw, 0, c - 3, pos, 3);
        modulo(m, c, l, cw, 0, c - 2, pos, 4);
        modulo(m, c, l, cw, 0, c - 1, pos, 5);
        modulo(m, c, l, cw, 1, c - 3, pos, 6);
        modulo(m, c, l, cw, 1, c - 2, pos, 7);
        modulo(m, c, l, cw, 1, c - 1, pos, 8);
    }

    // --- a construcao do simbolo ----------------------------------------------

    /**
     * Poe as guias a volta da regiao de dados.
     *
     * <p><strong>A guia de baixo-esquerda e' cheia e a de cima-direita e'
     * tracejada</strong>, e essa assimetria e' a assinatura do Data Matrix.
     *
     * <p><strong>O {@code x = 0} da guia de baixo e' obrigatorio.</strong> Sem
     * ele, a guia comeca onde a linha de dados acabou - ou seja, fora da matriz - e
     * a ultima linha do simbolo sai vazia. O sintoma e' um codigo que se parece
     * com um Data Matrix e nao e' lido por nada, porque e' a guia de baixo que o
     * leitor usa para se orientar. E a ultima linha e' a ultima coisa que se olha.
     */
    private static boolean[][] comGuias(int[] regiao, Geometria g) {
        int larguraDados = g.dadosColunas;
        int alturaDados = g.dadosLinhas;

        boolean[][] modulos = new boolean[g.linhas][g.colunas];
        int y = 0;

        for (int f = 0; f < alturaDados; f++) {
            int x = 0;

            // A guia de cima: alternada, e e' a tracejada do canto de cima-direita.
            if (f % g.regiaoAltura == 0) {
                for (int i = 0; i < g.colunas; i++) {
                    modulos[y][x++] = i % 2 == 0;
                }
                y++;
            }

            x = 0;
            for (int i = 0; i < larguraDados; i++) {
                // A guia da esquerda de cada regiao: cheia. E' a vertical do L.
                if (i % g.regiaoLargura == 0) {
                    modulos[y][x++] = true;
                }
                modulos[y][x++] = regiao[f * larguraDados + i] == 1;
                // A guia da direita de cada regiao: alternada com as linhas.
                if (i % g.regiaoLargura == g.regiaoLargura - 1) {
                    modulos[y][x++] = f % 2 == 0;
                }
            }
            y++;

            // A guia de baixo: cheia. E' a horizontal do L.
            if (f % g.regiaoAltura == g.regiaoAltura - 1) {
                x = 0;
                for (int i = 0; i < g.colunas; i++) {
                    modulos[y][x++] = true;
                }
                y++;
            }
        }

        return modulos;
    }

    /**
     * De uma lista de codewords ate a matriz.
     *
     * <p>Separado de {@link #dataMatrix(String)} para que o GS1 entre por aqui:
     * a escolha do simbolo, o enchimento, a correccao de erros e a colocacao sao
     * as mesmas, e uma segunda implementacao de cada uma delas seria uma segunda
     * fonte de verdade sobre a parte que o ZXing verifica.
     */
    public static CodigoMatriz montar(int[] dados, String nomeSimbolio) {
        int[] simbolo = simboloPara(dados.length);
        Geometria g = geometria(simbolo);

        int[] comDados = encher(dados, g.dados);
        int[] comEc = corrigir(comDados, simbolo);
        int[] regiao = colocar(comEc, g.dadosColunas, g.dadosLinhas);

        return new CodigoMatriz(nomeSimbolio, comGuias(regiao, g), dados, g.dados,
                g.correccao, dados.length);
    }

    // --- a API ----------------------------------------------------------------

    /**
     * Codifica em Data Matrix (ECC200).
     *
     * @param texto o que codificar. Qualquer texto UTF-8 cabe - nao ha o limite de
     *     ASCII dos codigos de barras de uma linha, porque cada byte acima de 127
     *     custa dois codewords em vez de ser recusado.
     * @throws SimbologiaException se o texto estiver vazio ou for maior que 1558
     *     codewords
     */
    public static CodigoMatriz dataMatrix(String texto) {
        if (texto == null || texto.isEmpty()) {
            throw new SimbologiaException("Data Matrix: escreve alguma coisa para codificar.");
        }

        // **Os bytes sao o UTF-8 do Java, e nao a plataforma.** O `getBytes()`
//  sem argumento usa a codificacao do sistema, e a mesma cadeia dava um codigo
        // diferente numa maquina portuguesa e numa americiana. **Um payload que
        // sai diferente conforme a maquina e' um bug que so aparece em producao.**
        byte[] bytes = texto.getBytes(StandardCharsets.UTF_8);

        return montar(compactar(bytes), "Data Matrix");
    }

    /** De uma lista de codewords ate a matriz, para quem precisar dela. */
    public static CodigoMatriz dataMatrixDeCodewords(int[] codewords, String nomeSimbolio) {
        return montar(Arrays.copyOf(codewords, codewords.length), nomeSimbolio);
    }

    private static int[] toIntArray(List<Integer> valores) {
        int[] saida = new int[valores.size()];
        for (int i = 0; i < saida.length; i++) {
            saida[i] = valores.get(i);
        }
        return saida;
    }
}
