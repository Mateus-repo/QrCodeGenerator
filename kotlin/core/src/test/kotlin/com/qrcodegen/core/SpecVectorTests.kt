package com.qrcodegen.core

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.File
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Nivel 1 da paridade: os 34 vectores de `spec/vectors.json`, byte a byte.
 *
 * ## O que este teste e' e o que nao e'
 *
 **E' a verificacao de que esta stack produz o mesmo payload que a spec.** A
 * `AGENTS.md` diz que a paridade nao e' negociavel — um payload que sai
 * diferente num cliente e' um bug, mesmo que o teste desse cliente passe. E
 * este ficheiro e' o que transforma essa frase em algo verificavel.
 *
 **Nao e' um teste de estrutura**, nem de limites, nem de mensagens de erro. E'
 * so a igualdade do resultado, e e' a que apanha o que nenhum outro apanha: um
 * `,` em vez de `;` num vCard, um `+` em vez de `%20` num assunto, uma hora
 * convertida para UTC num evento.
 *
 * ## A spec e' a unica fonte, e a leitura dela falha alto
 *
 **O caminho da spec vem de uma propriedade do sistema, e nao de uma constante
 * escrita aqui.** Um caminho escrito a mao parte assim que alguem renomear a
 * pasta, e o sintoma e' "a spec nao foi encontrada" num teste que nao tem nada
 * a ver com a spec. Sem ficheiro, este ficheiro **falha** em vez de passar a
 * vazio: um teste de paridade que nao le a spec e' um teste que diz que esta
 * stack bate com a spec, sem nunca a ter visto.
 */
class SpecVectorTests {

    private val spec = Spec.read()

    // --- A spec ------------------------------------------------------------

    @Test
    fun `a spec tem os onze tipos, e cada um com pelo menos um vector`() {
        assertTrue(spec.vectors.size >= 30, "a spec tem ${spec.vectors.size} vectores")

        val vistos = spec.vectors.map { it.tipo }.toSet()
        for (categoria in QrCategory.entries) {
            assertTrue(
                vistos.contains(nomeDaCategoria(categoria)),
                "a spec nao tem nenhum vector do tipo ${nomeDaCategoria(categoria)}",
            )
        }

        /*
         * **E nao pode haver aqui um tipo que o Kotlin nao conheca.** O teste de
         * baixo saltava-o, e a contagem acima diria que ha onze tipos com
         * cobertura quando um deles nao e' testado. Um registo sem entrada e'
         * invisivel, e a `AGENTS.md` ja tem o caso do GS1-128, que entrou no
         * registo com o encoder e nao apareceu no selector.
         */
        assertEquals(QrCategory.entries.size, vistos.size, "a spec tem tipos que o Kotlin nao conhece")
    }

    @Test
    fun `a lista dos tipos da spec e' a mesma que a do enum`() {
        // A segunda escrita do mesmo conjunto, comparada. Duas listas do mesmo
        // conjunto divergem em silencio, e aqui o preco seria um tipo inteiro
        // sem cobertura nenhuma.
        val doEnum = QrCategory.entries.map { nomeDaCategoria(it) }.toSet()
        val daSpec = spec.tipos.toSet()
        assertEquals(doEnum, daSpec, "os tipos do enum e os da spec tem de ser os mesmos")
    }

    // --- O contrato --------------------------------------------------------

    @Test
    fun `bate com a spec, em todos os vectores`() {
        val problemas = mutableListOf<String>()

        for (vector in spec.vectors) {
            val categoria = categoriaDe(vector.tipo)
            val fields = Spec.fieldsDe(vector.campos)

            val erro = QrValidator.validate(categoria, fields)
            if (erro != null) {
                problemas.add("${vector.id}: a propria spec nao valida — $erro")
                continue
            }

            val payload = QrPayloadBuilder.build(categoria, fields)
            if (payload != vector.payload) {
                val i = primeiraDiferenca(payload, vector.payload)
                problemas.add(
                    "${vector.id}: o payload difere na posicao $i\n" +
                        "      kotlin: ${contexto(payload, i)}\n" +
                        "      spec:   ${contexto(vector.payload, i)}",
                )
            }
        }

        assertTrue(
            problemas.isEmpty(),
            "${problemas.size} de ${spec.vectors.size} vectores divergem. " +
                "A paridade nao e' negociavel.\n" + problemas.joinToString("\n"),
        )
    }

    @Test
    fun `a chave e' o que o nivel 1 nao ve - cada vector tem de ser lido`() {
        /*
         * **O nivel 2 e' noutro ficheiro** (`RenderTests`), porque precisa de
         * desenhar a imagem e de um leitor. Aqui so se confirma que a lista nao
         * esta vazia, que e' a condicao para o de cima estar a testar alguma
         * coisa: com zero vectores, o `problemas` fica vazio e o teste passa.
         */
        assertTrue(spec.vectors.isNotEmpty(), "a spec nao tem vectores")
    }

    // --- O round-trip, so do PIX -------------------------------------------

    /**
     * O round-trip so existe para o PIX, porque so o PIX tem parser.
     *
     * **Prova que o que omite o `parse` e' reconstruivel a partir do que o
     * `build` produziu.** Escrever um parser para "voltar a partir da string" de
     * um link seria escrever um segundo encoder, e dois encoders errados
     * concordam um com o outro — que e' o pior sitio para um bug estar.
     */
    @Test
    fun `round-trip preserva o payload de PIX`() {
        for (vector in spec.vectorsOfType("pix")) {
            val parsed = com.qrcodegen.core.pix.Pix.parse(vector.payload)
            assertTrue(parsed.crcValid, "${vector.id}: CRC invalido")

            val rebuild = com.qrcodegen.core.pix.Pix.build(
                com.qrcodegen.core.pix.Pix.Payload(
                    key = parsed.payload.key,
                    name = parsed.payload.name,
                    city = parsed.payload.city,
                    amount = parsed.payload.amount?.toPlainString(),
                    txid = parsed.payload.txid,
                    description = parsed.payload.description,
                    postcode = parsed.payload.postcode,
                    singleUse = parsed.payload.singleUse,
                ),
            )
            assertEquals(vector.payload, rebuild, "${vector.id}: o rebuild nao devolve o mesmo")
        }
    }

    @Test
    fun `os comprimentos declarados batem nos vectores de PIX`() {
        /*
         * **So o PIX tem TLV.** Os comprimentos sao a forma como o formato diz
         * "aqui vao 25 bytes", e um `evento` e' iCalendar e um `link` e' um link:
         * nao declaram nada.
         */
        for (vector in spec.vectorsOfType("pix")) {
            assertTlvLengths(vector.payload, "", vector.id)
        }
    }

    private fun assertTlvLengths(data: String, path: String, id: String) {
        var i = 0
        while (i < data.length) {
            val tag = data.substring(i, i + 2)
            val declared = data.substring(i + 2, i + 4).toInt()
            val value = data.substring(i + 4, i + 4 + declared)
            assertEquals(declared, value.length, "$id: campo $path$tag com comprimento errado")
            if (tag == "26" || tag == "62") assertTlvLengths(value, "$path$tag.", id)
            i += 4 + declared
        }
    }

    // --- O PIX: o tipo de cada chave -----------------------------------

    @Test
    fun `cada tipo de chave PIX e' reconhecido`() {
        val casos = mapOf(
            "529.982.247-25" to "cpf",
            "11.222.333/0001-81" to "cnpj",
            "+5511966666666" to "telefone",
            "fulano@example.com" to "email",
            "123e4567-e12b-12d1-a456-426655440000" to "aleatória",
        )
        for ((chave, tipo) in casos) {
            assertEquals(tipo, com.qrcodegen.core.pix.Pix.keyType(chave), "chave $chave")
        }
    }
}

// --- A leitura da spec -------------------------------------------------------

/** Um vector tal como a spec o traz. */
data class Vector(
    val id: String,
    val tipo: String,
    val descricao: String,
    val fonte: String,
    val campos: Map<String, String>,
    val payload: String,
    val bytes: Int,
)

/** A spec inteira. */
class Spec(
    val versao: Int,
    val tipos: List<String>,
    val vectors: List<Vector>,
) {
    fun vectorsOfType(tipo: String) = vectors.filter { it.tipo == tipo }

    companion object {
        /**
         * Le a spec, e **falha alto se ela nao estiver la**.
         *
         * A razao de ser uma excepcao e nao um `return null`: um `null` aqui
         * daria um `spec` com zero vectores, e o teste de cima passaria a dizer
         * que a stack bate com a spec sem nunca a ter lido. **E' o teste que
         * passa a vazio sem ninguem ver**, e o `AGENTS.md` tem uma lista
         * desses.
         */
        fun read(): Spec {
            val path = System.getProperty("qrcodegen.spec")
                ?: fail(
                    "a propriedade qrcodegen.spec nao esta definida — o caminho da spec " +
                        "vem do build.gradle.kts e nao pode ser escrito aqui, porque " +
                        "partir assim que a pasta mudar de sitio",
                )

            val file = File(path)
            if (!file.exists()) {
                fail("a spec nao esta em $path — este teste compara contra ela, e sem ela nao compara nada")
            }

            val json = JsonParser.parseString(file.readText(Charsets.UTF_8)).asJsonObject
            val vectors = json.getAsJsonArray("vectors").map { element ->
                val o = element.asJsonObject
                Vector(
                    id = o.get("id").asString,
                    tipo = o.get("tipo").asString,
                    descricao = o.get("descricao").asString,
                    fonte = o.get("fonte").asString,
                    campos = camposDe(o.getAsJsonObject("campos")),
                    payload = o.get("payload").asString,
                    bytes = o.get("bytes").asInt,
                )
            }

            return Spec(
                versao = json.get("versao").asInt,
                tipos = json.getAsJsonArray("tipos").map { it.asString },
                vectors = vectors,
            )
        }

        /**
         * Os campos da spec num `QrFields`.
         *
         * **Um `Map<String, String>` e nao o `JsonObject`, e a razao e' a
         * fronteira.** O `JsonObject` e' do Gson, e o `QrFields` nao tem nada
         * a ver com JSON. Passar o mapa isola o Gson na leitura — que e' a unica
         * parte que precisa dele — e torna a funcao testavel sem um ficheiro.
         *
         * **O PIX e' uma traducao e os outros dez nao**, que e' a razao de isto
         * ter duas metades em vez de quarenta linhas. E' o que a
         * `spec/vectors.json` diz na sua `descricao`: os campos dos dez tipos de
         * transporte sao os do navegador tal como estao, e os do PIX sao os do
         * `PixPayload`.
         */
        fun fieldsDe(campos: Map<String, String>): QrFields {
            fun s(k: String) = campos[k].orEmpty()
            fun flag(k: String) = s(k).equals("true", ignoreCase = true)

            /*
             * **A virgula conta, porque o formulario aceita as duas.** O campo da
             * latitude e' escrito `38,7223` por quem esta em Portugal, e um
             * `toDoubleOrNull` sem trocar a virgula dava `null` — que e'
             * indistinguivel de um campo vazio, e o payload saia com `geo:` e
             * nada mais.
             */
            fun numero(k: String) = s(k).replace(',', '.').toDoubleOrNull()

            /*
             * **Um `LocalDateTime` sem fuso, e nao um `ZonedDateTime`.** A spec
             * traz `2026-09-29T18:30` sem fuso, porque o `datetime-local` da
             * interface nao tem. Converter punha uma hora a mais no payload, e
             * foi o que o C# e o Java faziam.
             */
            fun when_(k: String): LocalDateTime? =
                s(k).trim().takeIf { it.isNotEmpty() }?.let { LocalDateTime.parse(it) }

            return QrFields().apply {
                url = s("url")
                texto = s("texto")
                mailTo = s("mailTo")
                mailSubject = s("mailSubject")
                mailBody = s("mailBody")
                phonePrefix = campos["phonePrefix"] ?: "+351"
                phoneNumber = s("phoneNumber")
                smsMessage = s("smsMessage")
                waMessage = s("waMessage")
                eventTitle = s("eventTitle")
                eventDescription = s("eventDescription")
                eventLocation = s("eventLocation")
                eventStart = when_("eventStart")
                eventEnd = when_("eventEnd")
                geoLat = numero("geoLat")
                geoLng = numero("geoLng")
                wifiSsid = s("wifiSsid")
                wifiPass = s("wifiPass")
                wifiSec = campos["wifiSec"] ?: "WPA/WPA2"
                wifiHidden = flag("wifiHidden")
                vcFirstName = s("vcFirstName")
                vcLastName = s("vcLastName")
                vcPhone = s("vcPhone")
                vcPhone2 = s("vcPhone2")
                vcEmail = s("vcEmail")
                vcOrg = s("vcOrg")
                vcRole = s("vcRole")
                vcStreet = s("vcStreet")
                vcCity = s("vcCity")
                vcZip = s("vcZip")
                vcCountry = s("vcCountry")

                pixKey = s("key")
                pixName = s("name")
                pixCity = s("city")
                pixAmount = s("amount")
                pixTxid = s("txid")
                pixDescription = s("description")
                pixPostcode = s("postcode")
                pixSingleUse = flag("single_use")
            }
        }

        private fun camposDe(o: JsonObject): Map<String, String> {
            val out = mutableMapOf<String, String>()
            for ((k, v) in o.entrySet()) {
                out[k] = when {
                    v.isJsonNull -> ""
                    v.isJsonPrimitive && v.asJsonPrimitive.isBoolean -> v.asString
                    else -> v.asString
                }
            }
            return out
        }
    }
}

// --- O nome da spec para cada categoria ---------------------------------------

/**
 * O nome da spec para cada categoria.
 *
 * **E' a mesma lista duas vezes** — aqui e no `QrCategory` — e por isso que o
 * teste `a lista dos tipos da spec e' a mesma que a do enum` a compara. Uma
 * lista assumida e' uma lista que diverge sem dizer nada.
 */
fun nomeDaCategoria(categoria: QrCategory): String = categoria.name.lowercase()

/** A categoria de um `tipo` da spec. */
fun categoriaDe(tipo: String): QrCategory = QrCategory.valueOf(tipo.uppercase())

/** A primeira posicao onde as duas cadeias divergem, **em pontos de codigo**. */
private fun primeiraDiferenca(a: String, b: String): Int {
    val ca = a.toList()
    val cb = b.toList()
    val n = minOf(ca.size, cb.size)
    for (i in 0 until n) if (ca[i] != cb[i]) return i
    return n
}

/**
 * Uma janela em volta da diferenca, com o resto da linha visivel.
 *
 * **Mostra a linha inteira e nao uma janela de caracteres**, porque um payload
 * de vCard tem varias linhas e a diferenca num `;` e' invisivel num recorte de
 * trinta caracteres que apanha o inicio de outra propriedade.
 */
private fun contexto(texto: String, pos: Int): String {
    if (pos >= texto.length) return "(fim, ${texto.length} caracteres)"
    val inicioLinha = texto.lastIndexOf('\n', pos) + 1
    val fimLinha = texto.indexOf('\n', pos)
    val fim = if (fimLinha == -1) texto.length else fimLinha
    return texto.substring(inicioLinha, fim)
}
