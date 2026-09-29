package com.qrcodegen.core

import com.qrcodegen.core.pix.Pix

/**
 * A validacao dos onze tipos.
 *
 * ## A mensagem e' o produto
 *
 **Cada funcao devolve a mensagem, ou `null` quando esta tudo bem.** E o mesmo
 * contrato do Python, do C#, do Java e do navegador, e a razao e' a mesma: a
 * mensagem e' o que a pessoa ve no ecra, e as cinco stacks tem de dar a mesma
 * para o payload ser o mesmo. Uma mensagem reescrita numa das linguagens e' uma
 * app que deixa a pessoa preencher um campo que nao era para_fill.
 *
 * ## A ordem dentro de cada bloco conta
 *
 * Em `LOCALIZACAO`, a mensagem de "latitude invalida" vem antes da de "fora do
 * intervalo", **porque um valor que nao e' um numero nao tem intervalo.** A
 * primeira versao do Python validava o intervalo primeiro e dava "a latitude
 * tem de estar entre -90 e 90" para o texto `abc` — que e' uma mensagem
 * **falsa**: o problema nao e' o intervalo, e' o texto nao ser um numero.
 */
object QrValidator {

    /** A mensagem de erro, ou `null` se estiver tudo bem. */
    fun validate(category: QrCategory, f: QrFields): String? = when (category) {
        QrCategory.LINK -> try {
            Normalize.normalizeUrl(f.url)
            null
        } catch (e: Normalize.UrlError) {
            e.message
        }

        QrCategory.TEXTO -> if (f.texto.isBlank()) "Escreve algum texto." else null

        QrCategory.EMAIL -> {
            when {
                f.mailTo.isBlank() -> "Indica o destinatário do email."
                !f.mailTo.contains('@') || f.mailTo.startsWith('@') ||
                    f.mailTo.endsWith('@') || f.mailTo.contains(' ') ->
                    "O destinatário não parece um email válido."

                else -> null
            }
        }

        QrCategory.TELEFONE -> validatePhone(f, comSms = false)
        QrCategory.SMS -> validatePhone(f, comSms = true)
        QrCategory.WHATSAPP -> validatePhone(f, comSms = false)

        QrCategory.EVENTO -> {
            // **As duas datas em locals, e nao em smart casts.** O `QrFields` tem
            // propriedades mutaveis, e o Kotlin nao pode smart-cast de uma delas
            // para `LocalDateTime` porque outra thread as podia mudar entre a
            // verificacao e o uso. Compilar obrigou a trazer para locals, e o
            // motivo esta aqui para nao ser "simplificado" para dentro do `when`.
            val inicio = f.eventStart
            val fim = f.eventEnd
            when {
                f.eventTitle.isBlank() -> "Indica o título do evento."

                /*
                 * **A comparacao e' de objetos, e nao de cadeias.** O campo de
                 * onde vem tem o formato `AAAA-MM-DDTHH:MM`, e `LocalDateTime`
                 * compara pela data e pela hora, que e' o mesmo que a ordem
                 * lexica daria — sem introduzir fuso, que ja sabemos que e' a
                 * hora errada.
                 */
                inicio != null && fim != null && fim < inicio ->
                    "A data de fim não pode ser anterior à de início."

                else -> null
            }
        }

        QrCategory.LOCALIZACAO -> {
            /*
             * **A virgula decimal e' aceite na fronteira, e o `Double` ja esta
             * convertido aqui.** O `QrFields` guarda um `Double` porque e' o que
             * se multiplica e compara; a cadeia com virgula que a pessoa
             * escreve e' um problema da interface, e converte-la em `null` dava
             * "indica uma latitude valida" para um valor que estava la.
             */
            val lat = f.geoLat
            val lng = f.geoLng
            when {
                lat == null -> "Indica uma latitude válida (ex.: 38.7223)."
                lng == null -> "Indica uma longitude válida (ex.: -9.1393)."
                lat < -90.0 || lat > 90.0 -> "A latitude tem de estar entre -90 e 90."
                lng < -180.0 || lng > 180.0 -> "A longitude tem de estar entre -180 e 180."
                else -> null
            }
        }

        QrCategory.WIFI -> {
            val aberto = f.wifiSec.lowercase() == "aberto"
            when {
                f.wifiSsid.isBlank() -> "Indica o nome da rede (SSID)."
                f.wifiSsid.trim().length > 32 -> "O SSID tem mais de 32 caracteres."
                !aberto && f.wifiPass.isEmpty() -> "Indica a password da rede."
                !aberto && f.wifiPass.length > 63 -> "A password tem mais de 63 caracteres."
                else -> null
            }
        }

        QrCategory.VCARD -> {
            val todosVazios = listOf(f.vcFirstName, f.vcLastName, f.vcPhone, f.vcPhone2, f.vcEmail)
                .all { it.isBlank() }
            when {
                todosVazios -> "Preenche pelo menos um campo do contacto."
                f.vcEmail.isNotBlank() &&
                    (!f.vcEmail.contains('@') || f.vcEmail.startsWith('@') ||
                        f.vcEmail.endsWith('@')) -> "O email não parece válido."

                else -> null
            }
        }

        // **O PIX valida-se a si proprio**, e devolvemos a primeira mensagem que
        // aparecer. E' o unico formato com regra, e a regra esta no `build`.
        QrCategory.PIX -> try {
            QrPayloadBuilder.build(QrCategory.PIX, f)
            null
        } catch (e: Pix.PixException) {
            e.message
        }
    }

    /**
     * O telefone, e o corpo do SMS quando vier.
     *
     * **O comprimento minimo de 4 digitos esta aqui para apanhar o "12"**, que
     * e' o que uma pessoa escreve quando a interface lhe da um campo curto e ela
     * assume que e' um codigo postal. Um `tel:+35112` nao marca ninguem.
     */
    private fun validatePhone(f: QrFields, comSms: Boolean): String? {
        if (f.phoneNumber.isBlank()) return "Indica o número de telefone."
        if (Normalize.phonePrefix(f.phonePrefix).isEmpty()) {
            return "Indica o indicativo do país (ex.: +351)."
        }
        if (digitsOnly(f.phoneNumber).length < 4) return "O número de telefone é curto demais."

        if (comSms && f.smsMessage.isNotEmpty() && !isSmsSafe(f.smsMessage)) {
            return "A mensagem tem caracteres que um SMS não suporta (ex.: { } [ ] ~ ^ | EUR)."
        }

        return null
    }
}
