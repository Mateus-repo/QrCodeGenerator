package com.qrcodegen.core.simbologias

/**
 * Os codigos de barras de uma linha que nao precisam de escolher conjuntos:
 * Code 39, ITF, ITF-14 e Codabar.
 *
 * ## As tres regras que este ficheiro repete, e que ja custaram bugs
 *
 * **A largura decide-se pela letra, e nao pela caixa.** `W` e `w` sao largos,
 * `N` e `n` sao estreitos, e a caixa existia so por legibilidade. A versao
 * anterior em Java decidia pela caixa e dava ao ITF uma moldura de inicio com
 * barras largas onde o formato nao tem nenhuma: 45 modulos a mais num ITF-14 de
 * 14 digitos, e a moldura de paragem errada pelo mesmo motivo.
 *
 * **As guardas medem-se, e nao se contam.** Um elemento nao e' um modulo, e a
 * conta antiga do Codabar — `len(moldura) * largo` — assumia que todos os
 * elementos da moldura eram largos. A moldura do inicio ocupa 23 modulos e a
 * conta dava 35, e as 12 colunas a mais eram do primeiro caractere de dados.
 *
 * **O digito de controlo do Code 39 e' o resto da divisao por 43**, e nao a letra
 * que torna a soma multipla de 43. A documentacao do ZPL da Zebra da o exemplo:
 * `12345ABCDE/` soma 115, `115 / 43 = 2` com resto 29, e 29 e' a letra `T`. Um
 * comentario neste repositorio dizia a regra complementar, e quase became um
 * bug em tres stacks.
 *
 * ## O que o Kotlin faz e o Java nao, e trava a traducao
 *
 * **O `Char` nao e' promovido a `Int`.** `digitos[i] - '0'` compila em Java, onde
 * os dois lados vao a `int`, e nao compila aqui. O mesmo para indexar uma cadeia
 * com um `Char`. **E' `.code`, e e' o que a maior parte dos ports tropeca.**
 *
 * **`map` da o elemento e nao o indice.** `elementos.map { i -> elementos[i] }`
 * indexa a cadeia com o proprio elemento, e o erro e' de tipo e nao de semantica.
 * Para os dois e' `mapIndexed`.
 *
 * Nenhum dos dois aparece num teste de paridade: **nao chega a compilar.** E o que
 * o compilador e' o leitor mais barato que existe.
 *
 * ## A API e' nao-nula, e isso e' uma diferenca de comportamento
 *
 * **Nao ha guarda de `null` em nenhum encoder, porque o tipo ja a garante.** Em Java
 * o `valor` pode ser `null` e o codigo faz `valor == null ? "" : valor`, e o mesmo
 * em Python com `valor or ""` — as linguagens nao tem tipos nao-nulos e a guarda
 * tem de ser escrita.
 *
 * **Aqui `code39(null)` nao compila, em vez de dar "o texto esta vazio".** E e'
 * melhor, e nao uma quebra de paridade: o erro aparece no sitio onde se chama em
 * vez de nove camadas abaixo, e o `SimbologiaException` continua a existir para o
 * que e' um erro de uso a serio — texto vazio, digito a mais, moldura que nao
 * existe.
 */
object Lineares {

    /** O Code 39: estreito 1, largo 3. */
    private const val CODE39_ESPACO = 1

    /** O ITF: estreito 1, largo 2 — e nao 3, como o Code 39. */
    private val ITF_LARGURA = mapOf("N" to 1, "n" to 1, "W" to 2, "w" to 2)

    /**
     * As medidas do Codabar nas duas variantes de espacado.
     *
     * **Estreito 2, largo 5 — e nao 3:1, que tem o aspecto certo e nao le.**
     * O `espaco` e' o intervalo entre caracteres, e a variante larga usa 3 em
     * vez de 2.
     */
    private val CODABAR_NORMAL = CodabarMedidas(estreito = 2, largo = 5, espaco = 2)
    private val CODABAR_LARGO = CodabarMedidas(estreito = 2, largo = 5, espaco = 3)

    /** As medidas do Codabar, e o que muda entre as duas variantes. */
    private data class CodabarMedidas(
        val estreito: Int,
        val largo: Int,
        val espaco: Int,
    )

    // --- o que as quatro coisas partilham -----------------------------------

    // --- Code 39 -------------------------------------------------------------

    /** O indice de cada letra do Code 39 no alfabeto. */
    private val COD39_INDICE: Map<Char, Int> =
        Tabelas.COD39_ALFABETO.withIndex().associate { (i, c) -> c to i }

    /**
     * Code 39.
     *
     * @param comControlo acrescenta o digito mod 43 no fim
     */
    @JvmStatic
    fun code39(valor: String, comControlo: Boolean = true): CodigoDeBarras {
        val texto = valor.uppercase()

        if (texto.isEmpty()) {
            throw SimbologiaException("Code 39: o texto esta vazio.")
        }

        if (texto.contains('*')) {
            throw SimbologiaException(
                "Code 39: o asterisco e' o caracter de inicio e de paragem, e nao " +
                    "pode estar nos dados. O encoder poe-o nas duas pontas, por isso " +
                    "nao faz falta escreve-lo."
            )
        }

        for (c in texto) {
            if (!COD39_INDICE.containsKey(c)) {
                throw SimbologiaException(
                    "Code 39: o caracter '$c' nao existe neste formato (sao " +
                        Tabelas.COD39_ALFABETO + ")"
                )
            }
        }

        var dados = texto
        if (comControlo) {
            val soma = texto.sumOf { COD39_INDICE.getValue(it) }
            dados = texto + Tabelas.COD39_ALFABETO[soma % 43]
        }

        val modulos = ArrayList<Boolean>()
        val guardas = ArrayList<Int>()

        // **A moldura de inicio, e o separador atras dela.** A moldura acaba em
        // barra e o primeiro caractere de dados comeca em barra; sem este
        // espaco as duas fundem-se numa barra larga a mais, e o codigo tem o
        // aspecto certo e nao le.
        acrescentarComGuarda(modulos, guardas, moldura39())
        modulos.addAll(List(CODE39_ESPACO) { false })

        for (c in dados) {
            modulos.addAll(Tabelas.COD39_PADROES[COD39_INDICE.getValue(c)].map { it == '1' })
            modulos.addAll(List(CODE39_ESPACO) { false })
        }

        // **A moldura de paragem nao tem separador atras**, e a razao e' a mesma
        // de nao ter nada a separar: e' a ultima coisa do codigo.
        acrescentarComGuarda(modulos, guardas, moldura39())

        return CodigoDeBarras(
            "Code 39", modulos.toBooleanArray(), guardas.toIntArray(), dados
        )
    }

    /** O asterisco de inicio e de paragem, em modulos. */
    private fun moldura39(): List<Boolean> =
        Tabelas.COD39_PARAGEM.map { it == '1' }

    // --- ITF -----------------------------------------------------------------

    /**
     * ITF, so com digitos e sempre em numero par.
     *
     * **Os digitos leem-se aos pares**, e e' por isso que o numero tem de ser
     * par: um digito isolado nao tem par com quem ler.
     *
     * **Sem separador entre os pares**, ao contrario do Code 39 e do Codabar. A
     * intercalacao termina no elemento 4 do segundo digito, que e' desenhado
     * como espaco, e o par seguinte comeca em barra. Acrescentar o separador do
     * outro formato junta dois espacos num so e desloca todos os digitos.
     */
    @JvmStatic
    fun itf(valor: String): CodigoDeBarras {
        val digitos = limparDigitos(valor, "ITF")

        if (digitos.length % 2 != 0) {
            throw SimbologiaException(
                "ITF: ${digitos.length} digitos, e o formato le-os aos pares. " +
                    "Faltou um digito. Se o numero e' fixo, use ITF-14, que " +
                    "acrescenta o digito de controlo que falta."
            )
        }

        return _itf(digitos)
    }

    /**
     * ITF-14: treze digitos de dados mais um de controlo, sempre catorze.
     *
     * **A direccao dos pesos nao se nota aqui, e vale a pena dizer porquê.** A
     * GS1 pesa o GTIN-14 com 3, 1, 3, 1 a partir da esquerda, e o EAN pesa a
     * partir da direita. Com treze digitos — e o ITF-14 tem sempre treze — as
     * duas direccoes dao a mesma soma, porque com um numero impar as duas
     * comecam com o peso 3.
     */
    @JvmStatic
    fun itf14(valor: String): CodigoDeBarras {
        val digitos = limparDigitos(valor, "ITF-14")

        if (digitos.length != 13) {
            throw SimbologiaException(
                "ITF-14: espera 13 digitos de dados, recebeu ${digitos.length}. " +
                    "O ultimo, o digito de controlo, calcula-se sozinho."
            )
        }

        var soma = 0
        for (i in 0 until 13) {
            soma += (digitos[i] - '0') * if (i % 2 == 0) 3 else 1
        }
        val controlo = (10 - (soma % 10)) % 10

        return _itf(digitos + controlo)
    }

    private fun _itf(digitos: String): CodigoDeBarras {
        val modulos = ArrayList<Boolean>()
        val guardas = ArrayList<Int>()

        // **A moldura de inicio mede-se, e nao se conta**: aqui os quatro
        // elementos sao estreitos e a conta antiga acertava por acaso, mas a
        // moldura de paragem mais abaixo tem 3 elementos e 4 modulos, e ai nao
        // acertava.
        acrescentarComGuarda(modulos, guardas, modulosDe(Tabelas.ITF_INICIO))

        var i = 0
        while (i < digitos.length) {
            val barras = Tabelas.ITF_PADROES[digitos[i] - '0']
            val espacos = Tabelas.ITF_PADROES[digitos[i + 1] - '0']

            // **A intercalacao.** As larguras do primeiro digito vao nas barras,
            // as do segundo nos espacos, elemento a elemento. E' o "interleaved"
            // que da o nome ao formato: um par de digitos ocupa as mesmas cinco
            // posicoes que um digito so.
            for (e in 0 until 5) {
                repeat(ITF_LARGURA.getValue(barras[e].toString())) { modulos.add(true) }
                repeat(ITF_LARGURA.getValue(espacos[e].toString())) { modulos.add(false) }
            }
            i += 2
        }

        // A moldura de paragem, com os seus **tres** elementos — e tambem guarda.
        acrescentarComGuarda(modulos, guardas, modulosDe(Tabelas.ITF_PARAGEM))

        return CodigoDeBarras("ITF", modulos.toBooleanArray(), guardas.toIntArray(), digitos)
    }

    // --- Codabar -------------------------------------------------------------

    /**
     * O Codabar.
     *
     * @param inicio `A`, `B`, `C` ou `D`
     * @param paragem `A`, `B`, `C` ou `D`
     * @param largo a variante de espacado largo, com tres modulos de intervalo
     */
    @JvmStatic
    @JvmOverloads
    fun codabar(
        valor: String,
        inicio: String = "A",
        paragem: String = "A",
        largo: Boolean = false,
    ): CodigoDeBarras {
        val dados = valor.uppercase()

        if (dados.isEmpty()) {
            throw SimbologiaException("Codabar: o texto esta vazio.")
        }

        for (par in listOf("inicio" to inicio, "paragem" to paragem)) {
            if (par.second.length != 1 || !isMoldura(par.second)) {
                throw SimbologiaException(
                    "Codabar: ${par.first} tem de ser A, B, C ou D, e recebeu " +
                        "'${par.second}'."
                )
            }
        }

        // **Os caracteres de moldura nao podem estar nos dados.** E' a mesma razao
        // pela qual eles sao opcoes: `A`, `B`, `C` e `D` so existem nas pontas, e
        // um `A` no meio do texto era codificado com a tabela de dados e o
        // leitor lia-o como moldura — o codigo passava a parte estrutural e
        // partia a meio.
        for (c in dados) {
            if (isMoldura(c.toString())) {
                throw SimbologiaException(
                    "Codabar: '$c' so pode ser inicio ou paragem, e nao um " +
                        "caractere de dados. Usa outro, ou tira-o do texto."
                )
            }
            if (Tabelas.codabar(c.toString()) == null) {
                throw SimbologiaException(
                    "Codabar: o caracter '$c' nao existe neste formato."
                )
            }
        }

        val medidas = if (largo) CODABAR_LARGO else CODABAR_NORMAL
        val modulos = ArrayList<Boolean>()
        val guardas = ArrayList<Int>()

        // A moldura de inicio. **A conta anterior era `len(moldura) * largo`**,
        // que assume que todos os elementos sao largos. Nao sao: a moldura do
        // `A` ocupa 23 modulos e a conta dava 35, e as 12 colunas a mais eram do
        // primeiro caractere de dados.
        acrescentarComGuarda(modulos, guardas, modulosDe(Tabelas.codabar(inicio)!!, medidas))
        modulos.addAll(List(medidas.espaco) { false })

        // Os dados, cada um seguido do seu intervalo — inclusive o ultimo, que e'
        // o que o separa da moldura de paragem.
        for (c in dados) {
            modulos.addAll(modulosDe(Tabelas.codabar(c.toString())!!, medidas))
            modulos.addAll(List(medidas.espaco) { false })
        }

        // A moldura de paragem, sem intervalo atras: e' a ultima coisa.
        acrescentarComGuarda(modulos, guardas, modulosDe(Tabelas.codabar(paragem)!!, medidas))

        return CodigoDeBarras(
            "Codabar", modulos.toBooleanArray(), guardas.toIntArray(),
            inicio + dados + paragem
        )
    }

    private fun isMoldura(caractere: String): Boolean =
        Tabelas.CODABAR_MOLDURA.containsKey(caractere)

    // --- o que os quatro partilham ------------------------------------------

    /**
     * Acrescenta uma moldura e marca **os modulos que ela ocupa** como guarda.
     *
     * **A guarda vai de onde a moldura comeca ate onde acaba, e isso sabe-se
     * porque se acabou de acrescentar.** Nao e' uma conta melhor que a antiga: e'
     * medir em vez de contar.
     */
    private fun acrescentarComGuarda(
        modulos: MutableList<Boolean>,
        guardas: MutableList<Int>,
        novos: List<Boolean>,
    ) {
        val inicio = modulos.size
        modulos.addAll(novos)
        for (i in inicio until modulos.size) {
            guardas.add(i)
        }
    }

    /** Converte `NnWw` em modulos, com as medidas do ITF. */
    private fun modulosDe(elementos: String): List<Boolean> =
        elementos.map { letra -> ITF_LARGURA.getValue(letra.toString()) }
            .flatMapIndexed { i, largura -> List(largura) { i % 2 == 0 } }

    /** Converte `NnWw` em modulos, com as medidas do Codabar. */
    private fun modulosDe(elementos: String, medidas: CodabarMedidas): List<Boolean> =
        elementos.map { letra -> larguraDe(letra.toString(), medidas) }
            .flatMapIndexed { i, largura -> List(largura) { i % 2 == 0 } }

    /**
     * A largura de um elemento, e decide-se pela letra.
     *
     * **`W` e `w` sao largos; `N` e `n` sao estreitos.** A versao anterior
     * decidia pela caixa e dava ao `n` a largura do `N` — e o ITF perdia o
     * espacado largo inteiro.
     */
    private fun larguraDe(letra: String, medidas: CodabarMedidas): Int =
        if (letra == "W" || letra == "w") medidas.largo else medidas.estreito

    /** So os digitos, sem o que o formato nao quer. */
    private fun limparDigitos(valor: String, nome: String): String {
        val saida = StringBuilder()
        for (c in valor) {
            if (c.isWhitespace() || c == '-') continue
            if (!c.isDigit()) {
                throw SimbologiaException("$nome: so aceita digitos, recebeu \"$valor\"")
            }
            saida.append(c)
        }

        if (saida.isEmpty()) {
            throw SimbologiaException("$nome: o texto esta vazio.")
        }

        return saida.toString()
    }
}
