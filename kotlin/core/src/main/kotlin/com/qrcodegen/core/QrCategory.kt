package com.qrcodegen.core

/**
 * Categoria do QR code. A ordem define a ordem na interface.
 *
 * **E' a lista dos onze, e a spec tem-nos a todos.** Um tipo sem vector em
 * `spec/vectors.json` e' um tipo que ninguem sabe se esta certo — e o `AGENTS.md`
 * diz que a paridade nao e' negociavel, o que com um tipo sem cobertura nao e'
 * verificavel.
 *
 * O nome da constante e' o nome do `tipo` na spec em maiusculas, e o
 * `SpecFixture` depende disso: `QrCategory.valueOf(tipo.uppercase())`. **E' a
 * segunda escrita do mesmo conjunto** — a primeira e' a spec — e por isso que o
 * `SpecVectorTests` compara as duas em vez de uma assumir. Duas listas do mesmo
 * conjunto divergem em silencio, e o preco aqui seria um tipo inteiro sem
 * cobertura.
 */
enum class QrCategory(val label: String) {
    LINK("Link"),
    TEXTO("Texto"),
    EMAIL("Email"),
    TELEFONE("Telefone"),
    SMS("SMS"),
    WHATSAPP("WhatsApp"),
    EVENTO("Evento"),
    LOCALIZACAO("Localização"),
    WIFI("WiFi"),
    VCARD("vCard"),
    PIX("PIX"),
}
