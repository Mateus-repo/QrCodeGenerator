package com.qrcodegen.core

import com.google.zxing.LuminanceSource
import java.awt.image.BufferedImage

/**
 * A imagem do Java transformada na luminancia que o ZXing espera.
 *
 * **Esta classe saiu do `SimbologiasTestes` porque o `DataMatrixTestes` tambem
 * precisa dela, e uma classe `private` dentro de outra nao se ve de fora.**
 * Copiar era pior: sao duas implementacoes da mesma ponderacao, e as duas
 * divergiriam sem ninguem dizer qual esta certa.
 *
 * **`internal` e nao `private`, e nao `public`.** `private` ao topo do ficheiro
 *limita-lo a este ficheiro, que e' o mesmo problema que a classe estava antes de
 *sair; `public` exporia um auxiliar de teste a quem nao precisa dele.
 *
 * **E' um `ByteArray` e nao um `IntArray`, porque e' o que a interface pede.** Um
 * metodo que se sobrepoe tem a assinatura da base e nao a que seria mais comoda
 * escrever, e `IntArray` e' o tipo natural em Kotlin.
 */
internal class ImagemLuminance(private val imagem: BufferedImage) :
    LuminanceSource(imagem.width, imagem.height) {

    private val luminancia = ByteArray(imagem.width * imagem.height)

    init {
        for (y in 0 until imagem.height) {
            for (x in 0 until imagem.width) {
                val p = imagem.getRGB(x, y)
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                luminancia[y * imagem.width + x] =
                    (r * 0.299 + g * 0.587 + b * 0.114).toInt().toByte()
            }
        }
    }

    override fun getRow(y: Int, row: ByteArray?): ByteArray {
        val largura = imagem.width
        if (row == null || row.size < largura) {
            return luminancia.copyOfRange(y * largura, y * largura + largura)
        }
        System.arraycopy(luminancia, y * largura, row, 0, largura)
        return row
    }

    override fun getMatrix(): ByteArray = luminancia
}
