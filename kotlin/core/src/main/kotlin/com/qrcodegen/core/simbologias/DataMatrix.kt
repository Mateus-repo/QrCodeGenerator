package com.qrcodegen.core.simbologias

/**
 * O Data Matrix (ECC200).
 *
 * **E' o codigo da industria:** a farmacia, a aeroespacial, a defesa e a
 * logistica. Ve-se em ampolas, em chips e em etiquetas de peca, e e' o formato
 * que substituiu o codigo de barras quando a etiqueta ficou pequena demais para
 * ele.
 *
 * ## Porque e' quadrado e nao tem padroes de localizacao
 *
 * O QR tem tres quadrados nos cantos e o Code 128 tem barras. O Data Matrix nao
 * tem nenhum dos dois: a orientacao vem de **duas guias em L**, uma **cheia** em
 * baixo e a esquerda e outra **tracejada** em cima e a direita.
 *
 * **A assimetria das duas guias e' o que o leitor usa para se orientar.** Trocar
 * uma delas de cheia para tracejada — ou o sitio — da um codigo que se parece com
 * um Data Matrix e nao e' lido por nada, e nenhum teste estrutural o apanha
 * porque a estrutura continua valida.
 *
 * ## Os cinco modos, e porque so dois entram
 *
 * A ISO/IEC 16022 define cinco modos de codificacao de nivel alto: ASCII, C40,
 * Text, X12 e EDIFACT. **Este encoder so usa dois**: ASCII e o deslocamento para
 * ASCII estendido.
 *
 * Os outros tres sao modos de *compressao*, e nao de correccao: o codigo que sai
 * sem eles e' perfeitamente valido e le-se em qualquer leitor. A diferenca e' o
 * tamanho — `MAST-2024-0001` sai num simbolo maior do que sairia em C40 — e isso
 * e' otimizacao, nao conformidade.
 *
 * **Nao ha mascaras, nao ha versoes com nomes e nao ha nivel a escolher.**
 * Escolhe-se o menor simbolo que caiba e a correccao e fixa — o ECC200 e' o
 * unico modo. Isto e' o oposto do QR em tudo.
 *
 * ## O valor de `b - 127`, que parece um erro
 *
 * O byte acima de 127 leva um [UPPER_SHIFT] a frente e **o valor menos 127**,
 * e nao menos 128 como a norma parece dizer. A leitura literal da ISO daria
 * `b - 128`; a implementacao de referencia do ZXing emite `b - 128 + 1` e o
 * leitor dela faz `valor + 128 - 1`, que e' o mesmo numero. **Os dois concordam, e
 * o resultado e' que o valor certo e' `b - 127`.**
 *
 * A primeira versao fazia `b - 128` "porque e' o que a norma diz", e o ZXing
 * devolvia cada byte alto **um abaixo** do que tinha sido escrito: um `ç` saia
 * como `r`, um `€` como `Ñ`. Todos os payloads ASCII liam-se bem e so os com
 * acentos e emojis falhavam — a assinatura de um erro que so aparece no canto.
 *
 * ## As tabelas sao geradas
 *
 * [TabelasDataMatrix] vem do `spec/gerar-tabelas-datamatrix.py`, que as extrai da
 * implementacao de referencia do ZXing — **a mesma fonte que o leitor usa para
 * verificar o que este encoder produz**. Nao ha um pacote de Kotlin com o Data
 * Matrix, e escrever as tabelas a mao seria uma segunda implementacao que
 * divergiria em silencio.
 */
object DataMatrix {

    /** O codeword de enchimento. */
    const val PAD = 129

    /** O deslocamento para ASCII estendido, que vale para o codeword seguinte. */
    const val UPPER_SHIFT = 235

    /** O FNC1, que no GS1 faz as duas coisas: sinaliza e separa. */
    const val FNC1 = 232

    /** O polinomio irredutivel do corpo finito, e o que o ZXing chama de 0x12D. */
    private const val MODULO = 0x12D

    /** A capacidade maxima, em codewords de dados, de qualquer simbolo. */
    val CAPACIDADE_MAXIMA: Int = TabelasDataMatrix.SIMBOLOS.last()[0]

    // --- o corpo finito -----------------------------------------------------

    /**
     * As tabelas de logaritmos e anti-logaritmos de `GF(256)`.
     *
     * **Sao calculadas, nao transcritas**, e e' o que torna esta classe diferente
     * de uma que tenha de levar tabelas: o corpo e' gerado pelo polinomio `0x12D` a
     * partir do 1, e cada multiplicacao e' uma soma de logaritmos.
     *
     * O indice 255 repete o 0 porque `LOG[a] + LOG[b]` chega a 508 e a tabela de
     * exponenciais e' usada com modulo 255.
     */
    private val EXP = IntArray(512)
    private val LOG = IntArray(256)

    init {
        var p = 1
        for (i in 0 until 255) {
            EXP[i] = p
            LOG[p] = i
            p = p shl 1
            if (p and 0x100 != 0) {
                p = p xor MODULO
            }
        }
        for (i in 255 until 512) {
            EXP[i] = EXP[i - 255]
        }
    }

    private fun multiplicar(a: Int, b: Int): Int {
        if (a == 0 || b == 0) return 0
        return EXP[LOG[a] + LOG[b]]
    }

    // --- a geometria --------------------------------------------------------

    /**
     * Quantas regioes de dados ha na horizontal, e quantas na vertical.
     *
     * **E' o mesmo numero nas duas direccoes**, e nao por simetria do formato: e'
     * que a tabela tem cinco chaves e `1` e `2` dao a mesma resposta. Um simbolo de
     * uma regiao e um de duas diferem no tamanho do bloco de correccao, nunca na
     * quantidade de regioes lado a lado.
     */
    private val REGIOES = mapOf(1 to 1, 2 to 1, 4 to 2, 16 to 4, 36 to 6)

    private fun regioesDe(n: Int): Int = REGIOES[n] ?: 1

    /**
     * A geometria de um simbolo, ja com os `-1` da tabela resolvidos.
     *
     * **E' uma classe e nao um `IntArray` de sete inteiros** porque os campos sao
     * usados em sitios diferentes e um `simbolo[5]` num `if` nao diz nada. A
     * excepcao e' a tabela gerada, que fica um `Array<IntArray>` porque e' uma
     * copia do ZXing e nao uma decisao.
     */
    internal class Geometria(val simbolo: IntArray) {
        val dados = simbolo[0]
        val correccao = simbolo[1]
        val regiaoLargura = simbolo[2]
        val regiaoAltura = simbolo[3]
        val regioes = simbolo[4]

        // **Os dois ultimos valem -1 quando o bloco e' o simbolo inteiro**, que
        // e' o caso de quase todos os 24 simbolos.
        val blocoDados = if (simbolo[5] == -1) dados else simbolo[5]
        val blocoErros = if (simbolo[6] == -1) correccao else simbolo[6]

        private val colunasRegiao = regioesDe(regioes)
        private val linhasRegiao = regioesDe(regioes)

        val dadosColunas = colunasRegiao * regiaoLargura
        val dadosLinhas = linhasRegiao * regiaoAltura

        // **A largura e' a regiao mais duas guias, uma por regiao de cada lado.**
        // Com `+ regioes` o 144x144 dava 132 + 36 = 168 em vez de 132 + 6 + 6 =
        // 144, e a matriz saia 24 colunas mais larga do que o encoder pintou.
        val colunas = dadosColunas + colunasRegiao + linhasRegiao
        val linhas = dadosLinhas + linhasRegiao + colunasRegiao
    }

    /**
     * O menor simbolo quadrado que leva [codewords] de dados.
     *
     * A lista esta por ordem de capacidade, e a primeira que chegue serve. Nao ha
     * escolha envolvida: e' o menor que caiba.
     *
     * @throws SimbologiaException se o texto for maior do que o maior simbolo
     */
    private fun simboloPara(codewords: Int): IntArray {
        if (codewords > CAPACIDADE_MAXIMA) {
            throw SimbologiaException(
                "Data Matrix: o conteudo da $codewords codewords e o maior simbolo " +
                    "leva $CAPACIDADE_MAXIMA. O limite e' $CAPACIDADE_MAXIMA codewords " +
                    "de dados, e com acentos cada caractere pode gastar dois.",
            )
        }

        for (simbolo in TabelasDataMatrix.SIMBOLOS) {
            if (codewords <= simbolo[0]) return simbolo
        }

        // **Isto e' inalcancavel** e nao esta aqui por enfeite: com a guarda de
        // cima o `for` devolve sempre, e um `throw` no fim e' a forma de o
        // compilador nao se queixar do `return` em falta.
        throw SimbologiaException("Data Matrix: nenhum simbolo leva $codewords codewords")
    }

    // --- a codificacao de nivel alto ----------------------------------------

    /**
     * O texto em codewords, no modo ASCII.
     *
     * Tres regras, e so tres:
     *
     *  - **Digitos aos pares.** `2026` sao dois codewords e nao quatro. O valor e'
     *    `d1 * 10 + d2 + 130`. E' a compressao do ECC200 de que o Data Matrix tira
     *    o nome: um numero de serie longo entra em metade do espaco.
     *  - **ASCII 0 a 127** entra com o valor mais um. O `+1` e' para reservar o 0,
     *    que e' o valor de um codeword que nao existe.
     *  - **Tudo o resto** (128 a 255) leva um [UPPER_SHIFT] a frente e o valor
     *    menos 127. O deslocamento vale para um codeword so, e por isso um acento
     *    custa dois.
     *
     * Nao ha aqui nenhum valor aleatorizado, e e' de proposito: a aleatorizacao
     * existe para que um 254 ou um 255 nao parecam um unlatch, e este encoder nunca
     * os emite; e o enchimento, esse sim, e' aleatorizado — ver [encher].
     */
    fun compactar(dados: ByteArray): IntArray {
        val codewords = ArrayList<Int>(dados.size + 2)
        var i = 0

        while (i < dados.size) {
            val b = dados[i].toInt() and 0xFF

            if (b in 0x30..0x39 && i + 1 < dados.size) {
                val seguinte = dados[i + 1].toInt() and 0xFF
                if (seguinte in 0x30..0x39) {
                    codewords.add((b - 0x30) * 10 + (seguinte - 0x30) + 130)
                    i += 2
                    continue
                }
            }

            if (b < 128) {
                codewords.add(b + 1)
            } else {
                // **O `b - 127` e' o que a nota da classe explica.** A norma parece
                // dizer `b - 128`, e a implementacao de referencia do ZXing emite
                // `b - 128 + 1` porque o leitor dela faz `valor + 128 - 1`.
                codewords.add(UPPER_SHIFT)
                codewords.add(b - 127)
            }
            i++
        }

        return codewords.toIntArray()
    }

    /**
     * O estado 253 de aleatorizacao, para o enchimento.
     *
     * O enchimento e' o mesmo problema do PDF417 com outro nome: uma fileira de 129
     * seguida de mais 129 e' um padrao que o leitor pode confundir com o fim dos
     * dados. Em vez disso, o primeiro e' 129 a serio e os seguintes sao valores
     * calculados, que e' o que a ISO manda.
     *
     * E a formula nao e' arbitraria: 149 e' primo, e e' o que faz com que os valores
     * saiem espalhados pelos 254 possiveis em vez de se agruparem.
     */
    internal fun aleatorizar253(posicao: Int): Int {
        val pseudo = ((149 * posicao) % 253) + 1
        val temp = PAD + pseudo
        return if (temp <= 254) temp else temp - 254
    }

    /** Completa com 129 e depois com valores aleatorizados, ate a capacidade. */
    internal fun encher(codewords: IntArray, capacidade: Int): IntArray {
        val cheios = IntArray(capacidade)
        System.arraycopy(codewords, 0, cheios, 0, codewords.size)
        if (codewords.size < capacidade) {
            cheios[codewords.size] = PAD
        }
        var i = codewords.size + 1
        while (i < capacidade) {
            cheios[i] = aleatorizar253(i + 1)
            i++
        }
        return cheios
    }

    // --- a correccao de erros ------------------------------------------------

    /**
     * O Reed-Solomon de um bloco, com a convencao do ECC200.
     *
     * O laco vai de tras para a frente e o resultado sai **invertido**. As duas
     * coisas sao da tabela, nao uma escolha: a tabela dos factores poe o `x^(n-1)`
     * no primeiro lugar, e o `eccReversed` inverte a lista. Sem o inverter, a
     * correccao sai toda ao contrario — e o sintoma e' o pior dos possiveis: a
     * primeira linha do simbolo bate certo e nenhuma le.
     *
     * @throws SimbologiaException se nao houver factores para [quantos]
     */
    internal fun correccaoDeBloco(codewords: IntArray, quantos: Int): IntArray {
        val coeficientes = TabelasDataMatrix.FATORES[quantos]
            ?: throw SimbologiaException(
                "Data Matrix: nao ha factores para $quantos codewords de correccao",
            )

        val ecc = IntArray(quantos)

        for (c in codewords) {
            val m = ecc[quantos - 1] xor c
            for (k in quantos - 1 downTo 1) {
                ecc[k] = if (m != 0 && coeficientes[k] != 0) {
                    ecc[k - 1] xor multiplicar(m, coeficientes[k])
                } else {
                    ecc[k - 1]
                }
            }
            ecc[0] = if (m != 0 && coeficientes[0] != 0) multiplicar(m, coeficientes[0]) else 0
        }

        // Inverte. Ver a nota em cima: nao e' uma escolha, e' a convencao.
        val invertido = IntArray(quantos)
        for (i in 0 until quantos) {
            invertido[i] = ecc[quantos - 1 - i]
        }
        return invertido
    }

    private fun ehUltimo(simbolo: IntArray): Boolean = simbolo[0] == TabelasDataMatrix.SIMBOLOS.last()[0] &&
        simbolo[1] == TabelasDataMatrix.SIMBOLOS.last()[1]

    /**
     * A correccao de erros do simbolo todo, com o entrelacamento.
     *
     * **O entrelacamento e' o que faz um rasgo vertical ser recuperavel.** Os
     * codewords de dados sao espalhados pelos blocos round-robin, de modo que um
     * rasgo numa coluna parte o mesmo numero de codewords em cada bloco, e cada
     * bloco sabe corrigir os seus. Sem entrelacar, uma linha inteira de dados ia
     * para o mesmo bloco e nao havia por onde recuperar.
     */
    private fun corrigir(codewords: IntArray, simbolo: IntArray): IntArray {
        val g = Geometria(simbolo)

        if (ehUltimo(simbolo)) {
            // **O 144x144 e' o unico com blocos de tamanho desigual**, e por isso o
            // comprimento de cada bloco vem dos dados e nao de uma divisao.
            //
            // A conta e' `cheios` blocos de 156 e os restantes de 155:
            // 8 x 156 + 2 x 155 = 1558, que e' a capacidade. Com 154 dava 1556, e
            // dois codewords a menos num codigo de 1558 e' o tipo de erro que o
            // leitor acusa como corrupcao e nao como tabela errada.
            //
            // O tamanho de cada bloco **nao e' preciso calcula-lo**: o
            // entrelacamento round-robin da 156 a quem tem indices a partir de 0 e
            // 155 a quem comeca mais tarde, sozinho. O que a tabela regista e' o
            // facto, e e' o teste que confirma que a conta fecha.
            val blocos = TabelasDataMatrix.ULTIMO_BLOCOS
            val erros = TabelasDataMatrix.ULTIMO_ERROS

            val saida = IntArray(codewords.size + erros * blocos)
            System.arraycopy(codewords, 0, saida, 0, codewords.size)

            for (bloco in 0 until blocos) {
                val ecc = correccaoDeBloco(parte(codewords, bloco, blocos), erros)
                var p = 0
                var e = bloco
                while (e < erros * blocos) {
                    saida[g.dados + e] = ecc[p++]
                    e += blocos
                }
            }
            return saida
        }

        val blocos = g.dados / g.blocoDados
        if (blocos == 1) {
            val ecc = correccaoDeBloco(codewords, g.correccao)
            val saida = IntArray(codewords.size + ecc.size)
            System.arraycopy(codewords, 0, saida, 0, codewords.size)
            System.arraycopy(ecc, 0, saida, codewords.size, ecc.size)
            return saida
        }

        // **A correccao e' reservada antes de a escrever.** Um `IntArray` nao
        // cresce por atribuicao, e a mesma linha em JavaScript nao levanta nada
        // porque o `Array` cresce. E' a razao de o Python, o Java e o Kotlin
        // precisarem desta reserva e o web nao.
        val saida = IntArray(codewords.size + blocos * g.blocoErros)
        System.arraycopy(codewords, 0, saida, 0, codewords.size)

        for (bloco in 0 until blocos) {
            val ecc = correccaoDeBloco(parte(codewords, bloco, blocos), g.blocoErros)
            var p = 0
            var e = bloco
            while (e < g.blocoErros * blocos) {
                saida[g.dados + e] = ecc[p++]
                e += blocos
            }
        }

        return saida
    }

    /**
     * Os codewords do bloco [bloco], entrelacados round-robin.
     *
     * E' `codewords[bloco], codewords[bloco + n], ...`, e nao uma divisao: e' essa
     * a forma de o 144x144 dar 156 a uns blocos e 155 a outros sem ninguem
     * precisar de calcular o tamanho de cada um.
     */
    private fun parte(codewords: IntArray, bloco: Int, blocos: Int): IntArray {
        val parte = IntArray((codewords.size - bloco + blocos - 1) / blocos)
        var p = 0
        var i = bloco
        while (i < codewords.size) {
            parte[p++] = codewords[i]
            i += blocos
        }
        return parte
    }

    // --- a colocacao dos modulos --------------------------------------------

    /**
     * A colocacao dos codewords na regiao de dados, do Anexo M.1 da ISO/IEC
     * 16022.
     *
     * Esta e' a parte do Data Matrix que ninguem acerta de memoria, e nao por ser
     * complicada: e' uma **varredura em zigue-zague com quatro cantos especiais**,
     * e os cantos disparam em condicoes que dependem do tamanho modulo a modulo
     * (`colunas % 4 != 0`, `colunas % 8 == 4`, ...). Errar numa dessas condicoes
     * da um codigo que se desenha perfeitamente e nao le.
     *
     * Cada codeword ocupa oito modulos com o formato em `utah`, que e' a forma de
     * "casa" que da nome ao `codeword`: dois modulos em cima, tres no meio, dois
     * em baixo, deslocados um para a esquerda a cada linha.
     *
     * **O `-1` e' "ainda nao preenchido"**, e nao um bit. A distincao e' o que
     * permite ao laco perguntar se pode escrever: um zero e' um modulo branco e ja
     * foi posto, e escrever por cima dele estragaria o codeword anterior.
     */
    internal fun colocar(codewords: IntArray, colunas: Int, linhas: Int): IntArray {
        val modulos = IntArray(colunas * linhas) { -1 }

        var linha = 4
        var col = 0
        var pos = 0

        // **`while (true)` com o `break` no fim, e nao um `while` na cabeca.** O
        // `while` na cabeca decide no inicio, e esta varredura decide no fim: a
        // diferenca e' um passo do laco, e um passo deste laco e' oito modulos.
        while (true) {
            if (linha == linhas && col == 0) {
                canto1(modulos, colunas, linhas, codewords, pos++)
            }
            if (linha == linhas - 2 && col == 0 && colunas % 4 != 0) {
                canto2(modulos, colunas, linhas, codewords, pos++)
            }
            if (linha == linhas - 2 && col == 0 && colunas % 8 == 4) {
                canto3(modulos, colunas, linhas, codewords, pos++)
            }
            if (linha == linhas + 4 && col == 2 && colunas % 8 == 0) {
                canto4(modulos, colunas, linhas, codewords, pos++)
            }

            while (true) {
                if (linha < linhas && col >= 0 && livre(modulos, colunas, linhas, col, linha)) {
                    utah(modulos, colunas, linhas, codewords, linha, col, pos++)
                }
                linha -= 2
                col += 2
                if (!(linha >= 0 && col < colunas)) break
            }
            linha++
            col += 3

            while (true) {
                if (linha >= 0 && col < colunas && livre(modulos, colunas, linhas, col, linha)) {
                    utah(modulos, colunas, linhas, codewords, linha, col, pos++)
                }
                linha += 2
                col -= 2
                if (!(linha < linhas && col >= 0)) break
            }
            linha += 3
            col++

            if (!(linha < linhas || col < colunas)) break
        }

        // O canto de baixo a direita, se sobrou por preencher.
        //
        // **O indice e' `linhas * colunas - 1` e nao `+ colunas - 1`.** O web
        // escrevia `+ colunas - 1`, que e' `colunas - 1` posicoes a mais: um
        // `Uint8Array` fora do fim da `undefined`, e `undefined < 0` e' falso,
        // portanto **o bloco nunca corria**. O encoder desenhava o codigo, o ZXing
        // lia-o, e o canto ficava por preencher sem ninguem ver. **E quando o
        // Java foi portado, corrigir a leitura deixou a escrita errada** — as duas
        // sao a mesma celula escrita de duas maneiras — e o sintoma foi um
        // `ArrayIndexOutOfBounds` no indice 209 de uma regiao de 196, que nao
        // aponta para o indice.
        if (modulos[linhas * colunas - 1] < 0) {
            modulos[(linhas - 1) * colunas + (colunas - 1)] = 1
            modulos[(linhas - 2) * colunas + (colunas - 2)] = 1
        }

        return modulos
    }

    private fun livre(modulos: IntArray, colunas: Int, linhas: Int, col: Int, linha: Int): Boolean {
        if (col < 0 || linha < 0 || col >= colunas || linha >= linhas) return false
        return modulos[linha * colunas + col] < 0
    }

    /**
     * Um modulo de um codeword, com a inversao das coordenadas nas pontas.
     *
     * A linha e a coluna saem **as duas** das pontas ao mesmo tempo, e o quanto
     * uma se desloca depende do tamanho da **outra**: `(linhas + 4) % 8` para a
     * coluna, `(colunas + 4) % 8` para a linha. Trocar as duas, ou esquecer o
     * `+ 4`, da uma matriz que se desenha com o aspecto certo e nao le — e nenhum
     * teste estrutural diz o que e', porque a estrutura continua valida: e' um
     * erro de sincronizacao, e sincronizacao nao se ve na geometria.
     */
    private fun modulo(
        modulos: IntArray, colunas: Int, linhas: Int, codewords: IntArray,
        linha: Int, col: Int, pos: Int, bit: Int,
    ) {
        var l = linha
        var c = col
        if (l < 0) {
            l += linhas
            c += 4 - ((linhas + 4) % 8)
        }
        if (c < 0) {
            c += colunas
            l += 4 - ((colunas + 4) % 8)
        }

        if (c < 0 || l < 0 || c >= colunas || l >= linhas) {
            throw SimbologiaException(
                "Data Matrix: o modulo ($l, $c) saiu da regiao de ${linhas}x$colunas. " +
                    "A colocacao esta' errada.",
            )
        }

        modulos[l * colunas + c] = if ((codewords[pos] shr (8 - bit)) and 1 != 0) 1 else 0
    }

    private fun utah(
        modulos: IntArray, colunas: Int, linhas: Int, codewords: IntArray,
        linha: Int, col: Int, pos: Int,
    ) {
        modulo(modulos, colunas, linhas, codewords, linha - 2, col - 2, pos, 1)
        modulo(modulos, colunas, linhas, codewords, linha - 2, col - 1, pos, 2)
        modulo(modulos, colunas, linhas, codewords, linha - 1, col - 2, pos, 3)
        modulo(modulos, colunas, linhas, codewords, linha - 1, col - 1, pos, 4)
        modulo(modulos, colunas, linhas, codewords, linha - 1, col, pos, 5)
        modulo(modulos, colunas, linhas, codewords, linha, col - 2, pos, 6)
        modulo(modulos, colunas, linhas, codewords, linha, col - 1, pos, 7)
        modulo(modulos, colunas, linhas, codewords, linha, col, pos, 8)
    }

    // Os quatro cantos, nas condicoes em que a norma os poe.

    private fun canto1(m: IntArray, c: Int, l: Int, cw: IntArray, pos: Int) {
        modulo(m, c, l, cw, l - 1, 0, pos, 1)
        modulo(m, c, l, cw, l - 1, 1, pos, 2)
        modulo(m, c, l, cw, l - 1, 2, pos, 3)
        modulo(m, c, l, cw, 0, c - 2, pos, 4)
        modulo(m, c, l, cw, 0, c - 1, pos, 5)
        modulo(m, c, l, cw, 1, c - 1, pos, 6)
        modulo(m, c, l, cw, 2, c - 1, pos, 7)
        modulo(m, c, l, cw, 3, c - 1, pos, 8)
    }

    private fun canto2(m: IntArray, c: Int, l: Int, cw: IntArray, pos: Int) {
        modulo(m, c, l, cw, l - 3, 0, pos, 1)
        modulo(m, c, l, cw, l - 2, 0, pos, 2)
        modulo(m, c, l, cw, l - 1, 0, pos, 3)
        modulo(m, c, l, cw, 0, c - 4, pos, 4)
        modulo(m, c, l, cw, 0, c - 3, pos, 5)
        modulo(m, c, l, cw, 0, c - 2, pos, 6)
        modulo(m, c, l, cw, 0, c - 1, pos, 7)
        modulo(m, c, l, cw, 1, c - 1, pos, 8)
    }

    private fun canto3(m: IntArray, c: Int, l: Int, cw: IntArray, pos: Int) {
        modulo(m, c, l, cw, l - 3, 0, pos, 1)
        modulo(m, c, l, cw, l - 2, 0, pos, 2)
        modulo(m, c, l, cw, l - 1, 0, pos, 3)
        modulo(m, c, l, cw, 0, c - 2, pos, 4)
        modulo(m, c, l, cw, 0, c - 1, pos, 5)
        modulo(m, c, l, cw, 1, c - 1, pos, 6)
        modulo(m, c, l, cw, 2, c - 1, pos, 7)
        modulo(m, c, l, cw, 3, c - 1, pos, 8)
    }

    private fun canto4(m: IntArray, c: Int, l: Int, cw: IntArray, pos: Int) {
        modulo(m, c, l, cw, l - 1, 0, pos, 1)
        modulo(m, c, l, cw, l - 1, c - 1, pos, 2)
        modulo(m, c, l, cw, 0, c - 3, pos, 3)
        modulo(m, c, l, cw, 0, c - 2, pos, 4)
        modulo(m, c, l, cw, 0, c - 1, pos, 5)
        modulo(m, c, l, cw, 1, c - 3, pos, 6)
        modulo(m, c, l, cw, 1, c - 2, pos, 7)
        modulo(m, c, l, cw, 1, c - 1, pos, 8)
    }

    // --- a construcao do simbolo --------------------------------------------

    /**
     * Poe as guias a volta da regiao de dados.
     *
     * **A guia de baixo-esquerda e' cheia e a de cima-direita e' tracejada**, e essa
     * assimetria e' a assinatura do Data Matrix.
     *
     * **O `x = 0` da guia de baixo e' obrigatorio.** Sem ele, a guia comeca onde a
     * linha de dados acabou — ou seja, fora da matriz — e a ultima linha do simbolo
     * sai vazia. O sintoma e' um codigo que se parece com um Data Matrix e nao e'
     * lido por nada, porque e' a guia de baixo que o leitor usa para se orientar. E
     * a ultima linha e' a ultima coisa que se olha.
     */
    private fun comGuias(regiao: IntArray, g: Geometria): Array<BooleanArray> {
        val larguraDados = g.dadosColunas
        val alturaDados = g.dadosLinhas

        val modulos = Array(g.linhas) { BooleanArray(g.colunas) }
        var y = 0

        for (f in 0 until alturaDados) {
            var x = 0

            // A guia de cima: alternada, e e' a tracejada do canto de cima-direita.
            if (f % g.regiaoAltura == 0) {
                for (i in 0 until g.colunas) {
                    modulos[y][x++] = i % 2 == 0
                }
                y++
            }

            x = 0
            for (i in 0 until larguraDados) {
                // A guia da esquerda de cada regiao: cheia. E' a vertical do L.
                if (i % g.regiaoLargura == 0) {
                    modulos[y][x++] = true
                }
                modulos[y][x++] = regiao[f * larguraDados + i] == 1
                // A guia da direita de cada regiao: alternada com as linhas.
                if (i % g.regiaoLargura == g.regiaoLargura - 1) {
                    modulos[y][x++] = f % 2 == 0
                }
            }
            y++

            // A guia de baixo: cheia. E' o horizontal do L.
            if (f % g.regiaoAltura == g.regiaoAltura - 1) {
                x = 0
                for (i in 0 until g.colunas) {
                    modulos[y][x++] = true
                }
                y++
            }
        }

        return modulos
    }

    /**
     * De uma lista de codewords ate a matriz.
     *
     * Separado de [dataMatrix] para que o GS1 entre por aqui: a escolha do
     * simbolo, o enchimento, a correccao de erros e a colocacao sao as mesmas, e
     * uma segunda implementacao de cada uma delas seria uma segunda fonte de
     * verdade sobre a parte que o ZXing verifica.
     */
    fun montar(dados: IntArray, nomeSimbolio: String = "Data Matrix"): CodigoMatriz {
        val simbolo = simboloPara(dados.size)
        val g = Geometria(simbolo)

        val comDados = encher(dados, g.dados)
        val comEc = corrigir(comDados, simbolo)
        val regiao = colocar(comEc, g.dadosColunas, g.dadosLinhas)

        return CodigoMatriz(
            simbologia = nomeSimbolio,
            modulos = comGuias(regiao, g),
            codewords = dados,
            dados = g.dados,
            correccao = g.correccao,
        )
    }

    // --- a API --------------------------------------------------------------

    /**
     * Codifica em Data Matrix (ECC200).
     *
     * @param texto o que codificar. Qualquer texto UTF-8 cabe — nao ha o limite de
     *   ASCII dos codigos de barras de uma linha, porque cada byte acima de 127
     *   custa dois codewords em vez de ser recusado.
     * @throws SimbologiaException se o texto estiver vazio ou for maior que 1558
     *   codewords
     */
    fun dataMatrix(texto: String): CodigoMatriz {
        if (texto.isEmpty()) {
            throw SimbologiaException("Data Matrix: escreve alguma coisa para codificar.")
        }

        // **`toByteArray(Charsets.UTF_8)` e nao a codificacao da plataforma.** O
        // `String.toByteArray()` sem argumento usa a plataforma, e a mesma cadeia
        // dava um codigo diferente numa maquina portuguesa e numa americana. **Um
        // payload que sai diferente conforme a maquina e' um bug que so aparece em
        // producao.**
        return montar(compactar(texto.toByteArray(Charsets.UTF_8)))
    }

    /** De uma lista de codewords ate a matriz, para quem precisar dela. */
    fun dataMatrixDeCodewords(codewords: IntArray, nomeSimbolio: String = "Data Matrix"): CodigoMatriz =
        montar(codewords.copyOf(), nomeSimbolio)
}