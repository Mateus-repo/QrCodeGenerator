package com.qrcodegen.core

import java.time.LocalDateTime

/**
 * Campos de entrada, por categoria. **So os campos da categoria escolhida sao
 * lidos**, e por isso que um `QrFields` com tudo vazio e' um objecto valido.
 *
 * ## Os nomes sao os da spec, e nao por acaso
 *
 * `mailTo`, `wifiSsid`, `vcFirstName`, `eventTitle`. Sao os nomes que o
 * navegador usa em `types.js` e os que `spec/vectors.json` traz em `campos`.
 *
 * **O PIX e' a excepcao, e a excepcao tem razao**: os campos do PIX chamam-se
 * `pixKey`, `pixName`, `pixCity` aqui, e chamam-se `key`, `name`, `city` na spec.
 * Traduzir seria uma segunda traducao entre a spec e a verdade do PIX, e a
 * `AGENTS.md` diz que essa traducao e' onde as stacks divergem sem dar conta.
 *
 * ## Por que e' uma data e nao uma cadeia
 *
 * Porque `datetime-local` nao tem fuso, e uma cadeia esconderia isso. **O
 * `LocalDateTime` nao tem fuso nenhum**, que e' exactamente o que o campo tem, e
 * por isso que o `DTSTART` sai como foi escrito, sem `Z` — um `Z` que ninguem
 * escreveu punha uma hora a mais no calendario. O C# e o Java faziam
 * `ToUniversalTime()`, e os testes de ambos afirmavam o bug.
 *
 * ## Porque e' uma `data class`, e e' a parte que custou uma app inutil
 *
 * **O Compose so re-renderiza quando o valor que observa muda de identidade.** Uma
 * classe normal com `var` e' o mesmo objecto antes e depois de `f.url = "x"`; o
 * `mutableStateOf` compara por identidade, nao ve mudanca nenhuma, e o
 * `OutlinedTextField` que recebe `value = f.url` fica com `""` para sempre.
 *
 * O sintoma e' o pior desta classe de bug: **a app arranca, nao rebenta, e a
 * mensagem de validacao aparece** — parece que funciona. Mas o campo aceita o
 * foco, o teclado sobe, e nao entra um unico caracter, porque o valor que o
 * campo mantem nunca muda e o teclado e' recusado. Só se descobre a escrever.
 *
 * Com `data class`, o `copy(url = "x")` cria um objecto **novo**, o
 * `mutableStateOf` ve a mudanca pela igualdade estrutural, e o Compose
 * re-renderiza. E a igualdade estrutural tambem evita re-renderizacoes a mais,
 * que e' o outro lado do mesmo argumento.
 *
 * **Nada disto precisa de Compose no `:core`**, e e' o que a fronteira do modulo
 * exige: o core e' Kotlin/JVM puro e corre os 34 vectores sem Android nenhum.
 */
data class QrFields(
    var url: String = "",
    var texto: String = "",
    var mailTo: String = "",
    var mailSubject: String = "",
    var mailBody: String = "",
    var phonePrefix: String = "+351",
    var phoneNumber: String = "",
    var smsMessage: String = "",
    var waMessage: String = "",
    var eventTitle: String = "",
    var eventDescription: String = "",
    var eventLocation: String = "",
    var eventStart: LocalDateTime? = null,
    var eventEnd: LocalDateTime? = null,
    var geoLat: Double? = null,
    var geoLng: Double? = null,
    var wifiSsid: String = "",
    var wifiPass: String = "",
    var wifiSec: String = "WPA/WPA2",
    var wifiHidden: Boolean = false,
    var vcFirstName: String = "",
    var vcLastName: String = "",
    var vcPhone: String = "",
    var vcPhone2: String = "",
    var vcEmail: String = "",
    var vcOrg: String = "",
    var vcRole: String = "",
    var vcStreet: String = "",
    var vcCity: String = "",
    var vcZip: String = "",
    var vcCountry: String = "",

    // O PIX: os nomes daqui sao pixKey/pixName/pixCity, e na spec sao key/name/city.
    var pixKey: String = "",
    var pixName: String = "",
    var pixCity: String = "",
    var pixAmount: String = "",
    var pixTxid: String = "",
    var pixDescription: String = "",
    var pixPostcode: String = "",
    var pixSingleUse: Boolean = false,
)
