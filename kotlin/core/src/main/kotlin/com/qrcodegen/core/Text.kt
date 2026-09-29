package com.qrcodegen.core

/**
 * Normalizacao de texto, partilhada por todos os tipos de payload.
 *
 * Espelha `web/payloads/text.js` e `python/qrcode_core/tipos.py`. Alterar aqui e'
 * alterar la — e a `AGENTS.md` diz que a regra nao e' "as linguagens tem de ser
 * iguais", e' "a spec tem de ser obedecida": o arbrito e' `spec/vectors.json`, e
 * este ficheiro existe para o obedecer.
 *
 * ## O comprimento conta-se em caracteres e os protocolos contam bytes
 *
 * E' por isso que a maior parte daqui normaliza para ASCII. **Acentos e emojis
 * sao a causa numero um de payloads que "parecem certos" e sao recusados**: o
 * limite de um QR e' em bytes, e um emoji que a pessoa conta como um caracter
 * gasta quatro.
 *
 * @param collapse `false` preserva os espacos tal como estao. E' o que o leitor
 *   de PIX precisa, para nao mexer nos comprimentos declarados.
 */
fun toAscii(value: String?, collapse: Boolean = true): String {
    if (value == null) return ""

    var ascii = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
        .replace(NON_SPACING_MARK, "")

    /*
     * **As ligaduras ANTES da remocao dos nao-ASCII, e a ordem e' o que faz
     * funcionar.** Trocar depois seria tarde, porque o caracter ja nao estaria
     * la.
     */
    for ((ligadura, letras) in LIGADURAS) {
        ascii = ascii.replace(ligadura, letras)
    }

    ascii = ascii.replace(NON_ASCII, "")

    return if (collapse) ascii.trim().replace(WHITESPACE, " ") else ascii
}

/** Normaliza, colapsa espacos e corta ao limite indicado. */
fun clean(value: String?, maxLength: Int): String {
    val ascii = toAscii(value)
    return if (ascii.length <= maxLength) ascii else ascii.take(maxLength).trim()
}

/**
 * Escapa texto de iCalendar / vCard: `\`, `;`, `,` e quebras de linha.
 *
 * **A ordem das substituicoes conta, e por isso que isto e' uma funcao e nao
 * quatro linhas soltas.** Escapar o `;` antes da barra invertida punha duas
 * barras em cada separador, e o telefone lia o campo inteiro como um so.
 *
 * **O `:` nao se escapa, e isso e' correcto.** No iCalendar so `;`, `,`, a barra
 * e a quebra de linha separam; o `:` e' o separador entre o *nome* da propriedade
 * e o *valor*, e escapar-lo punha uma barra a mais num campo cujo nome ja tem
 * dois pontos.
 *
 * **As aspas tambem nao se escapam**, e a razao e' a mesma: o vCard escapa `\`,
 * `;` e `,`, e as aspas nao sao delimitadores de valor — sao um caracter normal
 * dentro de um.
 */
fun escapeICal(value: String?): String {
    if (value.isNullOrEmpty()) return ""

    val texto = value
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")

    /*
     * **A quebra de linha vira `\n` de duas partes: uma barra e um `n`.**
     *
     * A armadilha e' que um `\n` dentro de uma cadeia Kotlin e' uma **quebra de
     * linha**, nao a sequencia barra-n. E' isso que fez o `escape_ical` do Python
     * devolver uma quebra de linha em vez de `\n`, e partir o `.ics` em duas
     * linhas com o telefone a ler so a primeira. `"\\n"` e' que da a sequencia, e
     * o `CRLF` e' normalizado primeiro para nao deixar um `\r` a sobrar.
     */
    return texto.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")
}

/**
 * Escapa um valor WiFi: `\`, `;`, `,`, `:` e `"`.
 *
 * **Um `:` a mais e' o pior dos cinco**, porque o `P:` a seguir e' lido como
 * parte do SSID e o telefone liga a uma rede que nao existe.
 */
fun escapeWifi(value: String?): String {
    if (value.isNullOrEmpty()) return ""

    /*
     * **A substituicao e' uma FUNCAO, e nao uma cadeia — e e' a terceira vez
     * que esta armadilha aparece neste repositorio.**
     *
     * Numa cadeia de substituicao, o `\\` e' um escape e o `$1` e' a referencia
     * ao primeiro grupo. `"\\$1"` em Kotlin produz literalmente `$1` seguido de
     * uma barra invertida, e o resultado era `Rede$1 Com$1 Separadores` — que
     * desenha um QR, se le, e liga a uma rede que nao existe.
     *
     * O Python teve o mesmo bug pelo outro lado: `re.sub` processa escapes na
     * cadeia como processa na expressao. **Passar uma funcao desliga as
     * substituicoes todas** e o valor entra literal.
     */
    return WIFI_SEPARATORS.replace(value) { "\\" + it.value }
}

/** Os cinco caracteres que o formato WiFi trata como separador. */
private val WIFI_SEPARATORS = Regex("([\\\\;,:\"])")
/**
 * Percent-encoding para query strings.
 *
 * **Da `%20` e nunca `+`**, como o `encodeURIComponent` do navegador. O `+` e'
 * espaco em `application/x-www-form-urlencoded` mas nao num QR, e um leitor que
 * descodifique com a regra errada transforma os espacos do assunto de um email
 * em `+`.
 */
fun urlEncode(value: String?): String {
    if (value.isNullOrEmpty()) return ""

    /*
     * O `URLEncoder` do Java da `+` para o espaco, que e' a resposta errada
     * aqui. **Trocar os dois no fim em vez de escrever o encoder a mao** e' o
     * que faz isto bater com o navegador, e o comentario na substituicao diz
     * porque e' seguro: o `+` que trocamos so pode ter vindo de um espaco, e o
     * que veio de um `+` literal ja esta como `%2B` e nao se toca nele.
     */
    return java.net.URLEncoder.encode(value, Charsets.UTF_8)
        .replace("+", "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")
}

/** So digitos. */
fun digitsOnly(value: String?): String = value.orEmpty().filter { it.isDigit() }

private val NON_SPACING_MARK = Regex("\\p{Mn}")

/**
 * As ligaduras que o NFD **nao** decompoe.
 *
 * **`œ` e' o caso, e `cœur` dava `cur` — nas duas linguagens que já tinham.**
 * Ao contrario do `ç`, que vem `c` mais cedilha e o NFD separa, o `œ` e' um
 * caracter unico, o *modifier letter small oe*, e o `NON_SPACING_MARK` nao o
 * apanha. A remocao dos nao-ASCII de seguida apaga-o.
 *
 * **Um nome com ligadura e' courant em frances e esta em Portugal**, e um QR que
 * le `cur` mostra o nome errado na etiqueta — e o nome errado e' o que a pessoa
 * vai ler no documento.
 *
 * Nao se usa `NFKD`, que resolveria tambem mas decompunha o que nao se quer: o
 * `№` viraria `No`.
 */
private val LIGADURAS = listOf(
    "œ" to "oe", "Œ" to "OE",
    "æ" to "ae", "Æ" to "AE",
    "ĳ" to "ij", "Ĳ" to "IJ",
    "ǳ" to "dz", "ǲ" to "Dz", "Ǳ" to "DZ",
    "ǉ" to "lj", "ǈ" to "Lj", "Ǌ" to "LJ",
    "ǌ" to "nj", "ǋ" to "Nj", "Ǎ" to "Nj",
    "ſ" to "s",
)

private val NON_ASCII = Regex("[^\\x00-\\x7F]")

private val WHITESPACE = Regex("\\s+")
