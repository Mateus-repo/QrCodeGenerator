package com.qrcodegen.tools

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.qrcodegen.core.simbologias.CodigoGs1
import com.qrcodegen.core.simbologias.Gs1_128
import com.qrcodegen.core.simbologias.SimbologiaException
import java.io.PrintStream

/**
 * A ponta de Kotlin da comparacao do GS1-128, e a saida em JSON.
 *
 * Existe para o `spec/paridade-gs1-kotlin.mjs`, que decide se o Kotlin e o Python
 * produzem a mesma coisa. O comprimento e' igual e a silhueta pode estar errada, e so
 * a comparacao modulo a modulo as distingue.
 *
 * **E' uma ponta a parte, e nao mais um `when` no [ParidadeLineares], porque o
 * GS1-128 devolve tres textos.** O `CodigoDeBarras` tem `legenda` e mais nada, e o
 * GS1-128 tem `payload`, `gs1` e `legenda` - tres representacoes do mesmo codigo.
 * Encaixar o GS1-128 naquele `when` obrigava a perder dois dos tres.
 *
 * **E' a segunda ponta a parte, e o mesmo motivo que a do Data Matrix.** O
 * `AGENTS.md` manda que os 2D nao se misturem com os 1D porque o teste passa a
 * medir outra coisa; aqui e' o mesmo por outra razao - a forma do resultado e'
 * diferente e um `when` com um `return` so aceita um.
 *
 * **E' uma ferramenta de verificacao, nao parte da aplicacao.** Vive no
 * `sourceSets["test"]`, pelo mesmo motivo que a [ParidadeLineares]: nao ha razao
 * para o `core` saber o que e' JSON.
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
 * excecao sair, e o script via um stack trace em vez de um caso - o que dava uma
 * falha que nao dizia qual dos dois encoder recusou.
 */
private fun descrever(caso: JsonArray): JsonObject {
    val texto = caso[0].asString

    val saida = JsonObject()
    saida.addProperty("texto", texto)

    val codigo: CodigoGs1
    try {
        codigo = Gs1_128.gs1_128(texto)
    } catch (e: SimbologiaException) {
        saida.addProperty("erro", e.message)
        return saida
    }

    val modulos = JsonArray()
    for (modulo in codigo.modulos) {
        // **Os modulos saem como 0 e 1, e nao como `true` e `false`.** O script
        // compara posicao a posicao, e um `true` onde se espera um `1` contaria
        // como divergencia num codigo que esta certo.
        modulos.add(if (modulo) 1 else 0)
    }

    saida.add("modulos", modulos)
    saida.addProperty("separadores", codigo.separadores)
    saida.addProperty("payload", codigo.payload)
    saida.addProperty("gs1", codigo.gs1)
    saida.addProperty("legenda", codigo.legenda)

    val campos = JsonArray()
    for (campo in codigo.campos) {
        val um = JsonObject()
        um.addProperty("ai", campo.ai)
        um.addProperty("valor", campo.valor)
        um.addProperty("conteudo", campo.conteudo)
        um.addProperty("separador", campo.separador)
        campos.add(um)
    }
    saida.add("campos", campos)

    return saida
}