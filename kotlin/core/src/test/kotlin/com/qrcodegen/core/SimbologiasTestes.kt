package com.qrcodegen.core

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.MultiFormatReader
import com.google.zxing.common.HybridBinarizer
import com.qrcodegen.core.simbologias.Code128
import com.qrcodegen.core.simbologias.Code93
import com.qrcodegen.core.simbologias.CodigoDeBarras
import com.qrcodegen.core.simbologias.Lineares
import com.qrcodegen.core.simbologias.SimbologiaException
import com.qrcodegen.core.simbologias.TabelasCode93
import org.junit.jupiter.api.Assertions.assertTrue as afirmar
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import java.awt.image.BufferedImage
import java.util.EnumMap
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Nivel 2 das simbologias: **o Kotlin desenha e o ZXing le**.
 *
 * **E' a mesma versao que a stack Java tem, e pelo mesmo motivo.** O `RenderTests`
 * desenha o QR com o ZXing e le-o com o ZXing, e o proprio ficheiro reconhece
 * que isso e' mais fraco: um erro comum aos dois passos passa despercebido. Aqui
 * **o codigo sob teste e' o que poe os modulos no papel**, e o ZXing limita-se a
 * ler.
 *
 * **Os testes de leitura nao escrevem nenhum digito de controlo a mao.** O Code
 * 39 e' testado sem ele, e o ITF-14 traz o valor que o leitor devolve. Um digito
 * escrito a mao seria uma segunda conta a validar ao lado da do encoder, e duas
 * contas que divergem dizem menos do que uma.
 *
 * **Testes dinamicos em vez de `@ParameterizedTest`, e nao por preferencia.**
 * O `junit-jupiter-params` seria uma dependencia nova para escrever quatro
 * listras de parametros, e este `core` nao tem nenhuma. `@TestFactory` esta no
 * `junit-jupiter-api`, que ja vem com o `kotlin-test`.
 */
class SimbologiasTestes {

    // --- leitura ------------------------------------------------------------

    @TestFactory
    fun `o Code 39 e' lido pelo ZXing`(): List<DynamicTest> =
        casos("Code 39", BarcodeFormat.CODE_39, listOf(
            "CODE-39" to { Lineares.code39("CODE-39", false) },
            "ABC123" to { Lineares.code39("ABC123", false) },
            "A$-/+%" to { Lineares.code39("A$-/+%", false) },
            "ESPACO AQUI" to { Lineares.code39("ESPACO AQUI", false) },
            "1234567890" to { Lineares.code39("1234567890", false) },
        ))

    @TestFactory
    fun `o ITF e' lido pelo ZXing`(): List<DynamicTest> =
        casos("ITF", BarcodeFormat.ITF, listOf(
            // **O ITF-14 traz o digito de controlo e o leitor devolve-o**, por isso
            // aqui a expectativa inclui-o.
            "12345678901286" to { Lineares.itf14("1234567890128") },
            "00012345678905" to { Lineares.itf14("0001234567890") },
            "123456" to { Lineares.itf("123456") },
            "00123456789012" to { Lineares.itf("00123456789012") },
        ))

    @TestFactory
    fun `o Codabar e' lido pelo ZXing`(): List<DynamicTest> =
        // **O ZXing devolve so os dados, sem os caracteres de moldura.** E' o
        // comportamento normalizado do leitor para o Codabar, e o
        // `spec/verificar-lineares.py` ja conta com ele. A moldura e' o que o
        // leitor usa para calibrar, nao parte do texto.
        casos("Codabar", BarcodeFormat.CODABAR, listOf(
            "123456" to { Lineares.codabar("123456") },
            "123456" to { Lineares.codabar("123456", "B", "B", false) },
            "12345" to { Lineares.codabar("12345", "D", "D", false) },
            "12-34\$56/78:+9.0" to { Lineares.codabar("12-34\$56/78:+9.0", "C", "C", false) },
            "123456" to { Lineares.codabar("123456", largo = true) },
        ))

    @TestFactory
    fun `o Code 128 e' lido pelo ZXing`(): List<DynamicTest> =
        casos("Code 128", BarcodeFormat.CODE_128, listOf(
            "Hi" to { Code128.code128("Hi") },
            "ABC123" to { Code128.code128("ABC123") },
            "12345678" to { Code128.code128("12345678") },
            "abc-123" to { Code128.code128("abc-123") },
            "Code 128" to { Code128.code128("Code 128") },
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ" to { Code128.code128("ABCDEFGHIJKLMNOPQRSTUVWXYZ") },
            "0123456789" to { Code128.code128("0123456789") },
            // **Os digitos seguidos sao o que obriga a comutar para o conjunto C.**
            // Sem os caracteres de comuta o codigo desenha-se perfeito e o ZXing
            // devolve `ABC,3` em vez de `ABC123`.
            "ABC12345678901234567890" to { Code128.code128("ABC12345678901234567890") },
        ))

    @TestFactory
    fun `o Code 93 e' lido pelo ZXing`(): List<DynamicTest> =
        casos("Code 93", BarcodeFormat.CODE_93, listOf(
            // **O ZXing devolve o texto sem os dois digitos de controlo**, porque
            // eles sao de controlo e nao fazem parte do dado — e e' por isso que a
            // expectativa e' o `valor` e nao a legenda.
            "ABC-1234" to { Code93.code93("ABC-1234") },
            "A" to { Code93.code93("A") },
            "999999999999999999999999999999" to { Code93.code93("999999999999999999999999999999") },
            "MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20" to
                { Code93.code93("MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20") },

            // **A minuscula e' o caso que prova a codificacao estendida.**
            // `teste-93` vai no codigo como `dTdEdSdTdE-93`, e sao quinze modulos
            // a mais do que uma cadeia de sete caracteres. **Um encoder que mande
            // as minusculas tal e qual falha aqui, e falha bem** — com um
            // comprimento diferente, que e' o erro de estrutura e nao o de dado.
            "teste-93" to { Code93.code93("teste-93") },
            "Teste93Minusculas" to { Code93.code93("Teste93Minusculas") },
            "ABC $/%+-." to { Code93.code93("ABC $/%+-.") },

            // **Os caracteres de controlo, que e' o que teria apanhado o bug do
            // web.** Vinte e quatro dos trinta e dois estavam errados e nao havia
            // um unico caso — a tabela estava errada e verificada ao mesmo tempo,
            // porque a verificacao nao a tocava.
            //
            // **Um caso por controlo critico, e nao os 32 em fila.** Um codigo
            // com os 32 nao tem texto visivel para comparar, e a falha seria "nao
            // leu nada" em vez de "leu `0` em vez de CR".
            "A\u0000B" to { Code93.code93("A\u0000B") },
            "A\u0007B" to { Code93.code93("A\u0007B") },
            "A\rB" to { Code93.code93("A\rB") },
            "A\u001bB" to { Code93.code93("A\u001bB") },
            "A\u001fB" to { Code93.code93("A\u001fB") },
            "A\u007fB" to { Code93.code93("A\u007fB") },
        ))

    private fun casos(
        nome: String,
        formato: BarcodeFormat,
        lista: List<Pair<String, () -> CodigoDeBarras>>,
    ): List<DynamicTest> = lista.map { (esperado, construcao) ->
        DynamicTest.dynamicTest("$nome: \"$esperado\"") {
            assertEquals(esperado, ler(construcao(), formato))
        }
    }

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

    @Test
    fun `a tabela do Code 93 tem 48 padroes e todos comecam em barra`() {
        // **O invariante de que o leitor depende.** O ZXing ancora cada caractere
        // na primeira barra, e um padrao que comece em espaco desenha-se bem e
        // **nao e' lido por nada**.
        //
        // **E o `spec/gerar-tabelas-code93.py` verifica o mesmo nos 48 valores**,
        // antes de os escrever. Aqui e' a segunda verificacao do mesmo invariante,
        // e nao e' redundancia: o gerador protege a tabela, e isto protege o
        // codigo de uma tabela que um dia chegue errada de outra fonte.
        assertEquals(48, TabelasCode93.PADROES.size)
        assertEquals(48, TabelasCode93.ALFABETO.length)
        assertEquals(128, TabelasCode93.CONTROLES.size)

        for (i in TabelasCode93.PADROES.indices) {
            val padrao = TabelasCode93.PADROES[i]
            afirmar(padrao in 0..0x1FF,
                "CODE93_PADROES[$i] = 0x${padrao.toString(16)} tem mais de nove bits")
            afirmar(padrao and 0x100 != 0,
                "CODE93_PADROES[$i] ('${TabelasCode93.ALFABETO[i]}') comeca em espaco, "
                    + "e o leitor precisa de uma barra para ancorar")
        }
    }

    @Test
    fun `o modulo do checksum do Code 93 e' 47 e nao 43`() {
        // **47 e nao 43**, porque contam o asterisco e os quatro de controle.
        assertEquals(47, TabelasCode93.MODULO_CHECKSUM)
        assertEquals(47, TabelasCode93.PADROES.size - 1)
        assertEquals(47, TabelasCode93.ASTERISCO)
        assertEquals('*', TabelasCode93.ALFABETO[TabelasCode93.ASTERISCO])
    }

    @Test
    fun `o peso dos digitos do Code 93 reinicia no indice vinte`() {
        // **O sintoma do que nao reinicia e' o mais enganador de todos os codigos
        // de barras**: o codigo desenha-se bem, o primeiro digito bate certo e o
        // segundo nao, e o leitor recusa por checksum **sem dizer qual dos dois**.
        //
        // **O teste refaz a conta, e nao le o resultado.** Cortar a legenda com
        // uma conclusao em cima e' um teste que parece medir o peso e nao mede
        // nada — e nao ha como o distinguir de um bom a ler.
        //
        // **E o texto tem de tornar a diferenca visivel.** As cinco letras estao
        // no **inicio** da cadeia porque o checksum le de tras para a frente, e
        // com vinte e cinco caracteres o primeiro e' o de peso 21. Um `0` no
        // indice 0 da tabela contribui zero e nao distingue nada.
        val texto = "ABCDE" + "0".repeat(20)
        assertEquals(25, texto.length)

        val legenda = Code93.code93(texto).legenda
        afirmar(legenda.length == 27,
            "a legenda e' o texto mais os dois digitos, e tem ${legenda.length}")

        val comReinicio = somaPonderada(texto, 20)
        val semReinicio = somaSemReinicio(texto)

        afirmar(legenda[25] == TabelasCode93.ALFABETO[comReinicio % 47],
            "o primeiro digito tem de ser o que a conta com reinicio da, e e' "
                + "'${legenda[25]}' em vez de "
                + "'${TabelasCode93.ALFABETO[comReinicio % 47]}'")

        // **E as duas contas tem de dar numeros diferentes**, senao o texto de
        // teste nao separa as duas formulas e o teste nao prova nada.
        afirmar(semReinicio % 47 != comReinicio % 47,
            "o texto de teste nao separa as duas formulas: escolher outro")
    }

    /** A soma com o peso a reiniciar no maximo. */
    private fun somaPonderada(texto: String, maximo: Int): Int {
        var peso = 1
        var total = 0

        for (caractere in texto.reversed()) {
            total += peso * TabelasCode93.INDICE[caractere]!!
            peso += 1
            if (peso > maximo) peso = 1
        }

        return total
    }

    /** A soma com o peso a crescer sem parar, que e' o bug. */
    private fun somaSemReinicio(texto: String): Int {
        var total = 0
        var peso = 1

        for (caractere in texto.reversed()) {
            total += peso * TabelasCode93.INDICE[caractere]!!
            peso += 1
        }

        return total
    }

    @Test
    fun `o Code 128 mede 11 modulos por simbolo, mais 13 de paragem`() {
        // **A regra que o bug do indice quebrou.** Um simbolo do Code 128 tem
        // sempre 11 modulos. O codigo antigo dava 12 ao primeiro simbolo de cada
        // valor, porque a cor do elemento vinha do indice do caracter dentro da
        // cadeia e nao do numero do elemento.
        //
        // **Contar pelo total e' o que torna o teste honesto:** a API nao expoe
        // o simbolo isolado, e nao deve. O total da para checkar porque 11 x
        // simbolos + 13 da paragem, e o digito de controlo e' mais um simbolo.
        for (texto in listOf("Hi", "ABC123", "12345678", "abc-123", "Code 128")) {
            val valores = Code128.valoresDe(texto)
            val esperado = 11 * (valores.size + 1) + 13

            assertEquals(
                esperado, Code128.code128(texto).modulos.size,
                "\"$texto\" tem ${valores.size} valores e devia medir $esperado modulos",
            )
        }
    }

    @Test
    fun `a moldura de inicio do ITF nao tem barra larga`() {
        // **O bug da caixa da letra.** `NnNn` tem quatro elementos estreitos, e
        // decide-se pela letra — `N` e' estreito — e nao pela caixa. Lido pela
        // caixa o `N` saia largo e a moldura comecava com uma barra de dois
        // modulos, que e' um elemento que o ITF nao tem.
        val modulos = Lineares.itf("123456").modulos

        for (i in 0 until 3) {
            assertTrue(
                !(modulos[i] && modulos[i + 1]),
                "a moldura de inicio do ITF tem dois modulos escuros seguidos no " +
                    "modulo $i, o que e' uma barra larga",
            )
        }
    }

    @Test
    fun `as guardas do Codabar nao chegam aos dados`() {
        // **A regra que o Python errava.** As guardas sao indices de modulo e nao
        // de elemento: a moldura do inicio ocupa 23 modulos e a conta antiga
        // `len(moldura) * largo` dava 35, marcando 12 colunas do primeiro
        // caractere de dados. Sao **duas** molduras, 23 + 23.
        val guardas = Lineares.codabar("123456").guardas

        assertEquals(
            46, guardas.size,
            "as duas molduras do Codabar ocupam 23 modulos cada e as guardas marcam " +
                "${guardas.size}: ${guardas.toList()}",
        )
        assertEquals(22, guardas[22], "a moldura de inicio acaba no modulo 22")
        assertTrue(
            guardas[23] > guardas[22],
            "a moldura de paragem comeca depois da de inicio, e nao colada a ela",
        )
    }

    @Test
    fun `as guardas do ITF incluem a ultima barra da paragem`() {
        // A paragem `WnN` ocupa 4 modulos — 2 + 1 + 1 — e a conta antiga
        // `len(ITF_PARAGEM)` marcava 3, deixando a ultima barra da paragem com a
        // altura de uma barra de dados. E' a barra que distingue a paragem.
        val itf = Lineares.itf("123456")
        val ultimo = itf.modulos.size - 1

        assertTrue(
            itf.guardas.contains(ultimo),
            "a ultima coluna da moldura de paragem (modulo $ultimo) tem de ser guarda, " +
                "e as guardas sao ${itf.guardas.toList()}",
        )
    }

    @Test
    fun `o Code 39 cumpre o exemplo publicado do digito de controlo`() {
        // **O exemplo vem da documentacao do ZPL da Zebra**, que da o algoritmo
        // com numeros:
        //
        //   dados `12345ABCDE/`
        //   1+2+3+4+5 = 15;  A..E = 10+11+12+13+14 = 60;  `/` = 40
        //   soma = 115
        //   115 / 43 = 2, resto 29
        //   29 e' a letra `T`   ->   o digito e' `T`
        //
        // **Por que um exemplo publicado e nao uma constante escrita a mao.** Este
        // repositorio ja descobriu que a regra e' o resto, e nao "o que falta
        // para a soma dar inteiro", por causa de um comentario que dizia o
        // contrario — e quase became um bug em tres stacks. E' o mesmo motivo
        // pelo qual as tabelas dos codigos de barras vem de um gerador.
        assertEquals(115, somaDe("12345ABCDE/"), "a soma do exemplo tem de dar 115")
        assertEquals(29, 115 % 43, "o resto tem de ser 29")
        assertEquals("T", digitoDeControlo39("12345ABCDE/"))
    }

    @Test
    fun `o Code 39 liga o digito de controlo e o ITF-14 tambem`() {
        // **A regra esta aqui, e nao so num comentario, para que mudar quebre este
        // teste.** Um teste que so verificasse que ha um digito deixaria passar as
        // duas regras — o resto e o complementar — que sao precisamente as duas
        // que este repositorio ja confundiu uma vez.
        val texto = "CODE-39"
        val legenda = Lineares.code39(texto).legenda

        assertTrue(legenda.startsWith(texto), "a legenda comeca pelo texto")
        assertEquals(
            texto.length + 1, legenda.length,
            "o digito de controlo e' exactamente um caractere",
        )
        assertEquals(
            texto + digitoDeControlo39(texto), legenda,
            "a legenda tem de ser o texto com o digito do exemplo publicado",
        )

        assertEquals("00012345678905", Lineares.itf14("0001234567890").legenda)
    }

    // --- o que o encoder recusa --------------------------------------------

    @Test
    fun `o ITF recusa um numero impar de digitos e sugere o ITF-14`() {
        val erro = assertFailsWith<SimbologiaException> { Lineares.itf("12345") }
        assertTrue(
            erro.message!!.contains("ITF-14"),
            "a mensagem deve sugerir o ITF-14, que acrescenta o digito que falta: " +
                erro.message,
        )
    }

    @Test
    fun `o ITF-14 recusa o numero errado de digitos`() {
        assertFailsWith<SimbologiaException> { Lineares.itf14("1234") }
        assertFailsWith<SimbologiaException> { Lineares.itf14("123456789012345") }
    }

    @Test
    fun `o Codabar recusa uma moldura que nao existe`() {
        val erro = assertFailsWith<SimbologiaException> {
            Lineares.codabar("123456", "Z", "A", false)
        }
        assertTrue(
            erro.message!!.contains("A, B, C"),
            "a mensagem deve dizer quais sao as molduras: ${erro.message}",
        )
    }

    @Test
    fun `o Codabar recusa um caractere de moldura nos dados`() {
        // **Um `A` no meio do texto era codificado com a tabela de dados e o leitor
        // lia-o como moldura:** o codigo passava a parte estrutural e partia a
        // meio, sem erro nenhum pelo caminho.
        val erro = assertFailsWith<SimbologiaException> { Lineares.codabar("12A456") }
        assertTrue(
            erro.message!!.contains("inicio ou paragem"),
            "a mensagem tem de dizer que e' uma moldura: ${erro.message}",
        )
    }

    @Test
    fun `o Codabar recusa texto vazio`() {
        assertFailsWith<SimbologiaException> { Lineares.codabar("") }
    }

    @Test
    fun `o Code 39 recusa o que o alfabeto nao tem, e diz o alfabeto`() {
        for (valor in listOf("A@B", "A(B", "A#B")) {
            val erro = assertFailsWith<SimbologiaException> { Lineares.code39(valor) }
            assertTrue(
                erro.message!!.contains("0123456789"),
                "a mensagem deve dizer o alfabeto inteiro, para nao se adivinhar: " +
                    erro.message,
            )
        }
    }

    @Test
    fun `o Code 39 recusa o asterisco nos dados`() {
        val erro = assertFailsWith<SimbologiaException> { Lineares.code39("*ABC*") }
        assertTrue(
            erro.message!!.contains("asterisco"),
            "a mensagem tem de dizer que o asterisco e' a moldura: ${erro.message}",
        )
    }

    @Test
    fun `o Code 128 recusa o que nao e' ASCII e manda para o QR`() {
        val erro = assertFailsWith<SimbologiaException> { Code128.code128("olá") }
        assertTrue(
            erro.message!!.contains("QR"),
            "a mensagem ha de dizer que para acentos se usa o QR: ${erro.message}",
        )
    }

    @Test
    fun `o Code 128 recusa um conjunto que nao existe`() {
        val erro = assertFailsWith<SimbologiaException> { Code128.code128("ABC", 9) }
        assertTrue(
            erro.message!!.contains("A, B ou C"),
            "a mensagem tem de dizer quais sao os conjuntos: ${erro.message}",
        )
    }

    // --- implementado -------------------------------------------------------

    /**
     * A luminancia de uma imagem, para o ZXing ler.
     *
     * **Existe em vez do `BufferedImageLuminanceSource` do `javase`, e a razao
     * e' a dependencia.** O `core` do ZXing traz a interface e nao precisa de
     * mais: aadapter de imagem e' uma conta de trinta linhas, e o `javase` seria
     * um artifact inteiro — com as suas dependencias — por causa delas. E este
     * `core` nao tem nenhuma dependencia de runtime, e nao e' por acaso.
     *
     * **A luminancia e' a media ponderada de RGB**, que e' o que o ZXing espera:
     * o olho humano da mais peso ao verde do que ao vermelho e ao azul.
     *
     * **E' um `ByteArray` e nao um `IntArray`, porque e' o que a interface
     * pede.** Um metodo que se sobrepoe tem a assinatura da base e nao a que
     * seria mais comoda escrever, e `IntArray` e' o tipo natural em Kotlin.
     */
    private class ImagemLuminance(private val imagem: BufferedImage) :
        LuminanceSource(imagem.width, imagem.height) {

        private val luminancia = ByteArray(imagem.width * imagem.height)

        init {
            for (y in 0 until imagem.height) {
                for (x in 0 until imagem.width) {
                    val p = imagem.getRGB(x, y)
                    val r = (p shr 16) and 0xFF
                    val g = (p shr 8) and 0xFF
                    val b = p and 0xFF
                    luminancia[y * imagem.width + x] =
                        (r * 0.299 + g * 0.587 + b * 0.114).toInt().toByte()
                }
            }
        }

        override fun getRow(y: Int, row: ByteArray?): ByteArray {
            val largura = imagem.width
            if (row == null || row.size < largura) {
                return luminancia.copyOfRange(y * largura, y * largura + largura)
            }
            System.arraycopy(luminancia, y * largura, row, 0, largura)
            return row
        }

        override fun getMatrix(): ByteArray = luminancia
    }

    /**
     * Desenha os modulos e devolve o que o ZXing le.
     *
     * **Preto sobre branco, com zona silenciosa.** A margem nao e' decorativa: sem
     * ela o ZXing nao encontra o codigo, e o teste falha por um motivo que nao
     * tem nada a ver com o encoder.
     */
    private fun ler(codigo: CodigoDeBarras, formato: BarcodeFormat): String {
        val modulos = codigo.modulos
        val margem = if (formato == BarcodeFormat.ITF) 10 else 5

        val largura = (modulos.size + 2 * margem) * ESCALA
        val imagem = BufferedImage(largura, ALTURA, BufferedImage.TYPE_INT_RGB)

        // **O fundo branco e' o explicitado:** um TYPE_INT_RGB novo e' preto, e um
        // codigo de barras preto sobre preto nao le.
        for (x in 0 until largura) {
            for (y in 0 until ALTURA) {
                imagem.setRGB(x, y, 0xFFFFFFFF.toInt())
            }
        }

        for (i in modulos.indices) {
            if (!modulos[i]) continue
            val x0 = (i + margem) * ESCALA
            for (x in x0 until x0 + ESCALA) {
                for (y in 0 until ALTURA) {
                    imagem.setRGB(x, y, 0xFF000000.toInt())
                }
            }
        }

        try {
            val bitmap = BinaryBitmap(HybridBinarizer(ImagemLuminance(imagem)))

            val dicas = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java)
            dicas[DecodeHintType.TRY_HARDER] = true
            if (formato == BarcodeFormat.ITF) {
                // **O ITF precisa disto e os outros nao.** Sem a dica, o ZXing tenta
                // tambem o Code 128 e escolhe-o, porque o ITF tem sempre digitos e
                // uma moldura compativel — e o teste passava a comparar o texto de
                // outro codigo.
                dicas[DecodeHintType.PURE_BARCODE] = true
            }

            return MultiFormatReader().decode(bitmap, dicas).text
        } catch (e: Exception) {
            throw AssertionError("Falha ao descodificar com o ZXing: ${e.message}", e)
        }
    }

    /**
     * A soma dos indices, para o exemplo publicado da Zebra.
     *
     * Escrito aqui, e nao copiado do encoder: se os dois fossem a mesma conta, o
     * teste nao provaria nada.
     */
    private fun somaDe(texto: String): Int {
        val alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"
        var soma = 0
        for (c in texto) {
            val indice = alfabeto.indexOf(c)
            assertTrue(indice >= 0, "'$c' nao existe no Code 39")
            soma += indice
        }
        return soma
    }

    /** O digito pela regra publicada: o resto da divisao por 43. */
    private fun digitoDeControlo39(texto: String): String {
        val alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"
        return alfabeto[somaDe(texto) % 43].toString()
    }

    private companion object {
        private const val ESCALA = 4
        private const val ALTURA = 90
    }
}
