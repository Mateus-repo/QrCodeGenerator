package com.qrcodegen.core.pix

import com.qrcodegen.core.clean
import com.qrcodegen.core.digitsOnly
import com.qrcodegen.core.toAscii
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * O PIX: o unico formato de payload com estrutura, e o unico com regra.
 *
 * Espelha `python/qrcode_core/pix.py`, que e' a implementacao de referencia. A
 * `AGENTS.md` e' explicita: **a spec e' o arbitro**, e a spec sao os dez
 * vectores de `spec/vectors.json` mais o exemplo oficial do Banco Central. Este
 * ficheiro existe para os bater, e nao para concordar com o Python.
 */
object Pix {

    const val GUI = "br.gov.bcb.pix"
    const val COUNTRY_CODE = "BR"
    const val CURRENCY_BRL = "986"
    const val MCC_UNSPECIFIED = "0000"
    const val PAYLOAD_FORMAT_INDICATOR = "01"
    const val PLACEHOLDER_TXID = "***"
    const val POINT_OF_INITIATION_ONCE = "12"

    const val MAX_NAME = 25
    const val MAX_CITY = 15
    const val MAX_TXID = 25
    const val MAX_POSTCODE = 9
    const val MAX_EMAIL = 77

    /** O campo 26 nao pode passar de 99 bytes, e a descricao e' o que cresce. */
    private const val MAX_TEMPLATE_26 = 99

    private const val CRC_TAG = "6304"

    /**
     * O payload esta errado.
     *
     * **Estende `RuntimeException` e nao `IllegalArgumentException`, e a razao
     * e' uma armadilha de interop entre Kotlin e Java.** Em Kotlin,
     * `IllegalArgumentException` e' um `typealias` para uma classe **final**, e
     * nao se pode herdar dela; o que se pretendia escribir — herdar da
     * `IllegalArgumentException` do Java — da "This type is final". A tradecao
     * honesta e `RuntimeException`, que e' aberta e e' o que se queria dizer.
     */
    open class PixException(message: String) : RuntimeException(message)

    /** A chave nao e' uma chave PIX valida. */
    class PixKeyError(message: String) : PixException(message)

    /** O payload tem um campo invalido. */
    class PixValidationError(message: String) : PixException(message)

    /**
     * O CRC-16/CCITT-FALSE, o da norma, com o polinomio `0x1021`.
     *
     * **O `0xFFFF` do inicio e' o que o distingue do CRC-16/XModem**, que
     * comeca em `0x0000` e produz outro valor. O PIX usa o primeiro, e um
     * registo de QR de banco que use o segundo e' recusado por todos os
     * leitores - e o sintoma de um PIX recusado nao diz nada do CRC.
     */
    fun crc16(data: String): Int {
        var crc = 0xFFFF
        for (byte in data.toByteArray(Charsets.US_ASCII)) {
            crc = crc xor ((byte.toInt() and 0xFF) shl 8)
            repeat(8) {
                crc = if (crc and 0x8000 != 0) (crc shl 1) xor 0x1021 else (crc shl 1)
            }
        }
        return crc and 0xFFFF
    }

    fun crc16Hex(data: String): String = crc16(data).toString(16).uppercase().padStart(4, '0')

    /**
     * Aceita CPF/CNPJ com mascara, telefone sem `+55`, e email/UUID com a caixa
     * toda baralhada.
     *
     * **O `55` e' obligatorio no telefone, mas aceita-se escrever sem o `+` e
     * sem o 55** desde que sobrem 10 ou 11 digitos — DDD mais numero. Quem
     * escreve `11966666666` esta a dizer a mesma coisa que `+5511966666666`, e
     * pedir-lhe o `+` e' pedir duas vezes a mesma informacao.
     */
    fun normalizeKey(raw: String?): String {
        val key = toAscii(raw).trim()
        if (key.isEmpty()) throw PixKeyError("Indica a chave PIX.")

        if (key.contains('@')) return key.lowercase()

        // UUID: o `+` nao aparece, e um traço no meio e' o que o distingue de
        // um telefone com mascara.
        if (UUID_RE.matches(key)) return key.lowercase()

        val digits = digitsOnly(key)
        if (digits.isNotEmpty()) {
            val candidate = when {
                digits.length == 13 && digits.startsWith("55") -> "+55" + digits.substring(2)
                key.startsWith("+55") && digits.length in listOf(12, 13) ->
                    "+55" + digits.substring(2)

                key.startsWith("+") && digits.length in listOf(12, 13, 14) -> "+$digits"
                else -> null
            }
            if (candidate != null && isValidPhone(candidate)) return candidate

            // CPF (11) / CNPJ (14) escritos com ou sem mascara. **A mascara e'
            // `[\d\s.\-/]+` e nao alfanumerico**, porque uma chave alfanumerica
            // com mascara seria outra coisa e nao um CPF.
            if (digits.length in listOf(11, 14) && MASKED_NUMBER.matches(key)) return digits
        }

        return key
    }

    /** Valida a chave e devolve-a ja normalizada. */
    fun validateKey(raw: String?): String {
        val key = normalizeKey(raw)

        if (key.all { it.isDigit() }) {
            if (key.length == 11 && isValidCpf(key)) return key
            if (key.length == 14 && isValidCnpj(key)) return key
            throw PixKeyError(
                "CPF/CNPJ inválido (os dígitos verificadores não conferem). " +
                    "Se esta chave for um telefone, escreve com o indicativo +55.",
            )
        }

        if (key.startsWith("+")) {
            if (isValidPhone(key)) return key
            throw PixKeyError("Telefone inválido. Usa o formato +55 seguido de DDD e número.")
        }

        if (key.contains('@')) {
            if (isValidEmail(key)) return key
            throw PixKeyError("Email inválido como chave PIX.")
        }

        if (UUID_RE.matches(key)) return key

        throw PixKeyError("Esta chave não é um CPF, CNPJ, telefone, email ou chave aleatória válido.")
    }

    /** O tipo da chave, para mostrar ao utilizador. */
    fun keyType(raw: String?): String {
        val key = normalizeKey(raw)
        return when {
            UUID_RE.matches(key) -> "aleatória"
            key.contains('@') -> "email"
            key.startsWith("+") -> "telefone"
            key.length == 14 -> "cnpj"
            else -> "cpf"
        }
    }

    /**
     * O valor, como `Decimal`.
     *
     * **Aceita `,` e `.` e a separador de milhar, e a razao e' que a chave e'
     * brasileira.** `1.234,56` e' o que a pessoa escreve, e recusar por causa de
     * um ponto e' obriga-la a pensar na representacao da lingua dela no momento
     * em que esta a pensar no valor.
     */
    fun parseAmount(raw: String?): BigDecimal? {
        if (raw == null) return null
        var s = toAscii(raw).trim()
        if (s.isEmpty()) return null

        val lastComma = s.lastIndexOf(',')
        val lastDot = s.lastIndexOf('.')
        if (lastComma >= 0 && lastComma > lastDot) {
            // A virgula e' o decimal: os pontos sao separadores de milhar.
            s = s.replace(".", "").replace(',', '.')
        } else if (lastDot >= 0) {
            s = s.replace(",", "")
        }

        return s.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)
    }

    /** O payload de entrada. */
    data class Payload(
        val key: String,
        val name: String,
        val city: String,
        val amount: String? = null,
        val txid: String? = null,
        val description: String = "",
        val postcode: String = "",
        val singleUse: Boolean = false,
    )

    /** Um payload relido, com a chave ja validada. */
    data class Parsed(
        val key: String,
        val name: String,
        val city: String,
        val amount: BigDecimal?,
        val txid: String,
        val description: String = "",
        val postcode: String = "",
        val singleUse: Boolean = false,
    )

    /** O resultado de um `parse`, com o CRC verificado. */
    data class ParseResult(val payload: Parsed, val crcValid: Boolean)

    /**
     * Gera a string BR Code — o PIX copia e cola.
     *
     * **A ordem dos campos e' a da norma e nao se pode reordenar.** O `00` e' o
     * indicador de formato, o `26` e' a conta do recebedor, o `62` e' os dados
     * adicionais, e o `63` e' o CRC no fim. Um leitor que vae a procura do `26`
     * antes do `00` nao encontra a conta.
     */
    fun build(payload: Payload): String {
        val key = validateKey(payload.key)

        val name = clean(payload.name, MAX_NAME)
        if (name.isEmpty()) {
            throw PixValidationError("Indica o nome do recebedor (max. 25 caracteres).")
        }

        val city = clean(payload.city, MAX_CITY)
        if (city.isEmpty()) {
            throw PixValidationError("Indica a cidade do recebedor (max. 15 caracteres).")
        }

        val postcode = digitsOnly(payload.postcode).take(MAX_POSTCODE)
        val amount = parseAmount(payload.amount)

        val parts = mutableListOf(tlv("00", PAYLOAD_FORMAT_INDICATOR))
        if (payload.singleUse) parts.add(tlv("01", POINT_OF_INITIATION_ONCE))

        parts += listOf(
            tlv("26", merchantAccountTemplate(key, payload.description)),
            tlv("52", MCC_UNSPECIFIED),
            tlv("53", CURRENCY_BRL),
        )

        if (amount != null) parts.add(tlv("54", String.format(java.util.Locale.ROOT, "%.2f", amount)))

        parts += listOf(tlv("58", COUNTRY_CODE), tlv("59", name), tlv("60", city))
        if (postcode.isNotEmpty()) parts.add(tlv("61", postcode))
        parts.add(tlv("62", tlv("05", cleanTxid(payload.txid))))

        val body = parts.joinToString("") + CRC_TAG
        return body + crc16Hex(body)
    }

    /** Recalcula o CRC, para recuperar um codigo colado com o CRC trocado. */
    fun fixCrc(brcode: String): String {
        val cleaned = stripWrapping(brcode)
        if (!cleaned.contains(CRC_TAG)) {
            throw PixValidationError("O payload não tem o campo 63 (CRC16).")
        }
        val body = cleaned.substring(0, cleaned.lastIndexOf(CRC_TAG) + 4)
        return body + crc16Hex(body)
    }

    /**
     * Relê um payload colado.
     *
     * **O round-trip e' a unica verificacao que o PIX tem** — os outros dez nao
     * tem parser, e por isso que a verificacao deles e' a leitura pelo ZXing.
     */
    fun parse(brcode: String): ParseResult {
        val cleaned = stripWrapping(brcode)
        val fields = parseTlv(cleaned)

        val single = fields.firstOrNull { it.first == "01" }
        val account = fields.firstOrNull { it.first == "26" }
            ?: throw PixValidationError("O payload não tem o campo 26 (conta do recebedor).")

        val inner = parseTlv(account.second).associate { it.first to it.second }
        val key = inner["01"] ?: throw PixValidationError("O campo 26 não tem a chave.")

        val extra = fields.firstOrNull { it.first == "62" }
        val additional = extra?.let { parseTlv(it.second).associate { p -> p.first to p.second } }
            ?: emptyMap()

        val crc = fields.firstOrNull { it.first == "63" }?.second
        val body = if (crc == null) cleaned else cleaned.substring(0, cleaned.lastIndexOf(CRC_TAG) + 4)
        val crcValid = crc != null && crc16Hex(body).equals(crc, ignoreCase = true)

        val amount = fields.firstOrNull { it.first == "54" }?.second

        return ParseResult(
            payload = Parsed(
                key = validateKey(key),
                name = fields.firstOrNull { it.first == "59" }?.second.orEmpty(),
                city = fields.firstOrNull { it.first == "60" }?.second.orEmpty(),
                amount = amount?.toBigDecimalOrNull(),
                txid = additional["05"] ?: PLACEHOLDER_TXID,
                description = inner["02"].orEmpty(),
                postcode = fields.firstOrNull { it.first == "61" }?.second.orEmpty(),
                singleUse = single?.second == POINT_OF_INITIATION_ONCE,
            ),
            crcValid = crcValid,
        )
    }

    // --- O TLV -------------------------------------------------------------

    private fun tlv(tag: String, value: String) = String.format("%s%02d%s", tag, value.length, value)

    private fun parseTlv(data: String): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        var i = 0
        while (i + 4 <= data.length) {
            val tag = data.substring(i, i + 2)
            val declared = data.substring(i + 2, i + 4).toIntOrNull()
                ?: throw PixValidationError("O payload tem um comprimento inválido no campo $tag.")
            val end = i + 4 + declared
            if (declared < 0 || end > data.length) {
                throw PixValidationError("O campo $tag declara $declared bytes e o payload não chega lá.")
            }
            out.add(tag to data.substring(i + 4, end))
            i = end
        }
        return out
    }

    /**
     * O campo 26: `br.gov.bcb.pix` + a chave + a descricao.
     *
     * **A descricao e' truncada ao que resta, e nao aos 25 do nome.** O campo 26
     * tem um teto de 99 bytes e a chave come a maior parte deles; uma descricao
     * de 90 caracteres faz o payload ser recusado, e o erro que o banco da e'
     * "conteudo invalido" sem dizer qual.
     */
    private fun merchantAccountTemplate(key: String, description: String): String {
        val template = tlv("00", GUI) + tlv("01", key)
        if (description.isBlank()) return template

        val room = MAX_TEMPLATE_26 - template.length - 4
        if (room <= 0) return template

        val text = clean(description, room)
        return if (text.isEmpty()) template else template + tlv("02", text)
    }

    /**
     * O txid so pode ter letras e digitos, e no maximo 25.
     *
     * **O que nao for letra ou digito e' removido, e nao recusado.** Um txid com
     * um `-` e' commonplace, e o que interessa e' a referencia: remove-se o
     * separador e a referencia continua legivel.
     */
    private fun cleanTxid(raw: String?): String =
        toAscii(raw).filter { it.isLetterOrDigit() }.take(MAX_TXID).ifEmpty { PLACEHOLDER_TXID }

    /**
     * Tira o que um aplicacao cola em volta do payload: quebras de linha e tab.
     *
     * **O espaco nao se remove, e a razao e' o exemplo do Banco Central.**
     *
     * O `pix_uuid_sem_valor` da spec tem `5913Fulano de Tal` — treze caracteres
     * **com um espaco no meio** — e o comprimento declarado `'13'` conta-o. Uma
     * versao que tirava tambem os espacos deixava `FulanodeTal` com onze, e a
     * leitura perdia-se a meio: o `60` da cidade deixava de estar onde estava e
     * o `08` do comprimento da cidade era lido como uma etiqueta nova. O
     * sintoma era um `PixValidationError` a dizer "comprimento invalido" num
     * payload que estava certo.
     *
     * Python, C#, Java e o navegador tiram `
	` e mais nada. **E um espaco no
     * nome de uma pessoa e' o caso mais comum que existe**, e nao um caso de
     * bordo.
     */
    private fun stripWrapping(brcode: String): String =
        brcode.replace(Regex("[\\r\\n\\t]"), "")

    // --- A validacao da chave ----------------------------------------------

    private val UUID_RE = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        RegexOption.IGNORE_CASE,
    )

    private val MASKED_NUMBER = Regex("^[\\d\\s.\\-/]+$")

    /**
     * **O digito verificador do CPF e' um modulo de 11 duas vezes**, e nao uma
     * conta unica: o primeiro digito e' o resto de 10 multiplicado por
     * 10..2, e o segundo o de 11 multiplicado por 11..2.
     */
    private fun isValidCpf(value: String): Boolean {
        if (value.length != 11) return false
        if (value.toSet().size == 1) return false

        /*
         * **Os indices sao 9 e 10, e nao 1 e 2.**
         *
         * A primeira versao iterateva `pos` em `1..2` e usava o proprio `pos`
         * como indice, pelo que o primeiro digito era calculado sobre um digito
         * com os pesos de um indice 0. O resultado e' que **o CPF de exemplo da
         * spec — `529.982.247-25`, que e' valido — era recusado**, com a
         * mensagem de "os digitos verificadores nao conferem", que e'
         * exactamente a mensagem errada: os digitos conferem, a conta nao.
         *
         * O que faz o indice ser o ultimo digito e' que o peso do primeiro digito
         * e' 10 e o do nono e' 2: sao `10 - i` para i em 0..8.
         */
        for (position in listOf(9, 10)) {
            var total = 0
            for (i in 0 until position) total += value[i].digitToInt() * (position + 1 - i)
            var check = (total * 10) % 11
            if (check == 10) check = 0
            if (check != value[position].digitToInt()) return false
        }
        return true
    }

    /** O CNPJ e' o mesmo modulo, com os pesos 12..2 e 11..2. */
    private fun isValidCnpj(value: String): Boolean {
        if (value.length != 14) return false
        if (value.toSet().size == 1) return false

        val base = value.substring(0, 12)
        val first = checkDigit(base, listOf(5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
        if (first != value[12].digitToInt()) return false

        val second = checkDigit(value.substring(0, 13), listOf(6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
        return second == value[13].digitToInt()
    }

    private fun checkDigit(base: String, weights: List<Int>): Int {
        var sum = 0
        for (i in base.indices) sum += base[i].digitToInt() * weights[i]
        val resto = sum % 11
        return if (resto < 2) 0 else 11 - resto
    }

    /**
     * `+55` seguido de DDD (2 digitos) e numero (8 ou 9).
     *
     * **O DDD nao pode comecar por `0`, e essa e' a razao de o teste existir.**
     * O `+55` e' o pais e o que se segue e' o DDD e o numero, e um DDD comecado
     * por zero nao existe na numeracao brasileira. Sem esta verificacao o
     * `+550012345678` passava, e o banco devolvia "chave invalida" para um
     * numero que o usuario achava ter escrito bem.
     *
     * **A razao de o comprimento ser 10 ou 11 e' a mesma:** 8 digitos para um
     * telefone fixo antigo e 9 para um movel. O que sobra sao os dois do DDD.
     */
    private fun isValidPhone(value: String): Boolean {
        if (!value.startsWith("+55")) return false
        val digits = value.substring(3)
        if (digits.length != 10 && digits.length != 11) return false
        if (digits[0] == '0' || digits[1] == '0') return false
        return digits.all { it.isDigit() }
    }

    /**
     * O email tem de ter um `@` e um ponto no dominio, e caber em 77.
     *
     * **Um `@` a mais e' recusado, e nao se parte em dois.** A razao e' que a
     * chave vai para o QR sem aspas e o `parse` do banco divide no primeiro
     * `@`; um email com doisiebbe cair num dominio diferente do que a pessoa
     * escreveu, e o dinheiro ia para a conta errada. E' o tipo de falha que nao
     * aparece em nenhum erro devalidacao - o payload e' valido, so vai para o
     * sitio errado.
     *
     * **A parte local tem um conjunto de caracteres proprio**, e o `+` e' o mais
     * importante: `user+tag@exemplo.pt` e' um email valido e muitos clientes
     * tratam o `+` como uma caixa separada. Exclui-lo seria recusar um email que
     * existe.
     */
    private fun isValidEmail(value: String): Boolean {
        if (value.length > MAX_EMAIL) return false
        if (value.count { it == '@' } != 1) return false
        if (value.contains(' ')) return false

        val at = value.indexOf('@')
        val local = value.substring(0, at)
        val domain = value.substring(at + 1)
        if (local.isEmpty() || domain.isEmpty()) return false
        if (!domain.contains('.')) return false
        if (domain.startsWith('.') || domain.endsWith('.')) return false

        return local.all { it in EMAIL_LOCAL }
    }

    /**
     * Os caracteres de uma parte local de email, do RFC 5322.
     *
     * **O `.` e' valido numa parte local, e nao pode ser o primeiro nem o
     * ultimo.** E' uma excepcao que a maioria das implementacoes de validador
     * trata mal, e um `.` a mais faria o `parse` do banco receber um dominio
     * diferente.
     */
    private val EMAIL_LOCAL =
        (('A'..'Z') + ('a'..'z') + ('0'..'9') + "!#$%&'*+/=?^_`{|}~.-").toSet()
}
