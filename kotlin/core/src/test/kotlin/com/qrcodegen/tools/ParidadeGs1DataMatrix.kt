package com.qrcodegen.tools

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.qrcodegen.core.simbologias.CodigoGs1
import com.qrcodegen.core.simbologias.CodigoGs1Matriz
import com.qrcodegen.core.simbologias.Gs1_DataMatrix
import com.qrcodegen.core.simbologias.SimbologiaException
import java.io.PrintStream

/**
 * A ponta de Kotlin da comparacao do **GS1 DataMatrix**, e a saida em JSON.
 *
 * Existe para o `web/tests/paridade-gs1-datamatrix-kotlin.py`, que decide se o Kotlin
 * e o Python produzem a mesma coisa.
 *
 * **E' uma ponta a parte, e nao mais um `when` no [ParidadeGs1], por duas razoes:** o
 * GS1 DataMatrix devolve uma **matriz** (e o GS1-128 devolve uma lista de modulos) e
 * devolve **os codewords**, que o `CodigoDeBarras` nao tem. E **os codewords sao a
 * comparacao que apanha**: um `232` no sitio errado da o mesmo numero de modulos e
 * le-se com o campo partido.
 *
 * **E' uma ferramenta de verificacao, nao parte da aplicacao.** Vive no
 * `sourceSets["test"]`, pelo mesmo motivo que o [ParidadeGs1]: nao ha razao para o
 * `core` saber o que e' JSON.
 */
fun main() {
    val entrada = System.`in`.readBytes().toString(Charsets.UTF_8)

    val casos = JsonParser.parseString(entrada).asJsonArray
    val saida = JsonArray()

    for (caso in casos) {
        saida.add(descrever(caso.asJsonArray))
    }

    PrintStream(System.out, true, "UTF-8").println(saida)
}

/**
 * Um caso e' `[texto]`, e a saida tem o que der ou `erro`.
 *
 * **Uma recusa e' um resultado, e nao uma excecao.** A primeira versao deixava a
 * excecao sair, e o script via um stack trace em vez de um caso - o que dava uma falha
 * que nao dizia qual dos dois encoder recusou.
 */
private fun descrever(caso: JsonArray): JsonObject {
    val texto = caso[0].asString

    val saida = JsonObject()
    saida.addProperty("texto", texto)

    val codigo: CodigoGs1Matriz
    try {
        codigo = Gs1_DataMatrix.gs1DataMatrix(texto)
    } catch (e: SimbologiaException) {
        saida.addProperty("erro", e.message)
        return saida
    }

    // **Os modulos saem como 0 e 1, e nao como `true` e `false`.** O script compara
    // posicao a posicao, e um `true` onde se espera um `1` contaria como divergencia num
    // codigo que esta certo.
    val modulos = JsonArray()
    for (linha in codigo.codigo().modulos) {
        val uma = JsonArray()
        for (modulo in linha) {
            uma.add(if (modulo) 1 else 0)
        }
        modulos.add(uma)
    }

    // **Os codewords sao a comparacao principal**, e nao a imagem.
    val codewords = JsonArray()
    for (cw in codigo.codigo().codewords) {
        codewords.add(cw)
    }

    saida.add("modulos", modulos)
    saida.add("codewords", codewords)
    saida.addProperty("separadores", codigo.separadores())
    saida.addProperty("payload", codigo.payload())
    saida.addProperty("gs1", codigo.gs1())
    saida.addProperty("legenda", codigo.legenda())
    saida.addProperty("colunas", codigo.codigo().colunas)
    saida.addProperty("linhas", codigo.codigo().linhas)

    val campos = JsonArray()
    for (campo in codigo.campos()) {
        val um = JsonObject()
        um.addProperty("ai", campo.ai)
        um.addProperty("valor", campo.valor)
        um.addProperty("conteudo", campo.conteudo)
        um.addProperty("separador", campo.separador)
        um.addProperty("numerico", campo.numerico)
        campos.add(um)
    }
    saida.add("campos", campos)

    return saida
}