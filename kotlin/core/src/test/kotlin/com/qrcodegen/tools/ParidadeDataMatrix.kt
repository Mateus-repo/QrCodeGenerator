package com.qrcodegen.tools

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.qrcodegen.core.simbologias.CodigoMatriz
import com.qrcodegen.core.simbologias.DataMatrix

import java.io.PrintStream

/**
 * Le uma lista de casos de Data Matrix e escreve as matrizes em JSON.
 *
 * Existe para o `spec/paridade-kotlin-datamatrix.mjs`: e' a ponta de Kotlin da
 * comparacao que decide se o Kotlin e o Python produzem a mesma grelha.
 *
 * ## Porque e' uma classe a parte do `ParidadeLineares`
 *
 * **Porque um codigo 2D nao cabe no formato de um 1D.** O `ParidadeLineares`
 * devolve `modulos` como uma lista plana, mais `legenda` e `guardas` — e as duas
 * ultimas nao existem num Data Matrix: as guias em L ja estao na grelha e nao ha
 * texto impresso por baixo.
 *
 * Encaixar os dois no mesmo formato daria duas consequencias, e as duas ruins:
 * com `guardas` e `legenda` a vazio, o script passava a comparar campos que nao
 * medem nada; com a matriz achatada numa lista, perdia-se a informacao de onde
 * muda a linha, e uma divergencia dizia "o modulo 137" em vez de dizer
 * "(linha 8, modulo 9)". **Um formato que nao descreve a coisa faz o teste
 * medir outra coisa** — que e' o que a `AGENTS.md` regista com o `ComboBox` do
 * C#.
 *
 * ## O que nao faz
 *
 * Nao manda o ZXing ler o resultado. O ZXing le a matriz, e a matriz e' o que se
 * compara aqui; acrescentar a leitura seria verificar duas vezes a mesma coisa e
 * dar a ilusao de mais cobertura. A leitura esta nos testes, e ai sim e' o
 * encoder que desenha.
 *
 * ## Porque vive nos testes, e nao no `main`
 *
 * **E' uma ferramenta de verificacao, e nao parte da biblioteca.** O `core` nao
 * sabe o que e' JSON e nao tem de saber. O Gson ja era dependencia de teste para a
 * spec, e por isso que fica aqui.
 */
fun main() {
    // **Os casos vao por stdin.** Passar JSON num argumento e' fragil: o Git Bash
    // faz expansao de chaves em `{"inicio":"B"}` e parte o array ao meio.
    //
    // **E o `Charsets.UTF_8` e' explicito, como no encoder**: o `String(bytes)`
    // sem argumento usa a codificacao da plataforma, e um payload com acentos
    // chegaria partido — o que daria uma divergencia que apontava para o Python,
    // **que estava certo**.
    val entrada = String(System.`in`.readBytes(), Charsets.UTF_8)
    val casos = JsonParser.parseString(entrada).asJsonArray

    val saida = JsonArray()
    for (caso in casos) {
        saida.add(codigoDe(caso.asJsonArray))
    }

    PrintStream(System.out, true, "UTF-8").println(saida)
}

/**
 * Um caso e' `[tipo, texto, {opcoes}]`, e o script monta-o assim.
 *
 * **O `tipo` existe mesmo com so um Data Matrix.** E' a mesma forma que a lista
 * partilhada usa para os 1D, e um dia entra aqui o GS1 Data Matrix — que nao e'
 * um encoder novo, e' o mesmo com uma lista de codewords em vez de um texto.
 */
private fun codigoDe(caso: JsonArray): JsonObject {
    val tipo = caso[0].asString

    val codigo: CodigoMatriz = when (tipo) {
        "datamatrix" -> DataMatrix.dataMatrix(caso[1].asString)
        "gs1-datamatrix" -> {
            val opcoes = caso[2].asJsonObject
            val brutos = opcoes.getAsJsonArray("codewords")
            val codewords = IntArray(brutos.size()) { brutos[it].asInt }
            val nome = if (opcoes.has("nome")) opcoes["nome"].asString else "GS1 Data Matrix"
            DataMatrix.dataMatrixDeCodewords(codewords, nome)
        }
        else -> throw IllegalArgumentException("tipo desconhecido: $tipo")
    }

    return descrever(codigo)
}

/**
 * Passa um [CodigoMatriz] para JSON.
 *
 * **Os modulos saem como 0 e 1, e nao como `true` e `false`.** O script compara
 * posicao a posicao, e um `true` onde se espera um `1` contaria como divergencia
 * num codigo que esta certo.
 *
 * **A matriz sai como lista de linhas, e nao achatada.** E' o que separa um
 * `datamatrix` de um `DataMatrix`: no achatado o script nao sabe onde muda a
 * linha, e uma divergencia dizia "o modulo 137" em vez de dizer "(linha 8,
 * modulo 9)" — que e' onde o problema esta'.
 */
private fun descrever(codigo: CodigoMatriz): JsonObject {
    val linhas = JsonArray()
    for (linha in codigo.modulos) {
        val modulos = JsonArray()
        for (modulo in linha) {
            modulos.add(if (modulo) 1 else 0)
        }
        linhas.add(modulos)
    }

    val saida = JsonObject()
    saida.add("modulos", linhas)
    saida.addProperty("colunas", codigo.colunas)
    saida.addProperty("linhas", codigo.linhas)
    saida.addProperty("dados", codigo.dados)
    saida.addProperty("correccao", codigo.correccao)
    saida.addProperty("usado", codigo.usado)
    return saida
}