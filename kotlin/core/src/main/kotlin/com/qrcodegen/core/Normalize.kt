package com.qrcodegen.core

import java.time.LocalDateTime

/**
 * Normalizacao de telefone e de URL, partilhada por varias categorias.
 *
 * Espelha `web/payloads/normalize.js` e `python/qrcode_core/tipos.py`.
 */
object Normalize {

    private val SCHEME_AT_START = Regex("^([A-Za-z][A-Za-z0-9+.-]*):")

    /**
     * Os esquemas que um leitor sabe abrir.
     *
     * **A lista e' fechada e e' o que impede um QR de executar codigo.** O
     * `javascript:` nao e' "nao suportado", e' perigoso: um leitor que o obeyecesse
     * correria o que o codigo mandasse. Os dois casos estao separados no
     * `validate` precisamente para isso — a mensagem de "nao permitido" diz ao
     * utilizador que o problema e' o esquema, e a de "nao suportado" parece um
     * bug.
     */
    val ALLOWED_SCHEMES = listOf("http", "https", "mailto", "tel", "sms", "geo", "wifi")

    /** Os que podem executar codigo no leitor. */
    val DANGEROUS_SCHEMES = listOf("javascript", "data", "file", "vbscript", "about", "blob")

    /**
     * O link nao pode ir para um QR code.
     *
     * **`RuntimeException` e nao `IllegalArgumentException`**, que em Kotlin e' um
     * `typealias` para uma classe final e nao se pode herdar. A mesma armadilha
     * que no `PixException`, e a mesma correccao.
     */
    class UrlError(message: String) : RuntimeException(message)

    /**
     * Normaliza o indicativo de pais: `00` ou `351` -> `+351`.
     *
     * **O `00` e' reconhecido em qualquer posicao**, e nao so no inicio. A
     * primeira versao so o convertia no inicio, e o mesmo numero dava resultados
     * diferentes conforme a maneira como era colado.
     */
    fun phonePrefix(raw: String?): String {
        var p = toAscii(raw).trim()
        if (p.isEmpty()) return ""

        p = when {
            p.startsWith("00") -> "+" + p.substring(2)
            !p.startsWith("+") -> "+$p"
            else -> p
        }

        val soDigitos = digitsOnly(p.substringAfter('+'))
        if (soDigitos.isEmpty()) return ""

        return if (p.contains('+')) "+$soDigitos" else soDigitos
    }

    /** Numero de telefone so com digitos, ja com o indicativo. */
    fun phone(prefix: String?, number: String?): String =
        phonePrefix(prefix) + digitsOnly(number)

    /**
     * Acrescenta o esquema em falta e recusa os que possam executar codigo.
     *
     * @throws UrlError com a mensagem que a interface mostra.
     */
    fun normalizeUrl(raw: String?): String {
        val url = raw.orEmpty().trim()
        if (url.isEmpty()) throw UrlError("Indica um link.")

        val achado = SCHEME_AT_START.find(url) ?: return "https://$url"
        val scheme = achado.groupValues[1].lowercase()

        // **Os perigosos primeiro, e a ordem importa.** Um `javascript:` tem de
        // dar a mensagem de "nao permitido" e nao a de "nao suportado", que e'
        // mais Compos e menos util.
        if (scheme in DANGEROUS_SCHEMES) {
            throw UrlError("O esquema '$scheme:' nao e' permitido num QR code.")
        }

        if (scheme !in ALLOWED_SCHEMES) {
            val lista = ALLOWED_SCHEMES.joinToString(", ") { "$it:" }
            throw UrlError("Esquema '$scheme:' nao suportado. Usa $lista.")
        }

        return url
    }
}

/**
 * O corpo de um SMS aceita o conjunto de caracteres de um SMS?
 *
 * **E' o GSM 03.38, e nao "o que e' imprimivel".** A diferenca e' o que apanha
 * um texto que devia passar: o `a` com til nao existe no GSM, e por isso que o
 * `sms_com_mensagem` da spec nao leva acentos — um caso que a propria validacao
 * desta stack recusa nao pode estar na spec.
 *
 * **O `€` existe, no GSM estendido**, e por isso que o conjunto nao pode ser
 * "tudo o que e' imprimivel em ISO-8859-1". O `£` e o `¥` tambem, e o `¤` do
 * conjunto base tambem.
 */
fun isSmsSafe(message: String?): Boolean {
    if (message.isNullOrEmpty()) return true
    return message.all { it in SMS_GSM_SET }
}

/**
 * O conjunto, como uma cadeia plana e separada por um espaco no fim.
 *
 * **A cadeia e' plana e o `.toSet()` e' no fim, e nao `CharRange + String`.**
 * A primeira versao somava um `CharRange` com uma cadeia, e o Kotlin resolve
 * essa soma com `T` inferido para `Any` — o conjunto ficava `Set<Any>` e, por
 * razoes que so se veem a executar, o espaco, a virgula e os parenteses
 * disappeared da verificacao. Um conjunto de caracteres escrito como
 * expressao e' um conjunto de caracteres que ninguem le.
 *
 * **O espaco no fim e' o que mantem o espaco no conjunto.** Uma cadeia de
 * caracteres que comeca por um espaco e' indistinguivel de uma que nao comeca,
 * e o espaco e' o primeiro caracter que um SMS tem.
 */
private const val SMS_GSM =
    "0123456789" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "abcdefghijklmnopqrstuvwxyz" +
    " -.,!?()'*+/:&%$£$¥€=#@" +
    "\"_<>;" +
    "¤"

private val SMS_GSM_SET: Set<Char> = SMS_GSM.toSet()

/** Coordenada do formulario, com virgula ou ponto decimal. */
fun parseCoord(value: String?): Double? {
    val s = value?.trim()?.replace(',', '.') ?: return null
    if (s.isEmpty()) return null

    /*
     * **O `toDouble` e' a razao de isto ser uma funcao e nao um `toDouble()`
     * directo.** O `toDoubleOrNull` do Kotlin devolve `null` para um numero
     * invalido, que e' indistinguivel de um campo vazio — e a interface tem de
     * dizer "indica uma latitude valida" e nao "indica uma latitude".
     */
    return s.toDoubleOrNull()?.takeIf { it.isFinite() }
}

/** Sete casas, e sem notacao cientifica. */
internal fun round7(value: Double?): String {
    if (value == null) return ""
    val s = String.format(java.util.Locale.ROOT, "%.7f", value)
    return s.trimEnd('0').trimEnd('.').ifEmpty { "0" }
}

/**
 * O carimbo de hora do iCalendar, **sem converter e sem `Z`**.
 *
 * **A razao de nao passar por `ZonedDateTime`:** o `datetime-local` da interface
 * nao tem fuso, e quem escreve 18:30 esta a dizer "as 18h30 **aqui**".
 *
 * **O `DTSTAMP` sem data continua em UTC**, porque diz **quando o evento foi
 * criado** e nao quando acontece — e essa distincao e' o que separa as duas
 * coisas que se confundem com o mesmo nome.
 */
internal fun stamp(value: LocalDateTime?): String {
    if (value == null) return java.time.LocalDateTime.now()
        .atZone(java.time.ZoneOffset.UTC)
        .format(ICAL_STAMP_UTC)
    return value.format(ICAL_STAMP)
}

private val ICAL_STAMP = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")
private val ICAL_STAMP_UTC = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
