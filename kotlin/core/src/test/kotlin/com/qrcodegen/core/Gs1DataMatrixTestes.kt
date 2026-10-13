package com.qrcodegen.core

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.Result
import com.google.zxing.ResultMetadataType
import com.google.zxing.common.HybridBinarizer
import com.qrcodegen.core.simbologias.CodigoGs1
import com.qrcodegen.core.simbologias.CodigoGs1Matriz
import com.qrcodegen.core.simbologias.Gs1_128
import com.qrcodegen.core.simbologias.Gs1_DataMatrix
import com.qrcodegen.core.simbologias.SimbologiaException
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.awt.image.BufferedImage

/**
 * Os testes do GS1 DataMatrix em Kotlin.
 *
 * **O encoder desenha e o ZXing le**, que e' o nivel 2 e a versao que apanha o que os
 * testes estruturais nao apanham.
 *
 * ## E as afirmacoes de leitura foram **medidas**, nao supostas
 *
 * **Isto e' o que custou 14 falhas de uma vez em Java.** O `SondaGs1DataMatrix`
 * desenhou os simbolos e mostrou tudo o que o ZXing devolve, e **tres das tres
 * suposicoes estavam erradas**:
 *
 * | | a supor | o ZXing devolve |
 * |---|---|---|
 * | `getText()` | `(01)0401…` entre parenteses | **`<GS>` + o payload** |
 * | `getRawBytes()` | os caracteres | **os codewords**, e sao o **prefixo** do encoder |
 * | `]d2` | `]d2` | `]d2` — a unica suposicao certa |
 *
 * **O Kotlin usa o mesmo ZXing que o Java**, e por isso que o que se mediu em Java
 * vale para aqui. **Sao tres leitores e tres formatos**, e a `AGENTS.md` ja avisa que
 * as afirmacoes nao se traduzem umas nas outras — o `zxingcpp` de Python devolve os AI
 * entre parenteses, o ZXing no GS1-128 devolve o payload sem separadores, e o ZXing no
 * GS1 DataMatrix devolve `<GS>` mais o payload.
 *
 * ## `DynamicTest` e nao `ParameterizedTest`
 *
 * O `Gs1_128Testes` usa `@TestFactory` com `DynamicTest`, e o mesmo se aplica aqui —
 * **cada caso e' um teste com nome**, e o nome e' o texto do campo, que e' o que faz
 * a falha dizer o que falhou.
 */
class Gs1DataMatrixTestes {

    /** Quantos pixele por modulo. **Quatro**, como no `DataMatrixTestes`. */
    private val escala = 4

    /** A zona muda, em modulos. **Dez**, como no outro ficheiro de Data Matrix. */
    private val zonaMuda = 10

    private class Caso(val nome: String, val texto: String, val construcao: () -> CodigoGs1Matriz)

    private val casos: List<Caso> = listOf(
        Caso("o GTIN sozinho", "(01)04012345678901") {
            Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901")
        },
        Caso("GTIN e um lote ao fim", "(01)04012345678901(10)LOTE-A1") {
            Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1")
        },
        Caso("o lote no meio", "(01)04012345678901(10)LOTE-A1(17)270630") {
            Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1(17)270630")
        },
       Caso(
            "tres campos",
            "(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630",
        ) {
            Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630")
        },
        Caso("o AI 415, um GLN", "(415)0123456789012(10)LOTE-B2") {
            Gs1_DataMatrix.gs1DataMatrix("(415)0123456789012(10)LOTE-B2")
        },
        Caso("a posicao decimal implicita", "(3103)000123") {
            Gs1_DataMatrix.gs1DataMatrix("(3103)000123")
        },
    )

    private val recusas = listOf(
        "(01)9501101530003" to "13", // GTIN com treze, e a mensagem diz os dois numeros
        "(11)155630" to "GS1", // mes 56
        "(888)ABC" to "nao existe", // AI que a GS1 nao publica
        "(01)" to "valor", // campo sem valor
    )

    // --- nivel 2: o ZXing le ---------------------------------------------------

    @TestFactory
    fun oZxingLeOPayloadComOGs(): List<DynamicTest> = casos.map { caso ->
        DynamicTest.dynamicTest(caso.nome) {
            val codigo = caso.construcao()
            val resultado = descodificar(codigo)

            // **O `getText()` e' o `GS` do inicio mais o payload**, e nada mais — medido
            // com o `SondaGs1DataMatrix` do Java, e o Kotlin usa o mesmo ZXing.
            //
            // **A suposta forma humana entre parenteses estava errada.** Nem a do
            // encoder, nem o `payload()` dele: o ZXing escreve o separador do inicio a
            // frente e consome-o, e o `payload()` ja' tem os separadores do meio no
            // sitio certo.
            assertEquals(Gs1_DataMatrix.GS + codigo.payload(), resultado.text)
        }
    }

    @TestFactory
    fun oZxingViuOFnc1DoInicio(): List<DynamicTest> =
        casos.map { caso ->
            DynamicTest.dynamicTest(caso.nome) {
                val resultado = descodificar(caso.construcao())

                // **O `]d2` e' o sintoma do FNC1 do inicio.** Um `]d1` e' um Data Matrix
                // normal e o codigo seria lido sem queixa nenhuma — o utilizador nunca ve
                // a diferenca, so o leitor de um sistema GS1.
                val identificador = resultado.resultMetadata[ResultMetadataType.SYMBOLOGY_IDENTIFIER]
                assertEquals("]d2", identificador)
            }
        }

    @TestFactory
    fun oZxingViuOsSeparadores(): List<DynamicTest> =
        casos.map { caso ->
            DynamicTest.dynamicTest(caso.nome) {
                val codigo = caso.construcao()
                val resultado = descodificar(codigo)

                // **Contar os `0x1D` no `getText()` e' o que confirma os separadores dos
                // dois lados.** O ZXing consome-os todos e escreve-os no texto: o do
                // inicio a frente e os do meio no sitio certo. **Contar nos
                // `getRawBytes()` dava zero** — e foi o que a primeira versao fez.
                var vistos = 0
                for (c in resultado.text) {
                    if (c == 0x1D.toChar()) vistos++
                }

                assertEquals(codigo.separadores(), vistos)
            }
        }

    @TestFactory
    fun osBytesSaoOsCodewords(): List<DynamicTest> = casos.map { caso ->
            DynamicTest.dynamicTest(caso.nome) {
                val codigo = caso.construcao()
                val resultado = descodificar(codigo)

                // **Sao os CODEWORDS, e sao o PREFIXO do que o encoder escreveu.** O
                // `encher` acrescenta pads aleatorizados ate a capacidade, e o ZXing
                // devolve-os tambem — **por isso que a comparacao e' de prefixo e nao de
                // igualdade**: o enchimento e' aleatorio por desenho e uma igualdade
                // falharia com ele, que nao e' um bug de GS1.
                val meus = codigo.codigo().codewords
                val lidos = resultado.rawBytes

                assertTrue(lidos.size >= meus.size, "o ZXing leu ${lidos.size} e o encoder ${meus.size}")

                for (i in meus.indices) {
                    assertEquals(meus[i].toByte(), lidos[i], "o codeword $i")
                }
            }
        }

    // --- o separador, que e' a regra que mais vezes se engana --------------------

    @TestFactory
    fun oSeparadorSoNoVariavel(): List<DynamicTest> = casos.map { caso ->
            DynamicTest.dynamicTest(caso.nome) {
                val codigo = caso.construcao()

                // **Um separador por campo variavel que nao seja o ultimo, mais o do
                // inicio.** Um separador no fim nao separa de nada e o leitor accounta-o
                // como parte do campo seguinte.
                val variaveis = codigo.campos()
                    .dropLast(1)
                    .count { it.separador }

                assertEquals(variaveis + 1, codigo.separadores())
            }
        }

    // --- nivel 0: os codewords, que e' o formato de fio ---------------------------

    @TestFactory
    fun oGtinVaiNoModoDeDigitos(): List<DynamicTest> = listOf(
        DynamicTest.dynamicTest("o GTIN-14 em sete codewords") {
            val codigo = Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901")

            // **O `131` e' o `01` em digitos e os sete seguintes sao o GTIN aos pares.**
            // Em ASCII seriam catorze codewords e o simbolo sairia maior do que devia —
            // **desenhava-se certo, lia-se certo, e ocupava o dobro do espaco**, que e'
            // o bug que nenhum teste de leitura apanha.
            assertArrayEquals(
                intArrayOf(232, 131, 134, 131, 153, 175, 197, 219, 131),
                codigo.codigo().codewords,
            )
        },
        DynamicTest.dynamicTest("o valor de um AI alfanumerico vai em ASCII") {
            val codigo = Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1")

            // **O outro ramo da mesma decisao.** O `LOTE-A1` sao sete codewords, e nao
            // quatro — que e' o que aconteceria se o `numerico` estivesse a dizer que sim
            // para todo o mundo. **Um ramo sem caso e' um ramo onde um erro custa meses.**
            val cw = codigo.codigo().codewords
            val pos10 = cw.indexOf(140) // 10 + 130, o "10" do AI em digitos
            assertTrue(pos10 > 0, "o AI 10 esta no modo de digitos, como 140")

            var lote = ""
            for (i in pos10 + 1..pos10 + 7) {
                lote += (cw[i] - 1).toChar()
            }
            assertEquals("LOTE-A1", lote)
        },
    )

    // --- as recusas ----------------------------------------------------------------

    @TestFactory
    fun asRecusasDizemPorque(): List<DynamicTest> = recusas.map { (texto, palavra) ->
        DynamicTest.dynamicTest("a recusa de $texto") {
            val erro = assertThrows(SimbologiaException::class.java) {
                Gs1_DataMatrix.gs1DataMatrix(texto)
            }
            assertTrue(
                erro.message!!.contains(palavra),
                "a recusa de $texto nao diz '$palavra': ${erro.message}",
            )
        }
    }

    @TestFactory
    fun aRecusaIdentificaOGs1DataMatrix(): List<DynamicTest> = listOf(
        DynamicTest.dynamicTest("a recusa comecar por GS1 DataMatrix") {
            // **O `analisar` e' o do GS1-128**, com um rotulo — a tabela e' a mesma. Sem
            // o rotulo, a mensagem mandava a pessoa procurar o erro num codigo de barras.
            val erro = assertThrows(SimbologiaException::class.java) {
                Gs1_DataMatrix.gs1DataMatrix("(01)9501101530003")
            }
            assertTrue(erro.message!!.startsWith("GS1 DataMatrix: "), erro.message)
        },
        DynamicTest.dynamicTest("um AI de varios componentes da o mesmo veredicto nos dois") {
            // **O `253` e' `N3+N13[+X..17]`: ultimo componente 17, soma 30.** A tabela so
            // traz o do ultimo porque e' o que serve para **dividir**; para **conferir**
            // e' a soma. Sao 44 AIs em que a diferenca recusava um valor que a GS1 aceita.
            val trinta = "1".repeat(30)

            assertNotNull(Gs1_DataMatrix.gs1DataMatrix("(253)$trinta"))
            assertNotNull(Gs1_128.gs1_128("(253)$trinta"))

            assertThrows(SimbologiaException::class.java) {
                Gs1_DataMatrix.gs1DataMatrix("(253)" + "1".repeat(31))
            }
            assertThrows(SimbologiaException::class.java) {
                Gs1_128.gs1_128("(253)" + "1".repeat(31))
            }
        },
    )

    // --- a leitura -------------------------------------------------------------------

    private fun descodificar(codigo: CodigoGs1Matriz): Result {
        val modulos = codigo.codigo().modulos
        val largura = (codigo.codigo().colunas + 2 * zonaMuda) * escala
        val altura = (codigo.codigo().linhas + 2 * zonaMuda) * escala

        val imagem = BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB)

        // O fundo branco e' o explicitado: um TYPE_INT_RGB novo e' preto, e um Data
        // Matrix preto sobre preto nao le.
        for (x in 0 until largura) {
            for (y in 0 until altura) {
                imagem.setRGB(x, y, 0xFFFFFFFF.toInt())
            }
        }

        for (y in modulos.indices) {
            for (x in 0 until modulos[y].size) {
                if (!modulos[y][x]) continue
                val x0 = (x + zonaMuda) * escala
                val y0 = (y + zonaMuda) * escala
                for (dx in 0 until escala) {
                    for (dy in 0 until escala) {
                        imagem.setRGB(x0 + dx, y0 + dy, 0xFF000000.toInt())
                    }
                }
            }
        }

        return try {
            val hints = mapOf(DecodeHintType.TRY_HARDER to true)
            MultiFormatReader().decode(
                BinaryBitmap(HybridBinarizer(ImagemLuminance(imagem))),
                hints,
            )
        } catch (e: Exception) {
            throw AssertionError(
                "o ZXing nao leu o GS1 DataMatrix de ${codigo.legenda()}: ${e.message}",
                e,
            )
        }
    }
}