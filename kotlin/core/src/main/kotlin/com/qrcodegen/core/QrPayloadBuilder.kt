package com.qrcodegen.core

import com.qrcodegen.core.pix.Pix

/**
 * Constroi o payload de uma categoria.
 *
 * **O `AGENTS.md` diz que a spec e' o arbitro e nao qualquer implementacao**, e
 * este ficheiro nao tem nenhuma das outras linguagens como referencia: tem os
 * 34 vectores de `spec/vectors.json`. Um payload que sai diferente aqui e' um
 * bug, mesmo que nenhum teste deste repositorio o veja — que e' precisamente o
 * que a spec existe para impedir.
 *
 * ## O que estes payloads nao sao
 *
 **Nao sao conformidade, sao transporte.** Um link e' um link e um contacto e' um
 * contacto: o formato nao impoe nada sobre o conteudo, e qualquer leitor abre o
 * que o payload mandar. A diferenca entre esta implementacao e a do navegador
 * esta no que o **leitor** faz, e por isso que o unico teste que importa e' o
 * ZXing ler a imagem e devolver a mesma string.
 */
object QrPayloadBuilder {

    /** O fim de linha do iCalendar, que **tem de ser CRLF**. */
    private const val ICAL_NEWLINE = "\r\n"

    /** O valor por omissao do `txid` do PIX: tres asteriscos. */
    private const val PLACEHOLDER_TXID = "***"

    fun build(category: QrCategory, f: QrFields): String = when (category) {
        QrCategory.LINK -> Normalize.normalizeUrl(f.url)
        QrCategory.TEXTO -> f.texto.trim()

        QrCategory.EMAIL -> {
            val to = f.mailTo.trim()
            val partes = buildList {
                if (f.mailSubject.isNotBlank()) add("subject=" + urlEncode(f.mailSubject.trim()))
                if (f.mailBody.isNotBlank()) add("body=" + urlEncode(f.mailBody.trim()))
            }
            if (partes.isEmpty()) "mailto:$to" else "mailto:$to?" + partes.joinToString("&")
        }

        QrCategory.TELEFONE -> "tel:" + Normalize.phone(f.phonePrefix, f.phoneNumber)

        QrCategory.SMS ->
            "SMSTO:" + Normalize.phone(f.phonePrefix, f.phoneNumber) + ":" + f.smsMessage

        QrCategory.WHATSAPP -> {
            val number = digitsOnly(Normalize.phone(f.phonePrefix, f.phoneNumber))
            if (f.waMessage.isEmpty()) "https://wa.me/$number"
            else "https://wa.me/$number?text=" + urlEncode(f.waMessage)
        }

        QrCategory.EVENTO -> buildICalEvent(f)
        QrCategory.LOCALIZACAO -> "geo:${round7(f.geoLat)},${round7(f.geoLng)}"
        QrCategory.WIFI -> buildWifi(f)
        QrCategory.VCARD -> buildVCard(f)

        QrCategory.PIX -> Pix.build(
            Pix.Payload(
                key = f.pixKey,
                name = f.pixName,
                city = f.pixCity,
                amount = f.pixAmount,
                txid = f.pixTxid.ifEmpty { PLACEHOLDER_TXID },
                description = f.pixDescription,
                postcode = f.pixPostcode,
                singleUse = f.pixSingleUse,
            ),
        )
    }

    private fun line(name: String, value: String) = "$name:$value$ICAL_NEWLINE"

    /**
     * Um convite para o calendario.
     *
     * **O `DTSTART` e' um horario flutuante, e nao um instante com fuso.** O
     * campo de onde vem nao tem fuso, e quem escreve 18:30 esta a dizer "as 18h30
     * aqui". Converter punha uma hora a mais no calendario de quem marcou, e o
     * C# e o Java faziam isso — com testes que afirmavam o bug.
     */
    private fun buildICalEvent(f: QrFields): String = buildString {
        append("BEGIN:VCALENDAR").append(ICAL_NEWLINE)
        append(line("VERSION", "2.0"))
        append(line("PRODID", "-//QrCodeGenerator//PT"))
        append(line("CALSCALE", "GREGORIAN"))
        append("BEGIN:VEVENT").append(ICAL_NEWLINE)
        append(line("DTSTAMP", stamp(f.eventStart)))
        append(line("DTSTART", stamp(f.eventStart)))
        append(line("DTEND", stamp(f.eventEnd)))
        append(line("SUMMARY", escapeICal(f.eventTitle.trim())))
        append(line("LOCATION", escapeICal(f.eventLocation.trim())))
        append(line("DESCRIPTION", escapeICal(f.eventDescription.trim())))
        append("END:VEVENT").append(ICAL_NEWLINE)
        append("END:VCALENDAR").append(ICAL_NEWLINE)
    }

    /**
     * Liga-se a uma rede sem escrever a password.
     *
     * **O terminador `;;` final e' obrigatorio** e um leitor que o exija recusa o
     * codigo sem ele.
     *
     * **Uma rede aberta nao tem `P:`, e um `P:` vazio e' pior do que nao ter** —
     * um telefone que o leia tenta a senha "" e falha de uma maneira diferente de
     * "nao ha password".
     */
    private fun buildWifi(f: QrFields): String {
        val auth = when (f.wifiSec) {
            "WEP" -> "WEP"
            "Aberto" -> "nopass"
            else -> "WPA"
        }

        return buildString {
            append("WIFI:")
            append("T:").append(auth).append(";")
            append("S:").append(escapeWifi(f.wifiSsid.trim())).append(";")
            if (auth != "nopass") append("P:").append(escapeWifi(f.wifiPass)).append(";")
            if (f.wifiHidden) append("H:true;")
            append(";")
        }
    }

    /**
     * Um contacto que se pode importar.
     *
     * **A ordem dos campos importa, e um `N` com o nome primeiro da um telefone
     * que mostra "Silva, Ana" como "Ana Silva".** A RFC 6350 poe a familia
     * primeiro, e por isso que o campo e' `familia;nome;extra;prefixo;sufixo` —
     * com tres separadores a mais no fim, porque sao cinco campos e so dois com
     * valor.
     *
     * **A `ADR` tem sete campos e a cidade e' a quarta**: `caixa;extensao;rua;
     * localidade;regiao;codigo-postal;pais`. Com so a cidade, ficam **tres**
     * separadores antes e tres depois — e a primeira versao deste codigo punha
     * dois, o que metia a cidade no campo da extensao.
     */
    private fun buildVCard(f: QrFields): String {
        val primeiro = f.vcFirstName.trim()
        val ultimo = f.vcLastName.trim()

        return buildString {
            append("BEGIN:VCARD").append(ICAL_NEWLINE)
            append(line("VERSION", "4.0"))
            append(line("FN", escapeICal("$primeiro $ultimo".trim())))
            append(line("N", escapeICal(ultimo) + ";" + escapeICal(primeiro) + ";;;"))
            append(line("PRODID", "-//QrCodeGenerator//PT"))

            if (f.vcOrg.isNotBlank()) append(line("ORG", escapeICal(f.vcOrg.trim())))
            if (f.vcRole.isNotBlank()) append(line("TITLE", escapeICal(f.vcRole.trim())))
            if (f.vcPhone.isNotBlank()) append(line("TEL;TYPE=cell", f.vcPhone.trim()))
            if (f.vcPhone2.isNotBlank()) append(line("TEL;TYPE=work", f.vcPhone2.trim()))
            if (f.vcEmail.isNotBlank()) append(line("EMAIL", f.vcEmail.trim()))

            val rua = f.vcStreet.trim()
            val cidade = f.vcCity.trim()
            val codigo = f.vcZip.trim()
            val pais = f.vcCountry.trim()

            // **Uma `ADR` com todos os campos vazios e' ruido**, que um telefone
            // mostra como uma morada em branco.
            if (rua.isNotEmpty() || cidade.isNotEmpty() || codigo.isNotEmpty() || pais.isNotEmpty()) {
                append(
                    line(
                        "ADR;TYPE=work",
                        ";;" + escapeICal(rua) + ";" + escapeICal(cidade) + ";;" +
                            escapeICal(codigo) + ";" + escapeICal(pais),
                    ),
                )
            }

            append(line("END", "VCARD"))
        }
    }
}
