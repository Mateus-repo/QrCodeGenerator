package com.qrcodegen.core

import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.assertTrue

/**
 * A codificacao do texto, e por que este teste existe.
 *
 * **Um encoder so entra no repositorio depois de o ZXing devolver a cadeia
 * certa** — e o ZXing le-o, sem este teste. Este mede outra coisa, que o leitor
 * nao mede: **o que o codigo diz, e nao o que ele produz nesta maquina.**
 *
 * ## Porque um teste de leitura nao chega aqui
 *
 * `String.toByteArray()` sem argumento usa a codificacao da plataforma. Com a
 * plataforma em UTF-8 — **o default do Java desde a versao 18** — isso da o mesmo
 * resultado que `toByteArray(Charsets.UTF_8)`, e um teste de leitura passa com o
 * bug dentro.
 *
 * Introduziu-se o bug de proposito e o teste de leitura **nao o apanhou**. Numa
 * maquina com o default em cp1252 apanhava, e nessa maquina o encoder produzia um
 * codigo diferente — que e' a forma mais cara de divergencia que existe, porque so
 * aparece em producao e so num sistema.
 *
 * ## Porque a defesa e' ler o fonte
 *
 * **Este teste nao executa o encoder**: le a fonte e procura a chamada sem
 * argumento. E' uma defesa imperfeita — uma refatoracao pode mudar a forma da
 * chamada sem mudar o que se procura — **e e' a unica que apanha um erro de
 * argumento numa chamada**. Um teste que executa mede o resultado, e o resultado
 * nesta maquina e' o certo.
 *
 * A `AGENTS.md` regista o mesmo padrao no `frameqr-centragem` do web: um teste que
 * prova que uma peca esta boa nao prova que a maquina liga. O bug vivia na
 * *chamada*, e nenhum teste que executasse a peca a via.
 *
 * **A stack Java tem este teste com o mesmo nome e a mesma razao**, e e' a segunda
 * vez que o mesmo bug aparece em duas stacks.
 *
 * @see CodificacaoDataMatrixTestes do Java
 */
class CodificacaoDataMatrixTestes {

    /**
     * O caminho da fonte do encoder.
     *
     * **Procurado a subir, e nao escrito.** O Gradle corre o teste com o
     * directorio do modulo, mas um runner pode correr noutro sitio, e um caminho
     * escrito a mao passava num e falhava no outro — que e' o tipo de teste que se
     * apaga por estar a dar trabalho sem dizer nada.
     */
    private fun fonteDoEncoder(): Path {
        val relativo = "src/main/kotlin/com/qrcodegen/core/simbologias/DataMatrix.kt"

        var pasta: Path? = Path.of("").toAbsolutePath().normalize()
        while (pasta != null) {
            val candidato = pasta.resolve(relativo)
            if (Files.isRegularFile(candidato)) return candidato
            pasta = pasta.parent
        }

        val dePartida = Path.of("").toAbsolutePath()
        throw AssertionError("nao encontrei $relativo a subir de $dePartida")
    }

    /**
     * As linhas do encoder **sem os comentarios**.
     *
     * **Sem isto o teste falha contra si proprio**, e falhou na stack Java: a nota
     * que explica porque o `toByteArray()` sem argumento e' errado esta escrita em
     * cima da linha do `toByteArray()`, e a busca encontra a nota.
     *
     * Um teste de fonte que le comentarios apanha o que o comentario diz, e nao o
     * que o codigo faz — **e o pior dos dois erros**, porque a correccao natural e'
     * reescrever o comentario, que e' mudar a documentacao para o teste passar.
     */
    private fun linhasDeCodigo(): List<String> =
        Files.readAllLines(fonteDoEncoder(), StandardCharsets.UTF_8)
            .map { linha ->
                val comentario = linha.indexOf("//")
                if (comentario >= 0) linha.substring(0, comentario) else linha
            }
            .filterNot { t ->
                val limpa = t.trim()
                limpa.startsWith("//") || limpa.startsWith("*") || limpa.startsWith("/*")
            }

    @Test
    fun `o encoder pede o UTF-8 pelo nome e nao a codificacao da plataforma`() {
        val semArgumento = linhasDeCodigo().filter { it.contains("toByteArray()") }

        assertTrue(
            semArgumento.isEmpty(),
            "o encoder chama toByteArray() sem argumento, e isso usa a codificacao da " +
                "plataforma. Como o Java 18 faz de UTF-8 o default, num teste nesta " +
                "maquina o resultado e' o mesmo - e noutra maquina nao e'. " +
                "As linhas sao:\n$semArgumento",
        )
    }

    @Test
    fun `o encoder passa o UTF-8 de forma explicita ao compactar`() {
        val fonte = Files.readString(fonteDoEncoder(), StandardCharsets.UTF_8)

        assertTrue(
            fonte.contains("Charsets.UTF_8"),
            "o DataMatrix.kt nao menciona Charsets.UTF_8 em lado nenhum. Se o " +
                "toByteArray() sem argumento desapareceu por outra via, esta e' a " +
                "prova de que o UTF-8 explicito foi perdido com ele.",
        )
    }
}