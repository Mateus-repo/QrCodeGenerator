package com.qrcodegen.core.simbologias

/**
 * Code 128, com os conjuntos escolhidos pelo encoder.
 *
 * ## O que torna este formato diferente dos outros tres
 *
 * **O Code 128 tem tres conjuntos, e o encoder escolhe qual usar.** Nos outros a
 * tabela e' uma e nao ha escolha; aqui a mesma letra pode valer uma coisa no
 * conjunto A e outra no B, e o codigo pode comutar de conjunto a meio. E' essa
 * liberdade que o torna compacto, e e' ela que traz os caracteres de comuta.
 *
 * **Sem os caracteres de comuta o codigo desenha-se perfeito e o leitor devolve
 * outra coisa.** Foi assim que o bug apareceu da primeira vez: `ABC123` voltava
 * como `ABC,3`, porque o `,` e' o caracter de comuta para o conjunto C lido como
 * dado. **Nenhum teste estrutural o apanha** — o codigo tem o comprimento certo
 * e a silhueta certa, e so a leitura diz.
 *
 * ## E o digito de verificacao
 *
 * **Modulo 103**, sobre a soma ponderada: o valor de inicio mais o valor de cada
 * caracter multiplicado pela sua posicao. E' o **resto** da divisao, e nao o que
 * falta para dar inteiro — o contrario do EAN-13 e do ITF-14, que sao
 * `(10 - soma % 10) % 10`. Tres simbologias, tres formulas, e a do Code 128 e'
 * contraria das outras duas. E' por isso que aqui se escreve a conta: um
 * comentario que descreve a regra ao contrario convida a "corrigir" tres stacks.
 */
object Code128 {

    /** Os valores de inicio, por conjunto: A, B, C. */
    private val INICIO = intArrayOf(0, 103, 104, 105)

    /** Os valores que mudam de conjunto a meio da leitura. */
    private val IR_PARA = intArrayOf(0, 101, 100, 99)

    /** O valor da paragem, que nao e' um dado. */
    private const val PARAGEM = 106

    /**
     * Code 128, com os conjuntos escolhidos pelo encoder.
     */
    @JvmStatic
    fun code128(valor: String): CodigoDeBarras = _code128(valor, 0)

    /**
     * Code 128, com o conjunto forcado.
     *
     * @param conjuntoForcado `1`, `2` ou `3`; `0` deixa o encoder escolher
     */
    @JvmStatic
    fun code128(valor: String, conjuntoForcado: Int): CodigoDeBarras {
        if ((conjuntoForcado != 0 && conjuntoForcado < 1) || conjuntoForcado > 3) {
            throw SimbologiaException("Code 128: o conjunto tem de ser A, B ou C.")
        }
        return _code128(valor, conjuntoForcado)
    }

    /**
     * O valor de um caracter ASCII dentro de um conjunto.
     *
     * **No A, os valores 0 a 63 sao o proprio ASCII e os 64 a 95 sao as
     * maiusculas com 32 subtraidos** — e' a diferenca entre o conjunto A e o B.
     * `A` vale 33 no A e 65 no B, e e' essa diferenca que torna a troca de
     * conjunto obrigatoria em vez de opcional.
     */
    private fun valorNoConjunto(c: Char, conjunto: Int): Int {
        val codigo = c.code
        return if (conjunto == 1) {
            if (codigo <= 63) codigo else codigo - 32
        } else {
            codigo - 32
        }
    }

    private fun isDigito(c: Char): Boolean = c in '0'..'9'

    /**
     * O conjunto em que vale a pena codificar a partir desta posicao.
     *
     * **Dois digitos seguidos vao em C**, porque dois caracteres cabem num so
     * valor de 0 a 99. **Um digito isolado nao**: sair de B para C e voltar
     * custa tres caracteres para gravar um, e o codigo fica maior sem ganho.
     */
    private fun melhorConjunto(texto: String, i: Int): Int {
        if (i + 1 < texto.length &&
            isDigito(texto[i]) && isDigito(texto[i + 1])
        ) {
            return 3
        }
        if (texto[i].code < 32) return 1
        return 2
    }

    /**
     * Com que conjunto se comeca.
     *
     * **So o C vale a pena quando ha quatro digitos seguidos** — ai cada par
     * gasta um caracter em vez de dois, e o ganho paga a troca. Com dois digitos
     * o C poupa um caracter e a troca custa um: fica igual, e nao vale a pena.
     *
     * **O A so quando o texto comeca por um controlo.** As maiusculas vivem em A
     * e em B com o mesmo valor, e o B tambem transporta os minusculos, portanto
     * comecar em A para uma letra nao traria nada.
     */
    private fun conjuntoInicial(texto: String): Int {
        if (texto[0].code < 32) return 1

        var i = 0
        while (i + 3 < texto.length) {
            var quatro = true
            for (k in 0 until 4) {
                if (!isDigito(texto[i + k])) {
                    quatro = false
                    break
                }
            }
            if (quatro) return 3
            i++
        }
        return 2
    }

    /**
     * O texto na lista de valores, ja com as trocas de conjunto.
     *
     * **A cada posicao pergunta-se qual e' o melhor conjunto para o que vem a
     * seguir, e se for diferente do em que estamos emite-se o caracter de
     * troca.**
     */
    private fun valores(texto: String, conjuntoForcado: Int): IntArray {
        var conjunto = if (conjuntoForcado > 0) conjuntoForcado else conjuntoInicial(texto)
        val saida = ArrayList<Int>()
        saida.add(INICIO[conjunto])

        var i = 0
        while (i < texto.length) {
            val desejado = if (conjuntoForcado > 0) {
                conjuntoForcado
            } else {
                melhorConjunto(texto, i)
            }

            if (desejado != conjunto) {
                saida.add(IR_PARA[desejado])
                conjunto = desejado
            }

            if (conjunto == 3) {
                saida.add(texto.substring(i, i + 2).toInt())
                i += 2
            } else {
                saida.add(valorNoConjunto(texto[i], conjunto))
                i += 1
            }
        }

        return saida.toIntArray()
    }

    private fun _code128(valor: String, conjuntoForcado: Int): CodigoDeBarras {
        val texto = valor.ifEmpty { "" }

        if (texto.isEmpty()) {
            throw SimbologiaException("Code 128: o texto esta vazio.")
        }

        for (c in texto) {
            if (c.code == 128) {
                throw SimbologiaException(
                    "Code 128: o valor 128 e' o da paragem e nao pode estar nos dados."
                )
            }
            if (c.code > 127) {
                throw SimbologiaException(
                    "Code 128: so ASCII, e '" + c + "' (U+" +
                        c.code.toString(16).uppercase().padStart(4, '0') +
                        ") nao e. Para acentos e alfabetos nao latinos use o QR."
                )
            }
        }

        val dados = valores(texto, conjuntoForcado)

        // **Modulo 103 sobre a soma ponderada**, e o resto e' o digito.
        var soma = dados[0]
        for (i in 1 until dados.size) {
            soma += dados[i] * i
        }
        val verificacao = soma % 103

        val todos = ArrayList<Int>(dados.size + 2)
        todos.addAll(dados.asList())
        todos.add(verificacao)
        todos.add(PARAGEM)

        val grelha = ArrayList<Boolean>()
        for (valor in todos) {
            grelha.addAll(modulosDoValor(valor))
        }

        // **Sem guardas.** O Code 128 nao tem barras-guarda como o EAN, e a
        // barra final da paragem e' a referencia. Marca-las fazia-as descer mais
        // do que o leitor espera — um `guardas` de `[0, len-1]` dava um codigo
        // que o ZXing lia e um leitor de etiqueta recusava.
        return CodigoDeBarras(
            "Code 128", grelha.toBooleanArray(), IntArray(0), texto
        )
    }

    /**
     * Os modulos de um valor, alternando barra e espaco a partir da barra.
     *
     * **A posicao e' que diz a cor, e nao o digito da cadeia** — a cadeia so
     * tem `0` e `1` para dizer a largura, e a barra inicial e' sempre barra.
     */
    private fun modulosDoValor(valor: Int): List<Boolean> {
        if (valor < 0 || valor > PARAGEM) {
            throw SimbologiaException("Code 128: o valor $valor nao existe")
        }

        val cadeia = if (valor == PARAGEM) {
            Tabelas.CODE128_PARAGEM
        } else {
            Tabelas.CODE128_PADROES[valor]
        }

        val saida = ArrayList<Boolean>(cadeia.length)

        // **As larguras leem-se nas corridas**: a cadeia e' a soma das larguras
        // dos seis elementos, e nao os elementos. Uma corrida de um e' um
        // elemento estreito, e uma de tres e' um largo.
        //
        // E o que separa barra de espaco e' **o numero do elemento**, que e' o
        // mesmo que o numero da corrida. Nao e' o indice do caracter dentro da
        // cadeia: passar esse dava a cor errada sempre que uma corrida tinha
        // mais de um caracter, e um simbolo de 11 modulos saia com 12.
        var elementos = 0
        var i = 0
        while (i < cadeia.length) {
            val bit = cadeia[i]
            var largura = 0
            while (i < cadeia.length && cadeia[i] == bit) {
                largura++
                i++
            }
            empurrar(largura, elementos, saida)
            elementos++
        }

        return saida
    }

    /**
     * Acrescenta um elemento, com a cor que a sua posicao decide.
     *
     * @param largura quantos modulos o elemento ocupa
     * @param elemento o numero do elemento, a partir de zero; par e' barra
     */
    private fun empurrar(largura: Int, elemento: Int, saida: MutableList<Boolean>) {
        val escuro = elemento % 2 == 0
        repeat(largura) { saida.add(escuro) }
    }

    /**
     * Os valores que o encoder escolheu, para quem quiser ver a decisao.
     *
     * **E' o que permite testar a troca de conjuntos sem descodificar nada**, e
     * sem isso a unica forma de afirmar que o `ABC123` comuta seria ler a imagem
     * — que e' um teste de leitura a fingir ser estrutural.
     */
    @JvmStatic
    fun valoresDe(texto: String): IntArray = valores(texto, 0)

    /**
     * O digito de verificacao de um texto, sem passar pelo encoder.
     *
     * **Modulo 103**, o resto da soma ponderada. Existe para o teste afirmar a
     * regra do digito sem duplicar a conta — que era o que fazia o comentario do
     * Code 39 descrever a regra ao contrario sem ninguem dar por isso.
     */
    @JvmStatic
    fun verificacao(texto: String): Int {
        val dados = valores(texto, 0)
        var soma = dados[0]
        for (i in 1 until dados.size) {
            soma += dados[i] * i
        }
        return soma % 103
    }
}
