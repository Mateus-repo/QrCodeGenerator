package com.qrcodegen.core

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.Result
import com.google.zxing.ResultMetadataType
import com.google.zxing.common.HybridBinarizer
import com.qrcodegen.core.simbologias.CodigoGs1
import com.qrcodegen.core.simbologias.Code128
import com.qrcodegen.core.simbologias.Gs1_128
import com.qrcodegen.core.simbologias.SimbologiaException
import com.qrcodegen.core.simbologias.TabelasGs1
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import java.awt.Color
import java.awt.image.BufferedImage
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Nivel 2 do GS1-128 em Kotlin: **o Kotlin desenha e o ZXing le**.
 *
 * **E' uma classe a parte, e nao mais um `@Nested` dentro de [SimbologiasTestes].**
 * Nao e' por ser mais codigo: e' porque um codigo de barras de uma linha desenha-se
 * com guardas e uma altura de 60 modulos, e o `ler()` de `SimbologiasTestes` esta' a
 * fazer isso.
 *
 * **E' o que [SimbologiasTestes] ensina, repetido:** um encoder so entra no
 * repositorio depois de o ZXing devolver a cadeia certa. Nao ha "quase" — na fase dos
 * codigos de barras, quatro encoders pareceram certos durante a escrita e nao eram.
 *
 * ## `DynamicTest` e nao `ParameterizedTest`
 *
 * **O `junit-jupiter-params` nao esta' no classpath do `:core`,** e
 * `@ParameterizedTest` da `Unresolved reference 'params'` — que e' o melhor dos
 * erros, porque fala do simbolo. O [DataMatrixTestes] ja sabia disto e usa
 * `@TestFactory` com `DynamicTest`; este ficheiro faz o mesmo, e **a forma de um
 * teste segue o que a stack tem**, como a `AGENTS.md` diz.
 *
 * ## As tres representacoes, e o que cada leitor devolve
 *
 *  - [CodigoGs1.payload] — a forma de maquina, com o `0x1D` onde o encoder pôs o
 *    separador. **E' esta a que o `zxingcpp` de Python devolve em `bytes`.**
 *  - [CodigoGs1.legenda] — a forma humana entre parenteses. **E' a que o
 *    `zxingcpp` devolve em `text`.**
 *  - o `]C1`, que e' a unica coisa que distingue um GS1-128 de um Code 128 com os
 *    mesmos caracteres.
 *
 * **O ZXing em Java nao devolve nenhum dos dois como o `zxingcpp` devolve.** O
 * `getRawBytes()` dele sao os **codewords**, e o `getText()` e' o payload **sem os
 * separadores** e sem parenteses. Sao leitores diferentes com o mesmo formato, e **um
 * teste escrito contra um esta errado contra o outro** — por isso que as afirmacoes
 * daqui sao diferentes das de Python e nao uma traducao delas.
 */
@DisplayName("GS1-128: o Kotlin desenha e o ZXing le")
class Gs1_128Testes {

    /**
     * Quantos pixele por modulo.
     *
     * **Tres, e nao um nem dois.** E' o minimo confiavel para leitores de 1D, e a dois
     * pixele ja falha em codigos com barras estreitas — que e' o que um GS1-128 e,
     * porque fica sempre no conjunto B.
     */
    private val escala = 3

    /** Altura em modulos. 1D nao tem altura na norma, mas tem altura minima em fisica. */
    private val altura = 60

    /** A zona muda, em modulos. A norma ISO/IEC 15420 pede dez. */
    private val zonaMuda = 10

    // --- os casos ---------------------------------------------------------------

    /**
     * Um caso: o nome que o teste dinamico mostra, e o texto.
     *
     * **Constroi-se a si proprio, e nao leva uma funcao para se construir.** Onze
     * sítios levavam `{ Gs1_128.gs1_128(it) }`, e o `it` nao existia — nao ha
     * parametro nenhum. E mesmo que existisse, **uma classe de caso que leva uma
     * funcao para se construir pode receber o texto errado sem ninguem ver**: o nome
     * diz uma coisa e a construcao faz outra, e a falha aparece na leitura com um
     * sintoma que aponta para o encoder.
     */
    private class Caso(val nome: String, texto: String) {
        /** O codigo, construido uma vez para os tres testes dinamicos o usarem. */
        val codigo: CodigoGs1 = Gs1_128.gs1_128(texto)
    }

    /** Uma recusa: o nome, o texto e a palavra que tem de estar na mensagem. */
    private class Recusa(val nome: String, val texto: String, val palavra: String)

    private val casos: List<Caso> = listOf(
        // --- o GTIN sozinho, que e' o caso mais comum numa caixa -------------
        Caso("o GTIN", "(01)04012345678901"),

        // --- o GTIN e um lote: aqui aparece o separador ---------------------
        Caso("GTIN e lote", "(01)04012345678901(10)LOTE-A1"),

        // --- tres campos, dois separadores: o do meio e' o que se conta -----
        Caso("lote no meio", "(01)04012345678901(10)LOTE-A1(17)270630"),

        // --- o `3103`, cujo ultimo digito e' a posicao decimal implicita ----
        Caso("peso com decimal", "(3103)000750"),

        // --- um AI fixo antes de um variavel -------------------------------
        Caso("peso e GTIN", "(3103)000750(01)04012345678901"),

        // --- SSCC de 18 digitos, o campo mais longo da tabela -------------
        Caso("SSCC", "(00)095060001343521234"),

        // --- duas datas ----------------------------------------------------
        Caso("datas", "(11)150327(17)270630"),

        // --- dois campos variaveis seguidos: o primeiro recebe separador ---
        Caso("dois variaveis", "(240)9501101530003(241)9501234567890"),

        // --- tres digitos e quatro lado a lado -----------------------------
        Caso("GLN, peso e lote", "(415)9501101530000(3103)000750(10)LOTE-A1"),

        // --- um AI de **varios componentes**, com o valor mais longo -------
        // (253) e' `N3+N13[+X..17]`: o ultimo componente tem maximo 17 e um valor
        // valido pode ter trinta. **E' o caso que apanha o `maximo` do ultimo em vez
        // da soma.**
        Caso("varios componentes", "(253)1234567890123ABCDEFGHIJKLMNOPQ"),

        // --- e um outro, com data e hora em vez de texto -------------------
        Caso("data e hora", "(8008)010203001234"),
    )

    private val recusas: List<Recusa> = listOf(
        // O GTIN com treze digitos: o AI 01 quer catorze.
        Recusa("o GTIN com treze", "(01)9501101530003", "13"),
        // O SSCC com catorze: o AI 00 quer dezoito.
        Recusa("o SSCC com catorze", "(00)09506000134352", "14"),
        // O mes 56, que o regex da GS1 recusa.
        Recusa("o mes 56", "(11)155630", "GS1"),
        // O dia 32.
        Recusa("o dia 32", "(11)150332", "GS1"),
        // Um AI de tres digitos que a GS1 nao publica — e o `999` **nao serviria**,
        // porque o `aiDe` devolve o `99`, que existe, com o `9` de resto.
        Recusa("um AI inexistente", "(888)ABC", "nao existe"),
        // O parenteses que nao fecha.
        Recusa("o parenteses aberto", "(01)04012345678901(10", "nao fecha"),
        // Sem parenteses.
        Recusa("sem parenteses", "0104012345678901", "("),
        // O AI com letras.
        Recusa("o AI com letras", "(AB)1234", "digitos"),
        // O campo sem valor.
        Recusa("o campo vazio", "(01)", "valor"),
        // O texto vazio.
        Recusa("o texto vazio", "", "campo"),
        // **O acento e' recusado pelo regex da GS1, e nao pela ASCII.** Uma mensagem
        // a dizer `ASCII` seria mentira, porque o encoder nunca chega a validacao do
        // Code 128.
        Recusa("o acento", "(10)LOTE-Á1", "GS1"),
    )

    // --- nivel 2: o ZXing le ---------------------------------------------------

    @TestFactory
    @DisplayName("o ZXing le o payload, com os separadores a menos")
    fun oZxingLeOPayload(): List<DynamicTest> = casos.map { caso ->
        DynamicTest.dynamicTest(caso.nome) {
            val codigo = caso.codigo
            val resultado = descodificar(codigo)

            /*
             * **O `getText()` do ZXing em Java e' o payload sem os separadores, e nao
             * a forma humana.** O `zxingcpp` de Python devolve os AIs entre parenteses
             * no `text` e o payload com o `0x1D` no `bytes`; o ZXing em Java nao tem
             * forma humana nenhuma e come os separadores.
             *
             * **Os dois leitores nao concordam sobre o mesmo formato**, que e' a razao
             * de as afirmacoes de Kotlin nao serem a traducao das de Python.
             */
            val semSeparadores = codigo.payload.replace(Gs1_128.GS.toString(), "")

            assertEquals(semSeparadores, resultado.text)
        }
    }

    @TestFactory
    @DisplayName("o ZXing viu exactamente os FNC1 que o encoder emitiu")
    fun oZxingViuOsFnc1(): List<DynamicTest> = casos.map { caso ->
        DynamicTest.dynamicTest(caso.nome) {
            val codigo = caso.codigo
            val resultado = descodificar(codigo)

            /*
             * **`getRawBytes()` do ZXing em Java devolve os CODEWORDS, nao os
             * caracteres.** E' o mesmo comportamento do Data Matrix — e por isso que o
             * `DataMatrixTestes` compara por ai. **Para o Code 128 nao sao os
             * caracteres**, e comparar por ai daria "expected 16 but was 20" em todos
             * os casos.
             *
             * **Contar os 102 e' o que confirma o FNC1 dos dois lados**: o encoder diz
             * que os emitiu e o leitor diz que os viu. Um separador a mais daria um 102
             * a mais, e o numero de modulos nao daria conta — porque o GS1-128 e o
             * Code 128 dao treze codewords nos dois com o mesmo texto.
             */
            val vistos = resultado.rawBytes.count { (it.toInt() and 0xFF) == Gs1_128.FNC1 }

            assertEquals(codigo.separadores, vistos)
        }
    }

    @TestFactory
    @DisplayName("o ZXing diz ]C1, e nao ]C0")
    fun oZxingDizQueEUmGs1(): List<DynamicTest> = casos.map { caso ->
        DynamicTest.dynamicTest(caso.nome) {
            val resultado = descodificar(caso.codigo)

            /*
             * **`]C1` e' a unica coisa que distingue um GS1-128 de um Code 128** com os
             * mesmos caracteres.
             *
             * **E nao se poe o `ASSUME_GS1`.** O `DecodeHintType` tem um `ASSUME_GS1`
             * que diz ao leitor para *assumir* que o codigo e' GS1; o que se quer aqui
             * e' que ele diga que e' GS1 **sem ninguem lhe dizer**. Com a dica o teste
             * passaria mesmo sem o FNC1 no inicio — que e' exactamente o que o teste
             * tem de apanhar.
             */
            assertEquals("]C1", identificador(resultado))
        }
    }

    @Test
    @DisplayName("o ZXing classifica como Code 128, que e' o que o GS1-128 e")
    fun oZxingDizCode128() {
        // **Nao ha um formato "GS1" no ZXing.** O GS1-128 e' um Code 128 com FNC1 e o
        // leitor classifica-o pelo codigo — e dizer `GS1` aqui seria estar a afirmar
        // uma coisa que o leitor nao sabe.
        val resultado = descodificar(Gs1_128.gs1_128("(01)04012345678901"))

        assertEquals(BarcodeFormat.CODE_128, resultado.barcodeFormat)
    }

    // --- a contagem de FNC1, que e' o que apanha um separador a mais -----------

    @Test
    @DisplayName("o numero de FNC1 bate com os que a GS1 manda")
    fun oNumeroDeFnc1() {
        // **O GTIN e' fixo e o lote vai no fim: nenhum separador, so o do inicio.**
        assertEquals(1, Gs1_128.gs1_128("(01)04012345678901").separadores)
        assertEquals(1, Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1").separadores)

        // **Com um campo no meio, ha um separador a mais.** A regra "menos no ultimo"
        // e' da propria GS1: um separador no fim nao separa de nada, e o leitor conta-o
        // como parte do campo seguinte.
        assertEquals(
            2,
            Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1(17)270630").separadores,
        )
        assertEquals(
            2,
            Gs1_128.gs1_128("(240)9501101530003(241)9501234567890").separadores,
        )
    }

    @Test
    @DisplayName("o payload nao tem parenteses, e a legenda nao tem separador")
    fun asDuasFormasNaoSeConfundem() {
        val codigo = Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1(17)270630")

        // **Os parenteses vao para a legenda e nao para o payload.** E' a confusao que
        // custou o primeiro encoder: em `(10)LOTE-A1` os parenteses sao para quem le, e
        // nao vao para o codigo — mas os **digitos do AI vao**.
        assertTrue(!codigo.payload.contains('('), "o payload nao tem parenteses")
        assertTrue(codigo.payload.contains(Gs1_128.GS), "o payload tem o separador")

        // **E o separador nao vao para a legenda.** A GS1 pede que a linha impressa
        // tenha os AIs entre parenteses e nenhum separador.
        assertTrue(!codigo.legenda.contains(Gs1_128.GS), "a legenda nao tem separador")
        assertEquals("(01)04012345678901(10)LOTE-A1(17)270630", codigo.legenda)

        // E `gs1` e `legenda` sao a mesma cadeia: nao e' redundancia, e' o nome da
        // notacao e o nome do campo que o desenho imprime.
        assertEquals(codigo.legenda, codigo.gs1)
    }

    @Test
    @DisplayName("os digitos do AI vao no codigo de barras")
    fun osDigitosDoAiVaoNoCodigo() {
        /*
         * **Os digitos do AI vao no codigo de barras, sem parenteses.**
         *
         * A primeira versao emitia so `campo.valor` e o AI ficava de fora. O resultado
         * eram 17 codewords em vez de 20, o ZXing nao lia nada, e a razao nao era
         * visivel no codigo.
         */
        val codigo = Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1")

        assertTrue(codigo.payload.startsWith("0104012345678901"))
        assertTrue(codigo.payload.contains("10LOTE-A1"), "o payload tem de ter o AI do lote")
    }

    // --- o `resto` do AI -------------------------------------------------------

    @Test
    @DisplayName("o resto do AI vai para o valor, e nenhum AI da GS1 o produz")
    fun oRestoVaiParaOValor() {
        /*
         * **Nenhum AI e' prefixo de outro na GS1 hoje**, e o
         * `gs1-tabelas-paridade.test.mjs` confirma isso — por isso que `resto` nunca e'
         * preenchido por um AI real e o ramo nao tem caso na tabela.
         *
         * **O `AIS` e' um `mapOf` e nao se altera.** Um teste que injectasse um `31`
         * ao lado do `3103` para ter `resto` teria de tornar a tabela mutavel, e **virar
         * a tabela mutavel por causa de um teste seria tornar o encoder pior para o
         * unico uso que nao existe**. Em Java a correccao foi uma sobrecarga do `aiDe`
         * que recebe a tabela; aqui nao ha `resto` para exercitar, e a razao esta
         * escrita.
         */
        val achado = TabelasGs1.aiDe("3103")

        assertNotEquals(null, achado)
        assertEquals("3103", achado!!.numero)
        assertEquals(null, achado.resto)
    }

    // --- o comprimento de um AI com varios componentes -------------------------

    @Test
    @DisplayName("um AI de varios componentes aceita o valor no maximo")
    fun umAiDeVariosComponentesAceitaOValorNoMaximo() {
        /*
         * **O `maximo` da tabela e' o do ULTIMO componente, e serve para DIVIDIR o
         * valor** — o que vai ate ao fim. Para CONFERIR o numero certo e' a soma de
         * todos: o AI `253` e' `N3+N13[+X..17]`, o ultimo tem maximo 17 e um valor
         * valido pode ter trinta.
         *
         * **Os valores sao construidos a partir do `maximo` da tabela, e nao escritos a
         * mao.** O `7030` e' `N4+N3+X..27` e o total e' 30, e o valor escrito a mao
         * tinha 29 — o teste falhava porque acrescentar um caracter dava exactamente
         * 30. **Um teste com o numero escrito a mao passa com o numero errado.**
         */
        for (ai in listOf("253", "421", "8008", "3910", "7030")) {
            val entrada = TabelasGs1.AIS[ai]!!
            val maximo = Gs1_128.comprimentoTotal(entrada)

            assertNotEquals(null, maximo, "o AI $ai devia ter um maximo")

            val valor = valorNoMaximo(entrada, maximo!!)

            val codigo = Gs1_128.gs1_128("($ai)$valor")

            assertEquals(ai + valor, codigo.payload, "o AI $ai devia aceitar $maximo caracteres")

            // E um a mais recusa, com o comprimento na mensagem.
            val erro = assertFailsWith<SimbologiaException> { Gs1_128.gs1_128("($ai)${valor}0") }

            assertContains(erro.message!!, (maximo + 1).toString())
        }
    }

    /**
     * Um valor de exactamente `maximo` caracteres que o `regex` do AI aceita.
     *
     * **Um valor repetido pode nao caber no `regex`.** O `3910` e' `N4+N3+N..15` e o
     * `regex` e' `(\d{3})(\d{1,15})`: os tres digitos do meio e ate quinze a seguir.
     * Dezassete digitos cabem, dezoito nao.
     *
     * **A semente `010101000000` da um mes `01`, um dia `01` e uma hora `01`, e casa
     * com o `8008`.** `1234567890` repetido nunca casa, porque `34` nao e' um mes nem
     * um dia — e um gerador de valores que so sabe fazer digitos falha nos AIs que tem
     * uma forma.
     */
    private fun valorNoMaximo(entrada: TabelasGs1.Ai, maximo: Int): String {
        val padrao = Regex(entrada.regex)

        for (modelo in listOf("1234567890", "010101000000", "01", "A", "ABCDEFGHIJ")) {
            val valor = buildString {
                while (length < maximo) {
                    append(modelo[length % modelo.length])
                }
            }
            if (padrao.matches(valor)) {
                return valor
            }
        }

        throw AssertionError("nao se encontrou um valor de $maximo caracteres que o " +
            "regex aceite: ${entrada.regex}")
    }

    // --- o `regex` ancorado, e o que ele de facto faz -------------------------

    @Test
    @DisplayName("o regex ancorado e' defensivo, e o teste diz isso")
    fun oRegexAncoradoEDefensivo() {
        /*
         * **O `matches` e' redundante hoje, e o teste tem de dizer isso em vez de
         * fingir o contrario.** Reintroduzi `containsMatchIn` em vez de `matches` e a
         * suite passou: com a validacao do comprimento a frente, **e' o comprimento
         * que apanha**, e o `regex` so apanha o que o comprimento nao apanha.
         *
         * **O que se afirma e' a propriedade verificada**: para cada valor que o
         * `containsMatchIn` aceita e o `matches` recusa, o `validar` recusa. E' essa a
         * propriedade que torna o `matches` redundante, e e' ela que deixa de ser
         * verdadeira se o comprimento mudar.
         *
         * **Os valores sao a mesma lista do Python**, porque a lista e' o que se mede e
         * nao o que se imagina — e a lista vem do `AGENTS.md`: um caso por ramo da
         * logica, e nao um caminho feliz.
         */
        val valores = listOf(
            "1", "12", "123", "1234", "12345", "123456", "1234567",
            "A", "AB", "ABC", "ABCDEFGH",
            "1234567890123ABC", "12345678901234567", "1234567890123ABCDEFGHIJ",
            "0ABC", "ABC0", "ABC-1",
        )

        val soOAncorado = mutableListOf<String>()

        for ((numero, entrada) in TabelasGs1.AIS) {
            val regex = Regex(entrada.regex)

            for (valor in valores) {
                if (regex.containsMatchIn(valor) && !regex.matches(valor)) {
                    // **Pergunta-se ao `validar`, e nao a uma copia da regra dele.**
                    // Copiar a regra para o teste e' escrever um teste que passa com
                    // o encoder errado — que e' o que a `AGENTS.md` chama um teste
                    // que nao afirma nada.
                    try {
                        Gs1_128.validar(TabelasGs1.aiDe(numero)!!, valor)
                        soOAncorado.add("$numero com \"$valor\"")
                    } catch (e: SimbologiaException) {
                        // O `validar` recusa: o `matches` e' mesmo redundante.
                    }
                }
            }
        }

        assertTrue(
            soOAncorado.isEmpty(),
            "ha ${soOAncorado.size} valores que o `containsMatchIn` aceita e o " +
                "`matches` recusa, e que o comprimento **nao** apanha: " +
                soOAncorado.take(5) + ". O `matches` deixou de ser redundante e " +
                "a validacao ficou com uma linha a mais que ninguem sabe porque existe.",
        )
    }
    // --- as recusas ------------------------------------------------------------

    @TestFactory
    @DisplayName("cada recusa diz porque")
    fun cadaRecusaDizPorque(): List<DynamicTest> = recusas.map { recusa ->
        DynamicTest.dynamicTest(recusa.nome) {
            /*
             * **`assertFailsWith` sem mais passa com qualquer excecao**, incluindo uma
             * que nao seja a do encoder. A palavra na mensagem e' o que diz que foi a
             * validacao do AI a recusar e nao outra coisa.
             */
            val erro = assertFailsWith<SimbologiaException> { Gs1_128.gs1_128(recusa.texto) }

            assertContains(erro.message!!, recusa.palavra)
        }
    }

    @Test
    @DisplayName("o comprimento fixo e' conferido, com os dois numeros")
    fun oComprimentoFixoEConferido() {
        /*
         * **Uma recusa sem numeros e' uma recusa com que ninguem consegue corrigir o
         * campo.** O `regex` sozinho recusava, mas dizia "nao corresponde ao que a GS1
         * define", que e' verdade e nao ajuda ninguem.
         */
        val erro = assertFailsWith<SimbologiaException> { Gs1_128.gs1_128("(01)9501101530003") }
        val mensagem = erro.message!!

        assertContains(mensagem, "14")
        assertContains(mensagem, "13")
    }

    // --- o registo --------------------------------------------------------------

    @Test
    @DisplayName("o GS1-128 e' um codigo de barras, e tem o desenho do Code 128")
    fun eUmCodigoDeBarras() {
        /*
         * **Um GS1-128 nao tem desenho proprio**: tem o desenho do Code 128 com mais
         * uns codewords. E a razao de `codigo()` existir — e de ser uma convenience e
         * nao o formato do codigo.
         */
        val gs1 = Gs1_128.gs1_128("(10)LOTE-A1")
        val codigo = gs1.codigo()

        assertEquals("GS1-128", codigo.simbologia)
        assertEquals(gs1.legenda, codigo.legenda)
        assertTrue(codigo.guardas.isEmpty(), "o GS1-128 nao tem guardas, como o Code 128")

        // **E o Code 128 do mesmo texto, forcado ao conjunto B, tem onze modulos a
        // menos** — que e' um codeword, o do FNC1 do inicio.
        val forcado = Code128.code128("10LOTE-A1", 2)

        assertEquals(11, gs1.modulos.size - forcado.modulos.size)
    }

    // --- a leitura -------------------------------------------------------------

    /**
     * O identificador de simbologia, como `]C1` ou `]C0`.
     *
     * **E' um metodo proprio porque o acesso e' aonde a diferenca esta'.** O ZXing em
     * Java expoe-o pelo `getResultMetadata()` e o `zxingcpp` por um metodo com nome
     * proprio. **Um `]C0` quando nao devia, ou um `null` quando o leitor nao disse
     * nada, sao coisas diferentes e o teste tem de as distinguir.**
     */
    private fun identificador(resultado: Result): String {
        val valor = resultado.resultMetadata[ResultMetadataType.SYMBOLOGY_IDENTIFIER]
        return valor?.toString() ?: "<nenhum>"
    }

    /**
     * Desenho o codigo de barras e le-o com o ZXing.
     *
     * **O fundo branco e' o explicitado.** Um `TYPE_INT_RGB` novo e' preto, e barras
     * pretas sobre preto nao se leem.
     */
    private fun descodificar(codigo: CodigoGs1): Result {
        val modulos = codigo.modulos
        val largura = (modulos.size + zonaMuda * 2) * escala
        val alturaPx = altura * escala

        val imagem = BufferedImage(largura, alturaPx, BufferedImage.TYPE_INT_RGB)

        for (x in 0 until largura) {
            for (y in 0 until alturaPx) {
                imagem.setRGB(x, y, Color.WHITE.rgb)
            }
        }

        for (i in modulos.indices) {
            if (!modulos[i]) {
                continue
            }
            val x0 = (i + zonaMuda) * escala
            for (dx in 0 until escala) {
                for (dy in 0 until alturaPx) {
                    imagem.setRGB(x0 + dx, dy, Color.BLACK.rgb)
                }
            }
        }

        return try {
            val bitmap = BinaryBitmap(HybridBinarizer(ImagemLuminance(imagem)))

            val hints = mapOf<DecodeHintType, Any>(DecodeHintType.TRY_HARDER to true)

            MultiFormatReader().decode(bitmap, hints)
        } catch (e: Exception) {
            throw AssertionError("Falha ao descodificar com o ZXing: ${e.message}", e)
        }
    }
}
