package com.qrcodegen.core.simbologias

/**
 * As tabelas do Data Matrix. **Gerado** por `spec/gerar-tabelas-datamatrix.py`.
 *
 * Sao duas tabelas, e nenhuma delas e' dedutivel. **Nao editar a mao.**
 * Vem da implementacao de referencia do ZXing.
 */
object TabelasDataMatrix {

    /**
     * Os 24 simbolos quadrados, por ordem de capacidade.
     *
     * **Os dois ultimos valem `-1`** quando o bloco e' o simbolo inteiro.
     */
    val SIMBOLOS = arrayOf(
        intArrayOf(3, 5, 8, 8, 1, -1, -1),
        intArrayOf(5, 7, 10, 10, 1, -1, -1),
        intArrayOf(8, 10, 12, 12, 1, -1, -1),
        intArrayOf(12, 12, 14, 14, 1, -1, -1),
        intArrayOf(18, 14, 16, 16, 1, -1, -1),
        intArrayOf(22, 18, 18, 18, 1, -1, -1),
        intArrayOf(30, 20, 20, 20, 1, -1, -1),
        intArrayOf(36, 24, 22, 22, 1, -1, -1),
        intArrayOf(44, 28, 24, 24, 1, -1, -1),
        intArrayOf(62, 36, 14, 14, 4, -1, -1),
        intArrayOf(86, 42, 16, 16, 4, -1, -1),
        intArrayOf(114, 48, 18, 18, 4, -1, -1),
        intArrayOf(144, 56, 20, 20, 4, -1, -1),
        intArrayOf(174, 68, 22, 22, 4, -1, -1),
        intArrayOf(204, 84, 24, 24, 4, 102, 42),
        intArrayOf(280, 112, 14, 14, 16, 140, 56),
        intArrayOf(368, 144, 16, 16, 16, 92, 36),
        intArrayOf(456, 192, 18, 18, 16, 114, 48),
        intArrayOf(576, 224, 20, 20, 16, 144, 56),
        intArrayOf(696, 272, 22, 22, 16, 174, 68),
        intArrayOf(816, 336, 24, 24, 16, 136, 56),
        intArrayOf(1050, 408, 18, 18, 36, 175, 68),
        intArrayOf(1304, 496, 20, 20, 36, 163, 62),
        intArrayOf(1558, 620, 22, 22, 36, 156, 62),
    )

    /**
     * **O 144x144, que e' o unico com blocos de tamanho desigual.** Oito blocos de 156 codewords de dados e dois de 155 — 8 x 156 + 2 x 155 = 1558, a capacidade que a linha de cima declara — mais 62 de correccao em cada.
     * 
     * *Nota para quem contar, porque e' um a menos e nao dois:* a primeira versao punha 154, e a conta dava 1556 em vez de 1558. **Dois codewords num codigo de 1558, e o leitor acusa isso como corrupcao e nao como tabela errada** — que e' o pior dos sintomas, porque a mensagem aponta para o leitor.
     */
        const val ULTIMO_SIMBOLO = 23
        const val ULTIMO_BLOCOS = 10
        const val ULTIMO_CHEIOS = 8
        const val ULTIMO_DADOSCHEIO = 156
        const val ULTIMO_DADOSULTIMOS = 155
        const val ULTIMO_ERROS = 62

    /** Os factors de Reed-Solomon, por numero de codewords. */
    val FATORES = mapOf(
        5 to intArrayOf(228, 48, 15, 111, 62),
        7 to intArrayOf(23, 68, 144, 134, 240, 92, 254),
        10 to intArrayOf(28, 24, 185, 166, 223, 248, 116, 255, 110, 61),
        11 to intArrayOf(175, 138, 205, 12, 194, 168, 39, 245, 60, 97, 120),
        12 to intArrayOf(41, 153, 158, 91, 61, 42, 142, 213, 97, 178, 100, 242),
        14 to intArrayOf(156, 97, 192, 252, 95, 9, 157, 119, 138, 45, 18, 186, 83, 185),
        18 to intArrayOf(83, 195, 100, 39, 188, 75, 66, 61, 241, 213, 109, 129, 94, 254, 225, 48, 90, 188),
        20 to intArrayOf(15, 195, 244, 9, 233, 71, 168, 2, 188, 160, 153, 145, 253, 79, 108, 82, 27, 174, 186, 172),
        24 to intArrayOf(52, 190, 88, 205, 109, 39, 176, 21, 155, 197, 251, 223, 155, 21, 5, 172, 254, 124, 12, 181, 184, 96, 50, 193),
        28 to intArrayOf(211, 231, 43, 97, 71, 96, 103, 174, 37, 151, 170, 53, 75, 34, 249, 121, 17, 138, 110, 213, 141, 136, 120, 151, 233, 168, 93, 255),
        36 to intArrayOf(245, 127, 242, 218, 130, 250, 162, 181, 102, 120, 84, 179, 220, 251, 80, 182, 229, 18, 2, 4, 68, 33, 101, 137, 95, 119, 115, 44, 175, 184, 59, 25, 225, 98, 81, 112),
        42 to intArrayOf(77, 193, 137, 31, 19, 38, 22, 153, 247, 105, 122, 2, 245, 133, 242, 8, 175, 95, 100, 9, 167, 105, 214, 111, 57, 121, 21, 1, 253, 57, 54, 101, 248, 202, 69, 50, 150, 177, 226, 5, 9, 5),
        48 to intArrayOf(245, 132, 172, 223, 96, 32, 117, 22, 238, 133, 238, 231, 205, 188, 237, 87, 191, 106, 16, 147, 118, 23, 37, 90, 170, 205, 131, 88, 120, 100, 66, 138, 186, 240, 82, 44, 176, 87, 187, 147, 160, 175, 69, 213, 92, 253, 225, 19),
        56 to intArrayOf(175, 9, 223, 238, 12, 17, 220, 208, 100, 29, 175, 170, 230, 192, 215, 235, 150, 159, 36, 223, 38, 200, 132, 54, 228, 146, 218, 234, 117, 203, 29, 232, 144, 238, 22, 150, 201, 117, 62, 207, 164, 13, 137, 245, 127, 67, 247, 28, 155, 43, 203, 107, 233, 53, 143, 46),
        62 to intArrayOf(242, 93, 169, 50, 144, 210, 39, 118, 202, 188, 201, 189, 143, 108, 196, 37, 185, 112, 134, 230, 245, 63, 197, 190, 250, 106, 185, 221, 175, 64, 114, 71, 161, 44, 147, 6, 27, 218, 51, 63, 87, 10, 40, 130, 188, 17, 163, 31, 176, 170, 4, 107, 232, 7, 94, 166, 224, 124, 86, 47, 11, 204),
        68 to intArrayOf(220, 228, 173, 89, 251, 149, 159, 56, 89, 33, 147, 244, 154, 36, 73, 127, 213, 136, 248, 180, 234, 197, 158, 177, 68, 122, 93, 213, 15, 160, 227, 236, 66, 139, 153, 185, 202, 167, 179, 25, 220, 232, 96, 210, 231, 136, 223, 239, 181, 241, 59, 52, 172, 25, 49, 232, 211, 189, 64, 54, 108, 153, 132, 63, 96, 103, 82, 186),
    )
}
