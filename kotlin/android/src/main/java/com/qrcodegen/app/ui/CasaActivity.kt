package com.qrcodegen.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.qrcodegen.core.QrCategory
import com.qrcodegen.core.QrFields
import com.qrcodegen.core.QrPayloadBuilder
import com.qrcodegen.core.QrValidator
import java.time.LocalDateTime

/**
 * A tela da fase zero: escolher um tipo, preencher, ver o payload.
 *
 * ## O que esta tela mostra e o que ela ainda nao mostra
 *
 * Mostra o **payload** e a validacao, que e' o que o `:core` sabe garantir. **Nao
 * mostra o QR**, porque o encoder ainda nao existe no `:core` e um QR gerado por
 * um segundo caminho dentro da app seria um encoder sem nenhuma verificacao por
 * leitura — que e' o que a `AGENTS.md` diz que nunca entra no repositorio.
 */
@Composable
fun CasaActivity() {
    /*
     * **Um `mutableStateOf` e nao um `remember { QrFields() }`, e a diferenca e'
     * que a primeira versao nao aceitava um caracter.**
     *
     * O Compose so re-renderiza quando o valor do estado muda **de identidade**. Um
     * `remember { QrFields() }` devolve sempre o mesmo objecto, e `f.url = "x"` nao
     * cria outro — o Compose nao ve nada, o `OutlinedTextField` fica com `""` e o
     * teclado e' recusado. A app arrancava, mostrava a mensagem de validacao e
     * **nao aceitava escrita nenhuma**. Só se descobre a escrever, e é por isso que
     * esta nota não é um Forecast: é a razão de o `QrFields` ser uma `data class`
     * no `:core`, e a razão está escrita lá.
     */
    var campos by remember { mutableStateOf(QrFields()) }
    var categoria by remember { mutableStateOf(QrCategory.LINK) }

    val erro = remember(categoria, campos) { QrValidator.validate(categoria, campos) }
    val payload = remember(categoria, campos) {
        if (erro == null) runCatching { QrPayloadBuilder.build(categoria, campos) }.getOrNull() else null
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("QrCodeGenerator", style = MaterialTheme.typography.headlineSmall)

        SelectorCategoria(categoria) { nova ->
            categoria = nova
        }

        CamposDaCategoria(categoria, campos) { novos -> campos = novos }

        if (erro != null) {
            Text(erro, color = MaterialTheme.colorScheme.error)
        }

        if (payload != null) {
            Text("Payload", style = MaterialTheme.typography.titleMedium)
            Text(
                text = payload,
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("${payload.length} caracteres", style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun SelectorCategoria(atual: QrCategory, aoMudar: (QrCategory) -> Unit) {
    var aberto by remember { mutableStateOf(false) }

    Column {
        Button(onClick = { aberto = true }) {
            Text("${atual.label}  ▾")
        }
        DropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
            for (c in QrCategory.entries) {
                DropdownMenuItem(
                    text = { Text(c.label) },
                    onClick = {
                        aoMudar(c)
                        aberto = false
                    },
                )
            }
        }
    }
}

/**
 * Os campos da categoria, num `when` exaustivo.
 *
 * **E' o que substitui onze listas de campos escritas a mao.** Nao ha `else`, e o
 * compilador obriga a tratar cada categoria: um tipo novo sem tratamento aqui da
 * um erro de compilacao, e nao um ecra vazio. Onze listas teriam onze sitios para
 * um tipo aparecer num e noutro — que e' o modo de falha que a `AGENTS.md`
 * descreve do GS1-128, que entrou no registo e nao apareceu no selector.
 *
 * **Cada alteracao passa um `QrFields` novo**, nunca o mesmo objecto mudado. E a
 * razao de o `editar` existir em vez de um `f.url = it`: o Compose re-renderiza
 * por identidade, e mutar no sitio nao produz nenhum.
 */
@Composable
private fun CamposDaCategoria(
    categoria: QrCategory,
    campos: QrFields,
    aoMudar: (QrFields) -> Unit,
) {
    /*
     * **`campos.copy()` e nao `QrFields()`.** E' a diferenca entre uma app que
     * funciona e uma que apaga o que a pessoa escreveu.
     *
     * A primeira versao fazia `QrFields().apply { ... }`, que cria um objecto
     * **novo** e escreve num unico campo — e apaga todos os outros. No `link`
     * nunca se viu, porque ha um campo so; no PIX, cada tecla limpava a chave e o
     * nome, e so o ultimo campo escrito sobrevivia. **Uma app que aceita texto e
     * o perde a seguir nao da erro, nao rebenta, e o sintoma e' "a app nao
     * guarda nada"** — que e' o que se descobre a preencher um formulario a sério.
     *
     * O `copy()` e' que resolve as duas coisas de uma vez: preserva o resto e
     * cria a identidade nova que o Compose precisa para re-renderizar.
     */
    fun editar(alteracao: QrFields.() -> Unit) = aoMudar(campos.copy().apply(alteracao))

    @Composable
    fun Campo(rotulo: String, valor: String, multiplasLinhas: Boolean = false, aplicar: (String) -> Unit) {
        OutlinedTextField(
            value = valor,
            onValueChange = aplicar,
            label = { Text(rotulo) },
            singleLine = !multiplasLinhas,
            minLines = if (multiplasLinhas) 3 else 1,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    when (categoria) {
        QrCategory.LINK ->
            Campo("Endereço", campos.url) { v -> editar { url = v } }

        QrCategory.TEXTO ->
            Campo("Texto", campos.texto, multiplasLinhas = true) { v ->
                editar { texto = v }
            }

        QrCategory.EMAIL -> {
            val f = campos
            Campo("Para", f.mailTo) { v -> editar { mailTo = v } }
            Campo("Assunto", f.mailSubject) { v -> editar { mailSubject = v } }
            Campo("Corpo", f.mailBody, multiplasLinhas = true) { v -> editar { mailBody = v } }
        }

        QrCategory.TELEFONE, QrCategory.WHATSAPP -> {
            val f = campos
            Campo("Indicativo", f.phonePrefix) { v -> editar { phonePrefix = v } }
            Campo("Número", f.phoneNumber) { v -> editar { phoneNumber = v } }
            if (categoria == QrCategory.WHATSAPP) {
                Campo("Mensagem", f.waMessage, multiplasLinhas = true) { v -> editar { waMessage = v } }
            }
        }

        QrCategory.SMS -> {
            val f = campos
            Campo("Indicativo", f.phonePrefix) { v -> editar { phonePrefix = v } }
            Campo("Número", f.phoneNumber) { v -> editar { phoneNumber = v } }
            Campo("Mensagem", f.smsMessage, multiplasLinhas = true) { v -> editar { smsMessage = v } }
            Text(
                "O euro e o cifrão entram; o til e a chave não — é o GSM 03.38.",
                style = MaterialTheme.typography.labelSmall,
            )
        }

        QrCategory.EVENTO -> {
            val f = campos
            Campo("Título", f.eventTitle) { v -> editar { eventTitle = v } }
            Campo("Início (AAAA-MM-DDTHH:MM)", f.eventStart?.toString().orEmpty()) { v ->
                editar { eventStart = dataOuNull(v) }
            }
            Campo("Fim (AAAA-MM-DDTHH:MM)", f.eventEnd?.toString().orEmpty()) { v ->
                editar { eventEnd = dataOuNull(v) }
            }
            Campo("Local", f.eventLocation) { v -> editar { eventLocation = v } }
            Text(
                "A hora sai como a escreveste, sem fuso. Um horário flutuante é o " +
                    "que o calendário de cada pessoa lê na hora de cada pessoa.",
                style = MaterialTheme.typography.labelSmall,
            )
        }

        QrCategory.LOCALIZACAO -> {
            val f = campos
            Campo("Latitude", f.geoLat?.toString().orEmpty()) { v -> editar { geoLat = numeroOuNull(v) } }
            Campo("Longitude", f.geoLng?.toString().orEmpty()) { v -> editar { geoLng = numeroOuNull(v) } }
        }

        QrCategory.WIFI -> {
            val f = campos
            Campo("Nome da rede (SSID)", f.wifiSsid) { v -> editar { wifiSsid = v } }
            Campo("Segurança (WPA/WPA2, WEP, Aberto)", f.wifiSec) { v -> editar { wifiSec = v } }
            Campo("Password", f.wifiPass) { v -> editar { wifiPass = v } }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = f.wifiHidden, onCheckedChange = { v -> editar { wifiHidden = v } })
                Text("  Rede oculta")
            }
        }

        QrCategory.VCARD -> {
            val f = campos
            Campo("Nome", f.vcFirstName) { v -> editar { vcFirstName = v } }
            Campo("Apelido", f.vcLastName) { v -> editar { vcLastName = v } }
            Campo("Email", f.vcEmail) { v -> editar { vcEmail = v } }
            Campo("Telefone", f.vcPhone) { v -> editar { vcPhone = v } }
            Campo("Organização", f.vcOrg) { v -> editar { vcOrg = v } }
            Campo("Cargo", f.vcRole) { v -> editar { vcRole = v } }
            Campo("Morada", f.vcStreet) { v -> editar { vcStreet = v } }
            Campo("Localidade", f.vcCity) { v -> editar { vcCity = v } }
            Campo("Código postal", f.vcZip) { v -> editar { vcZip = v } }
            Campo("País", f.vcCountry) { v -> editar { vcCountry = v } }
        }

        QrCategory.PIX -> {
            val f = campos
            Campo("Chave PIX", f.pixKey) { v -> editar { pixKey = v } }
            Campo("Nome (max. 25)", f.pixName) { v -> editar { pixName = v } }
            Campo("Cidade (max. 15)", f.pixCity) { v -> editar { pixCity = v } }
            Campo("Valor", f.pixAmount) { v -> editar { pixAmount = v } }
            Campo("Estado", f.pixPostcode) { v -> editar { pixPostcode = v } }
            Campo("Descrição", f.pixDescription) { v -> editar { pixDescription = v } }
            Campo("txid", f.pixTxid) { v -> editar { pixTxid = v } }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = f.pixSingleUse, onCheckedChange = { v -> editar { pixSingleUse = v } })
                Text("  Uso único")
            }
        }
    }
}

/**
 * A hora escrita no campo, ou `null` se nao for uma hora.
 *
 * **Um `null` e nao um erro, e a razao e' o `QrValidator`.** O campo aceita o que
 * a pessoa escreve, e e' o validador que diz "a data de fim nao pode ser
 * anterior a de inicio" ou nao diz nada. **Um `LocalDateTime` falso** — o valor
 * minimo quando o texto nao parseia — punha o evento em 1 de Janeiro do ano 1, e
 * o QR desenhava-se e lia-se com a data errada.
 */
private fun dataOuNull(texto: String): LocalDateTime? =
    texto.trim().takeIf { it.isNotEmpty() }?.let { runCatching { LocalDateTime.parse(it) }.getOrNull() }

/** A vírgula decimal do português, e `null` para o que nao e' numero. */
private fun numeroOuNull(texto: String): Double? =
    texto.trim().replace(',', '.').toDoubleOrNull()
