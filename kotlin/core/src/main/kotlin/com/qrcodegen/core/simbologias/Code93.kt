package com.qrcodegen.core.simbologias

/**
 * O Code 93.
 *
 * **E' o codigo de barras dos automoveis e da defesa**, e o unico que transporta
 * os 128 caracteres ASCII com a mesma correccao de erros — e ao mesmo tempo e'
 * **compacto demais**: seis caracteres, tres barras e tres espacos, onde o Code
 * 39 usa nove elementos por caracter.
 *
 * ## Onde e' que ele ganha ao Code 39
 *
 * A razao esta no numero de elementos. O Code 39 e' "sete de nove e dois de
 * cinco", porque cada caracter e' um start, seis barras e espacos, e um stop — e
 * o espaco entre caracteres e' um espaco estreito. **O Code 93 nao tem
 * separacao**: os caracteres correm uns nos outros, e a barra de inicio e a de
 * fim servem de separador.
 *
 * Isso da um codigo **13% mais curto** para o mesmo texto, e o Code 93 acrescenta
 * uma correccao de erros que o Code 39 nao tem — sao os dois digitos de controlo.
 *
 * ## Os dois digitos de controlo
 *
 * Ao contrario do Code 39, que tem um, o Code 93 tem **dois**, com pesos
 * diferentes: o primeiro pesa 1 a 20 e o segundo 1 a 15, ambos aplicados de tras
 * para a frente. E' o que torna o codigo seguro contra a inversao de dois
 * caracteres, que o Code 39 nao apanha.
 *
 * ## As tabelas sao geradas, e nao escritas
 *
 * Nem os 48 padroes nem os pares de escape estao neste ficheiro. Vem do
 * `spec/gerar-tabelas-code93.py`, que os extrai do `Code93Reader.java` do
 * ZXing — **a mesma fonte que o leitor usa para verificar o que este encoder
 * produz**.
 *
 * **E a correccao do bug do web nao foi corrigir a escada: foi nao haver
 * escada.** O encoder do web tinha os pares de escape escritos a mao, e vinte e
 * quatro dos trinta e dois caracteres de controlo estavam errados — o CR saia
 * como o algarismo `0`, e o ZXing devolvia um `0` onde estava um CR. Aqui o par
 * e' uma busca, e **uma busca nao diverge entre linguagens porque a fonte e' a
 * tabela**.
 *
 * ## O `Char` do Kotlin
 *
 * **`c.code` e' o `Int` do caracter**, e nao ha conversao implicita de `Char`
 * para `Int`. E' a mesma razao pela qual o `TabelasCode93.INDICE` e' um
 * `associate` com `it.index`: escrever `for (i in 0 until 48)` e mais rapido de
 * escrever, e da um `Int` onde o indice e' um `Int` — **mas `ALFABETO[i]` e' um
 * `Char` e nao um `Int`, e e' ai que a diferenca aparece**.
 */
object Code93 {

    /** O indice de cada caracter da tabela, para a busca ao inverso. */
    private val INDICE: Map<Char, Int> = TabelasCode93.INDICE

    /**
     * Codifica em Code 93.
     *
     * @param valor o que codificar. ASCII, minusculas e tudo — as minusculas e os
     *   controlos sao o que o Code 93 tem e o Code 39 nao.
     * @throws SimbologiaException se o texto estiver vazio, trouxer um asterisco,
     *   ou trouxer um caractere acima de 127
     */
    fun code93(valor: String): CodigoDeBarras {
        val texto = validar(valor)

        // **O texto passa pela codificacao estendida antes de qualquer outra
        // coisa.** A tabela tem 48 entradas e nenhuma delas e' uma minuscula nem
        // um caracter de controlo, e a `CONTROLES` da' ja o que vai no codigo: uma
        // letra para os valores e duas para os que precisam de escape.
        //
        // **O `forEach` sobre a cadeia e' o que torna isto correcto.** A entrada
        // tem uma letra ou duas, e o `checksum` conta **um caracter de cada vez**:
        // juntar a entrada como uma cadeia daria um digito diferente em qualquer
        // texto com minusculas.
        val estendido = ArrayList<Char>()
        for (caractere in texto) {
            val escape = TabelasCode93.CONTROLES[caractere.code]
                ?: throw SimbologiaException(
                    "Code 93: o caractere '$caractere' nao tem par de escape"
                )
            for (letra in escape) {
                estendido.add(letra)
            }
        }

        val verificacao = doisControlos(estendido)

        // **O asterisco no inicio e no fim, e nao e' opcional.** E' o start e o
        // stop do Code 93, e sem eles o leitor nao sabe onde comeca o codigo. A
        // razao de ser o **mesmo** nas duas pontas, e nao dois caracteres
        // diferentes, e' que o Code 93 nao tem start e stop proprios como o Code 39:
        // usa um caractere normal da tabela, que o leitor reconhece pela forma.
        val asterisco = TabelasCode93.ALFABETO[TabelasCode93.ASTERISCO]
        val comAsteriscos = ArrayList<Char>(estendido.size + 3)
        comAsteriscos.add(asterisco)
        comAsteriscos.addAll(estendido)
        comAsteriscos.add(verificacao[0])
        comAsteriscos.add(verificacao[1])
        comAsteriscos.add(asterisco)

        val modulos = ArrayList<Boolean>()
        val guardas = ArrayList<Int>()

        for (i in comAsteriscos.indices) {
            // Os asteriscos do inicio e do fim sao as guardas: sao o unico ponto de
            // referencia que o leitor tem, porque o Code 93 nao tem barras de guarda
            // como o EAN. Descem mais para se verem a olho.
            if (i == 0 || i == comAsteriscos.size - 1) {
                guardas.add(modulos.size)
            }

            modulos.addAll(modulosDo(comAsteriscos[i]))
        }

        // **A barra de terminacao.** O ZXing acrescenta **uma barra preta** no fim,
        // depois da barra de fim, e sem ela o codigo nao le. Nao e' um start nem um
        // stop: e' a unica barra solitaria do codigo, e o que da ao leitor a certeza
        // de que leu ate ao fim.
        modulos.add(true)

        val legenda = StringBuilder()
        for (caractere in estendido) {
            legenda.append(caractere)
        }
        legenda.append(verificacao[0]).append(verificacao[1])

        return CodigoDeBarras("Code 93", modulos.toBooleanArray(),
            guardas.toIntArray(), legenda.toString())
    }

    /**
     * Os dois digitos de controlo.
     *
     * **O segundo e' calculado sobre o texto mais o primeiro**, e o texto e' uma
     * lista de caracteres. Juntar o digito como caractere e' correcto.
     */
    private fun doisControlos(texto: List<Char>): CharArray {
        val primeiro = checksum(texto, 20)

        val comPrimeiro = ArrayList<Char>(texto.size + 1)
        comPrimeiro.addAll(texto)
        comPrimeiro.add(TabelasCode93.ALFABETO[primeiro])

        val segundo = checksum(comPrimeiro, 15)

        return charArrayOf(
            TabelasCode93.ALFABETO[primeiro],
            TabelasCode93.ALFABETO[segundo],
        )
    }

    /**
     * A soma ponderada, com o peso a reiniciar em [maximo].
     *
     * **O peso reinicia quando passa o maximo, e nao quando chega ao fim.** O
     * sintoma do que nao reinicia e' o mais enganador de todos os codigos de
     * barras: o codigo desenha-se bem, o primeiro digito bate certo e o segundo
     * nao, e o leitor recusa por checksum **sem dizer qual dos dois**.
     */
    private fun checksum(texto: List<Char>, maximo: Int): Int {
        var peso = 1
        var total = 0

        for (i in texto.indices.reversed()) {
            val indice = INDICE[texto[i]]
                ?: throw SimbologiaException(
                    "Code 93: '${texto[i]}' nao esta no alfabeto, e o checksum nao "
                        + "sabe o indice. A tabela esta errada."
                )

            total += peso * indice
            peso += 1
            if (peso > maximo) {
                peso = 1
            }
        }

        return total % TabelasCode93.MODULO_CHECKSUM
    }

    /**
     * Os nove modulos de um padrao.
     *
     * **O padrao sao os nove modulos, um a um, do mais significativo para o
     * menos**, e nao larguras a extrair nem pares de bits. E' a leitura ao
     * inverso do `appendPattern` do ZXing, bit a bit.
     *
     * **Tres versoes erraram aqui, e as tres por tentar ser espertas** — uma leu
     * pares de dois bits a comecar em espaco, outra pôs o comprimento nos dois
     * bits altos, e uma terceira contou as runs de zeros. Nenhuma deu os nove
     * modulos, e a soma de nove e' o que teria dizendo logo qual das hipoteses
     * era a boa.
     */
    private fun modulosDo(caractere: Char): List<Boolean> {
        val indice = INDICE[caractere]
            ?: throw SimbologiaException("Code 93: '$caractere' nao tem padrao.")

        val padrao = TabelasCode93.PADROES[indice]

        val modulos = ArrayList<Boolean>(9)
        for (i in 0 until 9) {
            modulos.add(((padrao shr (8 - i)) and 1) == 1)
        }

        // **O que se verifica aqui e' que o primeiro modulo e' uma barra**, que e' a
        // propriedade de que o leitor depende para ancorar. Um padrao que comece em
        // espaco desenha-se bem e nao e' lido por nada.
        //
        // **E o `spec/gerar-tabelas-code93.py` verifica o mesmo nos 48 valores**,
        // antes de os escrever. Aqui e' a segunda verificacao do mesmo invariante, e
        // nao e' redundancia: o gerador protege a tabela, e isto protege o codigo de
        // uma tabela que um dia chegue errada de outra fonte.
        if (!modulos[0]) {
            throw SimbologiaException(
                "Code 93: o padrao '$caractere' (0x${padrao.toString(16)}) comeca em "
                    + "espaco, e o leitor precisa de uma barra para ancorar. "
                    + "A tabela esta errada."
            )
        }

        return modulos
    }

    /**
     * O que o Code 93 aceita, e o que recusa com a razao.
     *
     * **O asterisco e' a marca de inicio e de fim, e nao pode estar nos dados.**
     * Um asterisco nos dados faz o leitor terminar a leitura ali, e o que vem a
     * seguir e' lido como lixo. **O codigo desenha-se e le-se — a metade, que e'
     * pior do que nao ler nada, porque parece que leu.**
     */
    private fun validar(valor: String): String {
        if (valor.isEmpty()) {
            throw SimbologiaException("Code 93: o texto esta vazio.")
        }

        if (valor.contains('*')) {
            throw SimbologiaException(
                "Code 93: o asterisco e' a marca de inicio e de fim, e nao pode estar "
                    + "nos dados. Passou \"$valor\"."
            )
        }

        for (caractere in valor) {
            val codigo = caractere.code
            if (codigo > 127) {
                throw SimbologiaException(
                    "Code 93 e ASCII e '$caractere' (U+%04X) nao e. "
                        .format(codigo)
                        + "Para acentos ou alfabetos nao latinos, usa QR."
                )
            }
        }

        return valor
    }
}
