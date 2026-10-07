package com.qrcodegen.core

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.Result
import com.google.zxing.common.HybridBinarizer
import com.qrcodegen.core.simbologias.CodigoMatriz
import com.qrcodegen.core.simbologias.DataMatrix
import com.qrcodegen.core.simbologias.SimbologiaException
import com.qrcodegen.core.simbologias.TabelasDataMatrix
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import java.awt.image.BufferedImage
import java.nio.charset.StandardCharsets
import java.util.EnumMap
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Nivel 2 do Data Matrix em Kotlin: **o Kotlin desenha e o ZXing le**.
 *
 * **E' uma classe a parte, e nao mais um `@TestFactory` dentro do
 * `SimbologiasTestes`.** Nao e' por ser mais codigo: e' porque o desenho e' outro.
 * Um codigo de barras desenha-se com guardas que descem, uma altura de 90 pixele
 * e uma margem de cinco modulos; um Data Matrix tem as guias em L dentro da
 * propria grelha e uma zona muda de **um** modulo. O `ler()` do
 * `SimbologiasTestes` esta' a fazer o que o Data Matrix nao quer.
 *
 * **E' o mesmo que a stack Java tem, e pelo mesmo motivo.** Um encoder so entra
 * no repositorio depois de o ZXing devolver a cadeia certa. Nao ha "quase" — na
 * fase dos codigos de barras, quatro encoders pareceram certos durante a escrita e
 * nao eram.
 *
 * ## Os bytes, nunca o texto
 *
 * **A comparacao e' por `rawBytes` e nao por `text`.** O `text` do ZXing, na
 * ausencia de ECI, assume ISO-8859-1 — e um Data Matrix nao tem ECI: um `ç` que
 * em UTF-8 e' `0xC3 0xA7` volta como dois caracteres. **O texto devolvido nao e'
 * o texto que foi escrito**, e comparar as duas coisas daria um teste que so
 * passa para ASCII.
 *
 * **E os bytes crus sao os codewords, um por byte.** Foi o payload mais curto a
 * mostrar o que o metodo devolvia: `A` e' o codeword 66, e 66 em ASCII e' a letra
 * `B`. Um teste que le um campo e recebe outra coisa nao falha — devolve outra
 * coisa, e o teste passa se comparar na coisa errada.
 */
class DataMatrixTestes {

    // --- leitura ------------------------------------------------------------

    @TestFactory
    fun `o Data Matrix e' lido pelo ZXing`(): List<DynamicTest> = payloads.map { (nome, texto) ->
        DynamicTest.dynamicTest("Data Matrix: $nome") {
            assertEquals(
                DataMatrix.compactar(texto.toByteArray(StandardCharsets.UTF_8)).toList(),
                ler(construir(texto), texto),
                "o ZXing leu outra coisa",
            )
        }
    }

    @Test
    fun `o ZXing le como Data Matrix e nao como outra coisa`() {
        // **Um leitor que devolve o texto certo na formatacao errada passa num
        // teste so de texto.** E ja aconteceu neste repositorio: o ITF sem
        // `PURE_BARCODE` e' lido como Code 128, porque o ITF tem sempre digitos e
        // uma moldura compativel.
        assertEquals(BarcodeFormat.DATA_MATRIX, formato(DataMatrix.dataMatrix("MAST-2024-0001")))
    }

    @Test
    fun `o texto do ZXing so e' comparavel no ASCII`() {
        // **O `getText()` funciona, e e' por isso que o teste de texto nao esta'
        // nos casos com acentos.** O texto devolvido pelo ZXing **nao e' o texto
        // escrito**, e um teste que comparasse os dois falharia por uma razao que
        // nao tem nada a ver com o encoder. **Por isso aqui so ASCII, e o `ler` de
        // codewords mede o resto** — e os casos com acento ficam no `@TestFactory`
        // acima, dentro.
        assertEquals("MAST-2024-0001", texto(DataMatrix.dataMatrix("MAST-2024-0001")))
        assertEquals("4531234567890123", texto(DataMatrix.dataMatrix("4531234567890123")))
    }

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

    @Test
    fun `a guia de baixo e a da esquerda sao cheias, e a de cima e' tracejada`() {
        // **A assimetria das guias e' a assinatura do Data Matrix**, e e' a coisa de
        // que o leitor se serve para se orientar. As quatro iguais nao e' lido.
        val modulos = DataMatrix.dataMatrix("MAST-2024-0001").modulos

        for (linha in modulos) {
            assertTrue(linha[0], "a guia da esquerda e' o vertical do L e e' cheia")
        }
        for (modulo in modulos[modulos.size - 1]) {
            assertTrue(modulo, "a guia de baixo e' o horizontal do L e e' cheia")
        }

        // **A de cima alterna com a posicao**, e nao com a linha: um modulo par e'
        // escuro, um impar e' claro.
        val topo = modulos[0]
        for (i in topo.indices) {
            assertEquals(i % 2 == 0, topo[i], "a guia de cima alterna com a posicao: coluna $i")
        }
    }

    @Test
    fun `o codigo nao tem guardas nem legenda, e nao tem como ter`() {
        // **Um 2D nao tem as duas coisas, e nao deve poder fingir que tem.** Um
        // `guardas` vazio seria um campo que o desenho le e nao usa, e uma legenda
        // vazia seria um codigo que o leitor funciona e a folha impressa nao bate —
        // que e' o pior caso numa etiqueta.
        //
        // **A verificacao e' por reflexao, e nao por leitura do codigo.** Ler o
        // `CodigoMatriz` e ver que nao ha `legenda` prova que nao ha `legenda` hoje;
        // a reflexao prova que nao ha nenhum membro com esse nome, e um acrescentado
        // e' apanhado aqui em vez de por quem desenhar e descobrir o campo vazio.
        for (membro in CodigoMatriz::class.java.methods) {
            val nome = membro.name.lowercase()
            assertTrue(
                !nome.contains("legenda") && !nome.contains("guarda"),
                "o CodigoMatriz tem `${membro.name}()`, e um codigo 2D nao tem nem " +
                    "legenda nem guardas: as guias em L estao na propria grelha",
            )
        }

        val codigo = DataMatrix.dataMatrix("MAST-2024-0001")
        assertEquals(16, codigo.colunas)
        assertEquals(16, codigo.linhas)
        assertEquals(codigo.linhas, codigo.modulos.size)
        assertEquals(codigo.colunas, codigo.modulos[0].size)
    }

    @Test
    fun `a matriz tem uma densidade de tinta de codigo de barras`() {
        // **Nem tudo nem nada.** Um encoder que deixasse a regiao de dados toda
        // branca desenha-se como um Data Matrix com um quadrado no meio e nao e'
        // lido; um que a deixasse toda preta tambem. **Um `Array<BooleanArray>` nao
        // permite outros valores, por isso que a pergunta nao e' "tem 0 e 1" mas
        // "tem a mistura certa"** — e uma pergunta que um `assertTrue(m || !m)`
        // nunca responderia.
        for (texto in listOf("A", "MAST-2024-0001", "9".repeat(900))) {
            val codigo = DataMatrix.dataMatrix(texto)

            val escuros = codigo.modulos.sumOf { linha -> linha.count { it } }
            val total = codigo.linhas * codigo.colunas
            val densidade = escuros.toDouble() / total

            assertTrue(
                densidade > 0.2 && densidade < 0.8,
                "'$texto' saiu com ${(densidade * 100).toInt()}% de tinta, e um codigo " +
                    "de barras fica entre 20% e 80%:\n${codigo.comoTexto()}",
            )
        }
    }

    @Test
    fun `o 144x144 tem dez blocos e a conta fecha`() {
        // **8 x 156 + 2 x 155 = 1558.** Com 154 dava 1556, e dois codewords a menos
        // num codigo de 1558 e' o tipo de erro que o leitor acusa como corrupcao e
        // nao como tabela errada.
        val capacidade = TabelasDataMatrix.SIMBOLOS.last()[0]

        assertEquals(10, TabelasDataMatrix.ULTIMO_BLOCOS)
        assertEquals(8, TabelasDataMatrix.ULTIMO_CHEIOS)
        assertEquals(1558, capacidade)
        assertEquals(
            capacidade,
            TabelasDataMatrix.ULTIMO_CHEIOS * TabelasDataMatrix.ULTIMO_DADOSCHEIO +
                (TabelasDataMatrix.ULTIMO_BLOCOS - TabelasDataMatrix.ULTIMO_CHEIOS) *
                TabelasDataMatrix.ULTIMO_DADOSULTIMOS,
        )
        assertEquals(1558, DataMatrix.CAPACIDADE_MAXIMA)
    }

    @Test
    fun `a chave dos factores e' o comprimento do conjunto`() {
        // **A chave e' o numero de codewords de correccao, que e' o comprimento do
        // conjunto.** Os primeiros indices e os primeiros comprimentos coincidem por
        // acaso e os ultimos nao.
        //
        // **O `FATORES` do Kotlin e' um `Map`, e nao uma lista.** O Java e' o unico
        // dos cinco onde a tabela **nao** escreve a chave, porque um `int[][]`
        // implica a ordem; nos outros quatro a chave esta escrita e um `Map` e' a
        // forma natural. **Ao procurar por indice, como se fosse uma lista, o
        // compilador dá "Unresolved reference 'indices'"** — que e' uma mensagem
        // sobre a coleccao e nao sobre o que eu queria dizer.
        val esperados = listOf(5, 7, 10, 11, 12, 14, 18, 20, 24, 28, 36, 42, 48, 56, 62, 68)

        assertEquals(esperados.size, TabelasDataMatrix.FATORES.size)

        for (chave in esperados) {
            val conjunto = TabelasDataMatrix.FATORES[chave]
            assertTrue(conjunto != null, "FATORES nao tem a chave $chave")
            assertEquals(
                chave, conjunto!!.size,
                "FATORES[$chave] tem comprimento diferente da sua propria chave",
            )
        }
    }

    // --- o que o encoder recusa ---------------------------------------------

    @Test
    fun `o Data Matrix recusa texto vazio`() {
        assertFailsWith<SimbologiaException> { DataMatrix.dataMatrix("") }
    }

    @Test
    fun `o Data Matrix recusa o que nao cabe, e a mensagem diz o limite`() {
        val erro = assertFailsWith<SimbologiaException> { DataMatrix.dataMatrix("A".repeat(4000)) }
        assertTrue(
            erro.message!!.contains("1558"),
            "a mensagem tem de dizer o limite, para nao se adivinhar: ${erro.message}",
        )
    }

    @Test
    fun `o Data Matrix aceita o que um codigo de barras recusa`() {
        // **E' a grande diferenca entre os dois.** Um Code 39 recusa o emoji e o
        // Code 93 recusa tudo acima de 127; aqui qualquer UTF-8 cabe, porque cada
        // byte alto custa dois codewords em vez de ser recusado.
        val codigo = DataMatrix.dataMatrix("ação 🚀")

        assertTrue(codigo.usado <= codigo.dados, "cinco caracteres nao cabem em mais")
        assertEquals(
            DataMatrix.compactar("ação 🚀".toByteArray(StandardCharsets.UTF_8)).toList(),
            ler(codigo, "ação 🚀"),
        )
    }

    @Test
    fun `um espaco e' conteudo valido`() {
        // **O que se recusa e' a cadeia vazia, e nao o texto sem caracteres
        // visiveis.** Um espaco numa etiqueta de peca e' normal.
        assertEquals(1, DataMatrix.dataMatrix(" ").usado)
    }

    // --- a colocacao, chamada directamente ---------------------------------

    @Test
    fun `o canto de baixo a direita esta' posto`() {
        // **E' uma classe no mesmo pacote, e nao aqui**, e por isso que este teste
        // so mede o que a grelha final mostra. O `colocar()` sem as guias esta em
        // `ColocacaoDataMatrixTestes`, no pacote da `simbologias`, e e' ai que se
        // mede o canto — **porque pela grelha final nao se sabe se o bloco correu**.
        val (regiao, lado) = regiaoNua("MAST-2024-0001")

        assertTrue(
            regiao[(lado - 1) * lado + (lado - 1)] >= 0,
            "o canto de baixo a direita ficou por preencher: o bloco que o posta nao " +
                "corre, e o codigo le-se na mesma",
        )
        assertTrue(
            regiao[(lado - 2) * lado + (lado - 2)] >= 0,
            "e o da diagonal tambem",
        )
    }

    // --- o desenho ----------------------------------------------------------

    /** Quantos pixele por modulo. **Quatro**, e nao um. */
    private val ESCALA = 4

    /**
     * A zona muda, em modulos.
     *
     * **Um, e nao dez como no EAN.** O leitor orienta-se pelos cantos tracejados, e
     * sem margem a deteccao falha. Quatro nao arranjam, e um Data Matrix
     * desenhado com a margem do EAN fica maior do que a precisa.
     */
    private val ZONA_MUDA = 1

    /**
     * Desenha a matriz e devolve **os codewords que o ZXing leu**.
     *
     * **E' o [Result.getRawBytes] e nao o [Result.getText]**, e a razao nao e' uma
     * preferencia — e' que o `text` nao pode ser comparado. Ver a nota da classe.
     */
    private fun ler(codigo: CodigoMatriz, esperado: String): List<Int> {
        val resultado = descodificar(codigo)

        assertEquals(
            BarcodeFormat.DATA_MATRIX, resultado.barcodeFormat,
            "o ZXing leu outra formatacao",
        )

        val crus = resultado.rawBytes
        assertTrue(crus != null && crus.isNotEmpty(), "o ZXing nao devolveu os bytes crus")

        val esperados = DataMatrix.compactar(esperado.toByteArray(StandardCharsets.UTF_8))

        assertTrue(
            crus.size >= esperados.size,
            "o ZXing leu ${crus.size} codewords e o encoder mandou ${esperados.size}",
        )

        return (0 until esperados.size).map { i ->
            val lido = crus[i].toInt() and 0xFF
            assertEquals(
                esperados[i], lido,
                "o codeword $i difere: o encoder mandou ${esperados[i]} e o ZXing leu " +
                    "$lido\nA matriz era:\n${codigo.comoTexto()}",
            )
            lido
        }
    }

    /** O texto, para os casos em que o texto e' a coisa a medir. */
    private fun texto(codigo: CodigoMatriz): String = descodificar(codigo).text

    /** A formatacao com que o ZXing le. */
    private fun formato(codigo: CodigoMatriz): BarcodeFormat = descodificar(codigo).barcodeFormat

    private fun descodificar(codigo: CodigoMatriz): Result {
        val modulos = codigo.modulos
        val largura = (codigo.colunas + 2 * ZONA_MUDA) * ESCALA
        val altura = (codigo.linhas + 2 * ZONA_MUDA) * ESCALA

        val imagem = BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB)

        // O fundo branco e' o explicitado: um TYPE_INT_RGB novo e' preto, e um
        // Data Matrix preto sobre preto nao le.
        for (x in 0 until largura) {
            for (y in 0 until altura) {
                imagem.setRGB(x, y, 0xFFFFFFFF.toInt())
            }
        }

        for (y in modulos.indices) {
            for (x in modulos[y].indices) {
                if (!modulos[y][x]) continue
                val x0 = (x + ZONA_MUDA) * ESCALA
                val y0 = (y + ZONA_MUDA) * ESCALA
                for (dx in 0 until ESCALA) {
                    for (dy in 0 until ESCALA) {
                        imagem.setRGB(x0 + dx, y0 + dy, 0xFF000000.toInt())
                    }
                }
            }
        }

        return try {
            val bitmap = BinaryBitmap(HybridBinarizer(ImagemLuminance(imagem)))
            val dicas = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java)
            dicas[DecodeHintType.TRY_HARDER] = true
            MultiFormatReader().decode(bitmap, dicas)
        } catch (e: Exception) {
            throw AssertionError(
                "Falha ao descodificar com o ZXing: ${e.message}\nA matriz era:\n" +
                    codigo.comoTexto(),
                e,
            )
        }
    }

    /**
     * A regiao de dados antes das guias, e o lado dela.
     *
     * **Sem a correccao de erros, e de proposito.** A colocacao so olha para o
     * numero de codewords e para os seus valores; a correccao entra depois. Um
     * codigo de teste que passasse pela correccao mediria duas coisas ao mesmo
     * tempo.
     *
     * **O lado vem da geometria, e nao do tamanho da grelha.** Uma regiao de
     * `n * n` modulos tem `n * n` de comprimento e `n` de lado, e a primeira versao
     * desta funcao devolvia so a grelha e o teste tirava o lado de
     * `regiao.size` — que dava 196 em vez de 14, e o indice ia parar a um sitio
     * que nao tem nada a ver com o canto. **A falha apontava para o canto e o
     * problema era o indice.**
     */
    private fun regiaoNua(texto: String): Pair<IntArray, Int> {
        val dados = DataMatrix.compactar(texto.toByteArray(StandardCharsets.UTF_8))

        val simbolo = TabelasDataMatrix.SIMBOLOS.firstOrNull { dados.size <= it[0] }
            ?: error("nenhum simbolo leva ${dados.size} codewords")

        val g = DataMatrix.Geometria(simbolo)
        val regiao = DataMatrix.colocar(
            DataMatrix.encher(dados, simbolo[0] + simbolo[1]),
            g.dadosColunas,
            g.dadosLinhas,
        )
        return regiao to g.dadosColunas
    }

    private companion object {
        /**
         * Os payloads, e os que cada um mede.
         *
         * **Um caso por ramo da logica e nao um caso por caminho feliz.** O
         * `AGENTS.md` regista o que aconteceu com o Code 93: havia dez casos de
         * leitura, todos de caminho feliz, e **nao havia um unico caracter de
         * controlo** — enquanto o ficheiro que os gerava dizia que os tinha. A
         * verificacao estava presente, era correcta, e media outra coisa.
         *
         * Aqui os ramos sao: o minimo, o texto, os digitos aos pares, o
         * deslocamento para ASCII estendido, e os simbolos com mais do que um
         * bloco de correccao, que e' onde o entrelacamento se ve.
         */
        val payloads = listOf(
            "uma letra, que e' o simbolo mais pequeno" to "A",
            "duas letras" to "AB",
            "texto" to "MAST-2024-0001",
            "digitos aos pares" to "4531234567890123",
            "32 digitos" to "12345678901234567890123456789012",
            "digitos repetidos" to "0000000000000000000000000",

            // **O deslocamento para ASCII estendido.** Cada acento custa dois
            // codewords. **Foi com estes dois que o `b - 128` dava um "r" onde
            // estava um "c"** — e so nos com acentos, que e' a assinatura de um
            // erro que so aparece no canto.
            "com acentos" to "Fatura nº 2026/09 — açúcar, €45,80",
            "com emoji" to "Lote ✅ 42 — pronto 🚀",

            // **Payloads que passam por simbolos com mais do que um bloco de
            // correccao.** Um simbolo com um bloco so nao tem entrelacamento
            // nenhum, e um teste com um deles nunca tocaria nessa parte.
            "120 caracteres" to "X".repeat(120),
            "400 caracteres" to "Y".repeat(400),
            "900 caracteres" to "Z".repeat(900),
            "1400 digitos" to "9".repeat(1400),
        )

        /** Chamadas por nome, porque o `dynamicTest` mostra o nome. */
        fun construir(texto: String): CodigoMatriz = DataMatrix.dataMatrix(texto)
    }
}