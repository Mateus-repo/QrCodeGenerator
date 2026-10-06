package com.qrcodegen.core.simbologias

/**
 * O que um encoder recusa.
 *
 * **Estende `RuntimeException` e nao `IllegalArgumentException`**, e a razao e'
 * a mesma que o `PixException` da outra package: em Kotlin,
 * `IllegalArgumentException` e' um `typealias` para uma classe **final**, e
 * estende-la dava "This type is final" na traducao para o Java.
 *
 * **Por que uma excepcao e nao um valor devolvido.** O erro do encoder e' um
 * erro de uso — um ITF com um digito a menos nao tem leitura — e nao um estado
 * que o chamador tenha de tratar. Quem chama ja sabe que o texto tem de estar bem
 * formado, e nao quer um `null` para um erro que o ITF nao tem.
 *
 * A mensagem e' o produto, pela mesma razao que a do `QrValidator`: e' o que a
 * pessoa ve, e as stacks tem de dar a mesma.
 */
open class SimbologiaException(message: String) : RuntimeException(message)
