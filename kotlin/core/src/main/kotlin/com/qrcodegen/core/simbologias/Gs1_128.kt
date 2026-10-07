package com.qrcodegen.core.simbologias

/**
 * GS1-128, outrora chamado EAN/UCC-128.
 *
 * O Code 128 com as regras do GS1 por cima. E' o codigo de barras que vai na
 * etiqueta de uma caixa de armario de farmacia, e a diferenca para o Code 128
 * normal nao esta no desenho: esta em **saber onde acaba cada campo**.
 *
 * ## O problema que ele resolve
 *
 * O GTIN sozinho e' um numero de comprimento fixo, e o leitor sabe que tem de ler
 * catorze digitos. Com varios campos ja nao: em `(10)LOTE-A1(17)270630`, onde
 * acaba `LOTE-A1`? Sem regra o leitor tem de adivinhar, e adivinhar mal e' ler
 * um campo invalido.
 *
 * A regra e' o **FNC1**, um codeword que nao desenha um caracter visivel e que
 * marca "o campo de comprimento variavel acabou aqui".
 *
 * ## As tres coisas que sao FNC1
 *
 *  1. **No inicio**, logo a seguir ao caracter de inicio do conjunto. E' o que
 *     diz ao leitor "este e' um GS1-128", e e' o `]C1` do identificador.
 *  2. **No fim de cada campo de comprimento variavel**, menos no ultimo. E' o
 *     separador. A regra "menos no ultimo" e' da propria GS1: um separador no
 *     fim nao separa de nada.
 *  3. **Nunca** dentro de um campo de comprimento fixo, porque ai o comprimento
 *     ja esta no AI e um FNC1 a meio leria-se como parte do valor.
 *
 * ## Deliberadamente nao chama o [Code128]
 *
 * Aquele escolhe os conjuntos e faz as comutacoes, e o GS1-128 nao pode: tem de
 * ficar no conjunto B, e o FNC1 e' um codeword que o [Code128] nao sabe emitir.
 * Chama-lo e forcar o conjunto B por opcao seria meio caminho, e **o meio caminho
 * e' onde estao os bugs**.
 *
 * ## O que o leitor devolve, e que os leitores nao concordam
 *
 * **O [CodigoGs1.payload] e' o `0x1D` no sitio certo, e o [CodigoGs1.legenda] e'
 * a forma humana entre parenteses.** Sao tres representacoes do mesmo codigo:
 *
 * | | `zxingcpp` (Python) | ZXing (Java) |
 * | |---|---|
 * | payload | `bytes` | `text`, **sem** o `0x1D` |
 * | forma humana entre parenteses | `text` | **nao existe** |
 * | `]C1` | `symbology_identifier` | `getResultMetadata()` |
 * | codewords | nao devolve | `getRawBytes()` |
 *
 * Sao leitores diferentes com o mesmo formato, e **um teste escrito contra um
 * esta errado contra o outro**. Ver `Gs1_128Testes` em Java.
 */
object Gs1_128 {

    /**
     * O valor do codeword do FNC1 no Code 128.
     *
     * 102 nao e' um valor de conjunto nem um caracter: e' uma funcao, e e' o mesmo
     * em todos os contextos - no inicio e como separador. **Nao ha um "FNC1 de
     * inicio" e um "FNC1 separador" com numeros diferentes**, ao contrario do que
     * se pode supor.
     */
    const val FNC1: Int = 102

    /**
     * O separador GS, `0x1D` - o mesmo byte que o leitor devolve nos bytes.
     *
     * **Nao e' uma escolha de interface.** E' o valor que a GS1 chama de Group
     * Separator e o mesmo que o leitor devolve, para que o texto que a aplicacao
     * mostra e o que o leitor le sejam o mesmo numero e nao duas tradicoes.
     */
    const val GS: Char = '\u001D'

    /** O codeword de inicio do conjunto B, que e' o unico que o GS1-128 usa. */
    private const val INICIO_B = 104

    /** O codeword de paragem. */
    private const val PARAGEM = 106

    /**
     * O codigo de barras GS1-128.
     *
     * @param elementoString o texto com os AIs entre parenteses, na forma de leitura
     *   humana da GS1: `(01)04012345678901(10)LOTE-A1`. Os parenteses **nao** vao
     *   para dentro do codigo de barras - fazem parte da notacao humana e o leitor
     *   nao os ve. **Os digitos do AI vao**, ao contrario dos parenteses.
     */
    fun gs1_128(elementoString: String): CodigoGs1 {
        val campos = analisar(elementoString)

        /*
         * A forma de maquina: os campos concatenados, com o FNC1 onde a GS1 o quer.
         *
         * O FNC1 do inicio vai **depois** do caracter de inicio do conjunto B - e' o
         * primeiro codeword de dados, nao parte do cabecalho. Po-lo antes produz um
         * codigo que o leitor classifica como Code 128 normal, e o utilizador nunca
         * ve a diferenca - so o leitor de um sistema GS1.
         */
        val valores = ArrayList<Int>()
        valores.add(INICIO_B)
        valores.add(FNC1)

        val ultimo = campos.size - 1
        var separadores = 1

        for ((i, campo) in campos.withIndex()) {
            /*
             * **Os digitos do AI vao no codigo de barras, sem parenteses.**
             *
             * A primeira versao emitia so `campo.valor` e o AI ficava de fora, por
             * causa de uma confusao entre a forma humana e a de maquina: em
             * `(10)LOTE-A1` os parenteses sao para quem le e nao vao para o codigo -
             * mas os **digitos do AI vao**. O resultado eram 17 codewords em vez de
             * 20, o ZXing nao lia nada, e a razao nao era visivel no codigo.
             *
             * E o `resto` entra **antes** do conteudo: num `3103` o digito da posicao
             * decimal implicita faz parte do valor, nao do AI.
             */
            val conteudo = campo.ai + campo.valor
            for (c in conteudo) {
                valores.add(valorNoConjuntoB(c, campo.ai))
            }

            /*
             * O separador vai no fim de cada campo variavel **excepto o ultimo**.
             *
             * **Um separador no fim nao separa de nada**, e o leitor conta-o como
             * parte do campo seguinte. A primeira versao metia um em todos os campos
             * variaveis, e o `descodificar` falhava em seis de oito casos: o ZXing
             * devolvia o mesmo codigo com um `0x1D` a mais e o codigo continuava a ler
             * bem - a falha era so na comparacao, e sem ela nao se via.
             */
            if (campo.separador && i != ultimo) {
                valores.add(FNC1)
                separadores++
            }
        }

        /*
         * O caracter de verificacao: o valor de inicio com peso 1, cada valor de
         * dados multiplicado pela sua posicao - a primeira a valer 1 - e o resultado
         * modulo 103.
         *
         * **Nao e' uma soma simples.** A primeira versao somava os valores todos sem
         * pesos, e produzia um valor de verificacao diferente do certo: 222 modulos
         * em vez dos 200 que a conta pedia, o ZXing a recusar **sem dizer por que**,
         * e nenhuma diferenca visivel no desenho.
         *
         * O FNC1 entra na conta com o valor 102 e com o peso da sua posicao, como
         * qualquer outro codeword - e e' por isso que ele tem de estar na lista
         * **antes** de se calcular a soma, e nao a ser acrescentado a parte.
         */
        var soma = valores[0]
        for (i in 1 until valores.size) {
            soma += valores[i] * i
        }
        val verificacao = soma % 103

        val todos = ArrayList<Int>(valores.size + 2)
        todos.addAll(valores)
        todos.add(verificacao)
        todos.add(PARAGEM)

        val grelha = ArrayList<Boolean>()
        for (v in todos) {
            grelha.addAll(Code128.modulosDoValor(v))
        }

        return CodigoGs1(
            modulos = grelha.toBooleanArray(),
            legenda = legivel(campos),
            payload = maquina(campos),
            gs1 = legivel(campos),
            campos = campos,
            separadores = separadores,
        )
    }

    /**
     * O valor Code 128 de um caracter no conjunto B.
     *
     * No conjunto B o valor e' o ASCII menos 32, para 0 a 95. Os caracteres que nao
     * cabem no GS1-128 - os acentos, por exemplo - sao recusados aqui e nao no
     * desenho, porque o erro e' do dado e nao do codigo.
     */
    private fun valorNoConjuntoB(caractere: Char, ai: String): Int {
        val codigo = caractere.code

        if (codigo < 32 || codigo > 127) {
            throw SimbologiaException(
                "GS1-128: o AI ($ai) tem o caractere \"$caractere\" (U+" +
                    codigo.toString(16).uppercase().padStart(4, '0') +
                    "), e o conjunto B so transporta ASCII. O GS1-128 nao tem acento."
            )
        }

        // 128 e' o valor de paragem e nao pode estar nos dados - dava um codigo que
        // se desenhava e nao se lia.
        if (codigo == 128) {
            throw SimbologiaException(
                "GS1-128: o AI ($ai) tem um caracter de paragem nos dados"
            )
        }

        return codigo - 32
    }

    /**
     * Separa o texto nos campos, e valida cada um contra a tabela de AIs.
     *
     * E' aqui que a tabela de 541 AIs paga. Sem ela o encoder teria de adivinhar o
     * comprimento de cada campo, e adivinhar mal significa que o campo seguinte e'
     * lido a partir do meio do anterior.
     *
     * A forma humana da GS1 nao tem separadores: os campos estao separados por
     * parenteses. O FNC1 so existe na forma de maquina, e e' o encoder que o poe.
     */
    internal fun analisar(texto: String): List<CodigoGs1.Campo> {
        val campos = ArrayList<CodigoGs1.Campo>()
        val fonte = texto.ifEmpty { "" }
        var i = 0

        while (i < fonte.length) {
            if (fonte[i] != '(') {
                throw SimbologiaException(
                    "GS1-128: esperava um \"(\" na posicao $i de \"$fonte\". A forma de " +
                        "leitura humana e' (01)04012345678901(10)LOTE-A1, com os AIs " +
                        "entre parenteses."
                )
            }

            /*
             * O AI tem dois, tres ou quatro digitos, e **nao se pode saber qual pelo
             * primeiro digito**: `3103` e' um AI de quatro, e `31` seria um de dois com
             * a posicao decimal implicita no ultimo digito. Le-se o numero todo e a
             * tabela diz onde acaba.
             */
            val fecho = fonte.indexOf(')', i)
            if (fecho < 0) {
                throw SimbologiaException(
                    "GS1-128: o \"(\" na posicao $i de \"$fonte\" nao fecha."
                )
            }

            val numero = fonte.substring(i + 1, fecho)
            if (!numero.all { it in '0'..'9' }) {
                throw SimbologiaException("GS1-128: o AI \"$numero\" nao e' so digitos.")
            }

            val encontrado = TabelasGs1.aiDe(numero)
                ?: throw SimbologiaException(
                    "GS1-128: o AI ($numero) nao existe. A tabela tem " +
                        "${TabelasGs1.AIS.size} AIs."
                )

            /*
             * O valor comeca logo a seguir ao `)`, e e' o comprimento que decide ate
             * onde vai. **E' a razao de a tabela trazer `fixo` e `maximo`.**
             *
             * O `resto` que o `aiDe` devolve e' o que sobrou do numero depois do AI
             * - o digito da posicao decimal implicita num `3103`. Faz parte do
             * valor, e por isso entra no campo antes dos caracteres.
             */
            val inicioValor = fecho + 1
            var conteudo: String
            val fim: Int

            if (encontrado.fixo != null) {
                // Comprimento fixo: o campo tem `fixo` caracteres, ponto final.
                fim = inicioValor + encontrado.fixo
                conteudo = recorta(fonte, inicioValor, fim)
            } else {
                /*
                 * Comprimento variavel: vai ate ao fim do texto ou ate ao proximo `(`.
                 *
                 * **O `(` e' que marca o fim, e nao um FNC1 na forma humana.** A
                 * primeira versao procurava um separador na forma humana, que nao
                 * existe, e cortava o valor no sitio errado.
                 */
                val proximo = fonte.indexOf('(', inicioValor)
                fim = if (proximo < 0) fonte.length else proximo
                conteudo = fonte.substring(inicioValor, fim)
            }

            val limpo = validar(encontrado, conteudo)

            campos.add(
                CodigoGs1.Campo(
                    ai = encontrado.numero,
                    valor = (encontrado.resto ?: "") + limpo,
                    conteudo = limpo,
                    separador = encontrado.separador,
                )
            )

            i = fim
        }

        if (campos.isEmpty()) {
            throw SimbologiaException(
                "GS1-128: o texto nao tem nenhum campo. Escreve (01)04012345678901."
            )
        }

        return campos
    }

    /**
     * `substring` que devolve `""` em vez de lancar.
     *
     * **Um valor fixo mais curto do que a tabela diz tem de recusar, e nao estourar
     * uma excepcao de indice.** A primeira versao chamava `substring(inicio, fim)` a
     * direito, e um `(01)` sem valor dava `StringIndexOutOfBoundsException` - que e'
     * uma excepcao da linguagem e nao uma recusa do encoder, e o teste que a
     * apanhava afirmava `SimbologiaException`.
     */
    private fun recorta(texto: String, inicio: Int, fim: Int): String =
        if (inicio >= texto.length) "" else texto.substring(inicio, minOf(fim, texto.length))

    /**
     * Confere o valor de um campo contra o que a GS1 diz dele.
     *
     * A expressao regular vem da propria GS1, e da tabela. E' mais forte do que
     * contar caracteres: `(\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01]))` para uma data
     * recusa `275630` - mes 56 - e o leitor do GS1 recusa tambem.
     *
     * **O `trim` e' o que torna a forma humana legivel.** A GS1 escreve os campos
     * com um espaco de cada lado nos exemplos - `(10) LOTE-A1` - e o espaco nao faz
     * parte do valor. Um `trim` sem isto recusa metade dos exemplos que a propria
     * GS1 escreve.
     *
     * **O regex e' ancorado, e ancorar e' o que impede que um valor mais longo
     * passe.** Sem `^` e `$` um regex nao ancorado aceita o valor se *contiver* um
     * match.
     */
    internal fun validar(ai: TabelasGs1.Ai, valor: String): String {
        val limpo = valor.trim()

        if (limpo.isEmpty()) {
            throw SimbologiaException("GS1-128: o AI (${ai.numero}) nao tem valor.")
        }

        /*
         * O comprimento fixo conferido, e **com os dois numeros na mensagem**.
         *
         * A versao que so tinha o `regex` dizia "nao corresponde ao que a GS1
         * define" - que e' verdade e nao ajuda ninguem: o utilizador tem um campo
         * de catorze e nao sabe qual. **Uma recusa sem numeros e' uma recusa com que
         * ninguem consegue corrigir o campo.**
         */
        if (ai.fixo != null && limpo.length != ai.fixo) {
            val unidade = if (ai.fixo == 1) "digito" else "digitos"
            throw SimbologiaException(
                "GS1-128: o AI (${ai.numero}) tem ${ai.fixo} $unidade fixos e o valor " +
                    "\"$limpo\" tem ${limpo.length}."
            )
        }

        /*
         * **O maximo e' a soma dos componentes, e nao o do ultimo.**
         *
         * A tabela so traz o do ultimo componente, que e' o que serve para
         * **dividir** o valor. Para **conferir** o numero certo e' a soma de todos: o
         * AI `253` e' `N3+N13[+X..17]`, o ultimo componente tem maximo 17 e um valor
         * valido pode ter trinta. **47 dos 541 AIs recusavam um valor que a GS1
         * aceita.**
         */
        val maximo = comprimentoTotal(ai)
        if (maximo != null && limpo.length > maximo) {
            throw SimbologiaException(
                "GS1-128: o AI (${ai.numero}) aceita no maximo $maximo caracteres e o " +
                    "valor \"$limpo\" tem ${limpo.length}."
            )
        }

        if (!Regex(ai.regex).matches(limpo)) {
            throw SimbologiaException(
                "GS1-128: o valor \"$limpo\" do AI (${ai.numero}) nao corresponde ao " +
                    "que a GS1 define. O formato e' ${ai.formato}."
            )
        }

        return limpo
    }

    /**
     * O comprimento maximo do valor de um AI, e nao o do ultimo componente.
     *
     * **A tabela so traz o do ultimo componente, e os dois numeros sao diferentes.**
     * E' o que serve para **dividir** o valor - o ultimo componente e' o que vai
     * ate ao fim do texto - e nao para o **conferir**: um AI de varios componentes
     * tem um valor que e' a soma deles.
     *
     * | AI | formato | ultimo | total |
     * |---|---|---|---|
     * | `253` | `N3+N13[+X..17]` | 17 | **30** |
     * | `421` | `N3+N3+X..9` | 9 | **12** |
     * | `8008` | `N4+N8[+N..4]` | 4 | **12** |
     *
     * **Sao 47 dos 541 AIs que tem mais de um componente**, e todos eles recusavam
     * um valor que a GS1 aceita. O sintoma e' o pior dos possiveis: quem escreve o
     * valor certo recebe um erro que fala de um comprimento que nao e' o do campo.
     *
     * **E' publico porque a interface e o teste precisam dele, e nao porque seja um
     * segredo.** Um `public` sem *chamador* seria um campo que ninguem sabe porque
     * existe.
     *
     * @return o comprimento maximo, ou `null` se o AI nao tem componente variavel
     */
    fun comprimentoTotal(ai: TabelasGs1.Ai): Int? {
        var soma = 0
        var temVariavel = false

        for (campo in ai.campos) {
            campo.fixo?.let { soma += it }
            campo.maximo?.let {
                soma += it
                temVariavel = true
            }
        }

        return if (temVariavel) soma else null
    }

    /**
     * A forma de maquina: os campos **sem parenteses**, com o separador no sitio
     * certo.
     *
     * **Sem os parenteses, e sem eles no [CodigoGs1.gs1].** Os parenteses sao a
     * notacao humana e o leitor nao os ve; os *digitos do AI* vao.
     *
     * O separador vai **depois** de um campo de comprimento variavel, e so se esse
     * campo nao for o ultimo. E' a mesma regra que o [gs1_128] usa ao montar os
     * codewords - **as duas tem de concordar**, e e' por isso que a lista se
     * percorre com o mesmo criterio nas duas.
     */
    internal fun maquina(campos: List<CodigoGs1.Campo>): String {
        val saida = StringBuilder()
        val ultimo = campos.size - 1

        for ((i, campo) in campos.withIndex()) {
            saida.append(campo.ai).append(campo.valor)
            if (campo.separador && i != ultimo) {
                saida.append(GS)
            }
        }

        return saida.toString()
    }

    /**
     * A forma humana, com os AIs entre parenteses e **sem** separador.
     *
     * **E' a mesma cadeia que o [CodigoGs1.gs1], e nao uma segunda forma.** O nome
     * `gs1` e' o nome da notacao e `legenda` e' o nome do campo que o desenho
     * imprime; a cadeia e' uma so, e a paridade mede os dois para saber que nao
     * divergiram.
     *
     * A primeira versao punha um separador entre os campos, e foi o separador a mais
     * que fez o `descodificar` falhar em seis dos oito casos: o codigo continuava a
     * ler bem e a falha era so na comparacao.
     */
    internal fun legivel(campos: List<CodigoGs1.Campo>): String {
        val saida = StringBuilder()
        for (campo in campos) {
            saida.append('(').append(campo.ai).append(')').append(campo.valor)
        }
        return saida.toString()
    }
}
