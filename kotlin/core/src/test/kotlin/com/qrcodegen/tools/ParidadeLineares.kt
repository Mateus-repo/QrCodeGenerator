package com.qrcodegen.tools

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.qrcodegen.core.simbologias.Code93
import com.qrcodegen.core.simbologias.CodigoDeBarras
import com.qrcodegen.core.simbologias.Code128
import com.qrcodegen.core.simbologias.Lineares
import java.io.PrintStream

/**
 * Le uma lista de casos de codigos de barras e escreve os modulos em JSON.
 *
 * Existe para o `spec/paridade-kotlin.mjs`: e' a ponta de Kotlin da comparacao
 * que decide se o Kotlin e o Python produzem a mesma coisa. **O comprimento
 * pode ser igual e a silhueta errada**, e so a comparacao dos modulos as
 * distingue.
 *
 * ## Porque vive nos testes, e nao no `main`
 *
 * **E' uma ferramenta de verificacao, e nao parte da biblioteca.** O `core` nao
 * sabe o que e' JSON e nao tem de saber: o payload de um QR e' texto, e quem o
 * produz nunca teve um JSON na mao. O Gson ja era dependencia de teste para a
 * spec, e por isso que fica aqui — uma dependencia no `main` por causa de um
 * verificador seria a prova de que a fronteira esta no sitio errado.
 *
 * ## O que nao faz
 *
 * Nao manda o ZXing ler o resultado. O ZXing le a matriz, e a matriz e' o que se
 * compara aqui; acrescentar a leitura seria verificar duas vezes a mesma coisa e
 * dar a ilusao de mais cobertura. A leitura esta nos testes, e ai sim e' o
 * encoder que desenha.
 */
fun main() {
    // **Os casos vao por stdin.** Passar JSON num argumento e' fragil: o Git
    // Bash faz expansao de chaves em `{"inicio":"B"}` e parte o array ao meio,
    // porque a virgula dentro das chaves parece uma lista. Por stdin nao ha
    // shell a mexer no meio.
    val entrada = System.`in`.readBytes().toString(Charsets.UTF_8)
    val casos = JsonParser.parseString(entrada).asJsonArray

    val saida = JsonArray()
    for (caso in casos) {
        saida.add(codigoDe(caso.asJsonArray))
    }

    PrintStream(System.out, true, "UTF-8").println(saida)
}

/** Um caso e' `[tipo, texto, {opcoes}]`, e o script monta-o assim. */
private fun codigoDe(caso: JsonArray): JsonObject {
    val tipo = caso[0].asString
    val texto = caso[1].asString

    val opcoes = if (caso.size() > 2 && caso[2].isJsonObject) {
        caso[2].asJsonObject
    } else {
        JsonObject()
    }

    fun opcao(nome: String): String? =
        if (opcoes.has(nome)) opcoes[nome].asString else null

    val codigo: CodigoDeBarras = when (tipo) {
        "code39" -> Lineares.code39(texto)
        "itf" -> Lineares.itf(texto)
        "itf14" -> Lineares.itf14(texto)
        "codabar" -> Lineares.codabar(
            texto,
            inicio = opcao("inicio") ?: "A",
            paragem = opcao("paragem") ?: "A",
            largo = opcoes.has("largo") && opcoes["largo"].asBoolean,
        )
        "code128" -> Code128.code128(texto)
        "code93" -> Code93.code93(texto)
        else -> throw IllegalArgumentException("tipo desconhecido: $tipo")
    }

    return descrever(codigo)
}

/**
 * Passa um [CodigoDeBarras] para JSON.
 *
 * **Os modulos saem como 0 e 1, e nao como `true` e `false`.** O Python devolve
 * `bool` e o gson le um `bool` de um numero, mas o outro sentido e' que nao ha
 * garantia: o script compara posicao a posicao, e um `true` onde se espera um `1`
 * contaria como divergencia num codigo que esta certo.
 *
 * **Os dois lados em 0 e 1 e' o unico valor que nao da duvida** — e nao uma
 * escolha de taste. Um booleano e' um inteiro em Python e um objecto em Java,
 * e o que o script le em primeiro lugar depende de como cada `stack` o escreve.
 */
private fun descrever(codigo: CodigoDeBarras): JsonObject {
    val modulos = JsonArray()
    for (modulo in codigo.modulos) {
        modulos.add(if (modulo) 1 else 0)
    }

    val guardas = JsonArray()
    for (guarda in codigo.guardas) {
        guardas.add(guarda)
    }

    val saida = JsonObject()
    saida.add("modulos", modulos)
    saida.addProperty("legenda", codigo.legenda)
    saida.add("guardas", guardas)
    return saida
}
