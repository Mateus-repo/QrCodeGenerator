"""
Gera ``web/symbologies/datamatrix-tabelas.js``.

    python web/tests/gerar-tabela-datamatrix.py

Porque é gerado e não escrito à mão
-----------------------------------

Duas tabelas, e nenhuma delas se escreve de memória.

A dos **símbolos** são 24 tamanhos quadrados, cada um com a sua capacidade em
codewords de dados, os de correcção, a geometria da região de dados e o
corte em blocos. Uma entrada trocada dá um símbolo que não lê, e o sintoma é
um "codeword 700 não existe" ou um código que o leitor recusa sem dizer porquê.

A dos **factores de Reed-Solomon** são 16 conjuntos, com até 68 factores cada.
Nenhum deles é dedutível: são os polinómios geradores de grau 5 a 68, e a
convenção de ordenação é uma escolha do autor. Derivei-os e não batem — a
tabela do ZXing põe o coeficiente de ``x^(n-1)`` no primeiro lugar, e o cálculo
põe o termo de ordem zero. Por isso vão copiados, e a verificação é funcional:
se um factor estivesse errado, a correcção de erros não bateria e o ZXing não
devolvia o texto ao ler. O `descodificar-datamatrix.py` é essa verificação.

De onde vêm
-----------

Da implementação de referência do ZXing (Apache 2.0), que é também o leitor que
vai verificar o que este encoder produz. A tabela dos factores é a
``FACTORS`` de ``ErrorCorrection.java`` e a dos símbolos é a ``PROD_SYMBOLS``
de ``SymbolInfo.java`` mais ``DataMatrixSymbolInfo144``.

Só os **quadrados** entram. O Data Matrix tem também símbolos rectangulares
(8x18 efamily), que a norma ISO/IEC 16022 tambem define e que aqui
ficam de fora: nenhum leitor de bolso os lê, e o que interessa é o quadrado.

O que fica de fora e porquê
---------------------------

Os modos **C40, Text, X12 e EDIFACT** não estão implementados, e a escolha de
modo é o algoritmo de look-ahead da ISO, que é a parte mais longa do encoder do
ZXing. Sem eles o código é **perfeitamente válido e lê em qualquer leitor** — são
modos de *compressão*, não de correcção. A diferença é que "MAST-2024-0001" sai
um símbolo maior do que sairia em C40. Está no TODO comootimização, não como
conformidade.
"""

from __future__ import annotations

from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
DESTINO = RAIZ / "web" / "symbologies" / "datamatrix-tabelas.js"

# (dados, correccao, larguraRegiao, alturaRegiao, regioesDados, dadosPorBloco,
#  errosPorBloco)
#
# Os dois ultimos valem -1 quando o bloco e o simbolo inteiro, que e o caso de
# quase todos: so a partir de 52x52 e que ha mais do que um bloco.
SIMBOLOS = [
    (3, 5, 8, 8, 1, -1, -1),
    (5, 7, 10, 10, 1, -1, -1),
    (8, 10, 12, 12, 1, -1, -1),
    (12, 12, 14, 14, 1, -1, -1),
    (18, 14, 16, 16, 1, -1, -1),
    (22, 18, 18, 18, 1, -1, -1),
    (30, 20, 20, 20, 1, -1, -1),
    (36, 24, 22, 22, 1, -1, -1),
    (44, 28, 24, 24, 1, -1, -1),
    (62, 36, 14, 14, 4, -1, -1),
    (86, 42, 16, 16, 4, -1, -1),
    (114, 48, 18, 18, 4, -1, -1),
    (144, 56, 20, 20, 4, -1, -1),
    (174, 68, 22, 22, 4, -1, -1),
    (204, 84, 24, 24, 4, 102, 42),
    (280, 112, 14, 14, 16, 140, 56),
    (368, 144, 16, 16, 16, 92, 36),
    (456, 192, 18, 18, 16, 114, 48),
    (576, 224, 20, 20, 16, 144, 56),
    (696, 272, 22, 22, 16, 174, 68),
    (816, 336, 24, 24, 16, 136, 56),
    (1050, 408, 18, 18, 36, 175, 68),
    (1304, 496, 20, 20, 36, 163, 62),
    # O de 144x144 e o unico com blocos de tamanho desigual: **oito** de 156 e
    # **dois** de 155, e nao um de 154. A conta e 8*156 + 2*155 = 1558, que e a
    # capacidade que a linha de cima declara.
    #
    # Fica em commentary porque e a unica entrada da tabela que nao cabe na
    # regra, e um numero magico dentro de uma lista de sete campos nao se
    # percebe.
    (1558, 620, 22, 22, 36, 156, 62),
]

ULTIMO = {
    "simbolo": len(SIMBOLOS) - 1,
    "blocos": 10,
    "cheios": 8,
    "dadosCheio": 156,
    "dadosUltimos": 155,
    "erros": 62,
}

FATORES_EC = [
    [228, 48, 15, 111, 62],
    [23, 68, 144, 134, 240, 92, 254],
    [28, 24, 185, 166, 223, 248, 116, 255, 110, 61],
    [175, 138, 205, 12, 194, 168, 39, 245, 60, 97, 120],
    [41, 153, 158, 91, 61, 42, 142, 213, 97, 178, 100, 242],
    [156, 97, 192, 252, 95, 9, 157, 119, 138, 45, 18, 186, 83, 185],
    [83, 195, 100, 39, 188, 75, 66, 61, 241, 213, 109, 129, 94, 254, 225, 48, 90, 188],
    [15, 195, 244, 9, 233, 71, 168, 2, 188, 160, 153, 145, 253, 79, 108, 82, 27, 174, 186, 172],
    [52, 190, 88, 205, 109, 39, 176, 21, 155, 197, 251, 223, 155, 21, 5, 172, 254, 124, 12, 181, 184, 96, 50, 193],
    [211, 231, 43, 97, 71, 96, 103, 174, 37, 151, 170, 53, 75, 34, 249, 121, 17, 138, 110, 213, 141, 136, 120, 151, 233, 168, 93, 255],
    [245, 127, 242, 218, 130, 250, 162, 181, 102, 120, 84, 179, 220, 251, 80, 182, 229, 18, 2, 4, 68, 33, 101, 137, 95, 119, 115, 44, 175, 184, 59, 25, 225, 98, 81, 112],
    [77, 193, 137, 31, 19, 38, 22, 153, 247, 105, 122, 2, 245, 133, 242, 8, 175, 95, 100, 9, 167, 105, 214, 111, 57, 121, 21, 1, 253, 57, 54, 101, 248, 202, 69, 50, 150, 177, 226, 5, 9, 5],
    [245, 132, 172, 223, 96, 32, 117, 22, 238, 133, 238, 231, 205, 188, 237, 87, 191, 106, 16, 147, 118, 23, 37, 90, 170, 205, 131, 88, 120, 100, 66, 138, 186, 240, 82, 44, 176, 87, 187, 147, 160, 175, 69, 213, 92, 253, 225, 19],
    [175, 9, 223, 238, 12, 17, 220, 208, 100, 29, 175, 170, 230, 192, 215, 235, 150, 159, 36, 223, 38, 200, 132, 54, 228, 146, 218, 234, 117, 203, 29, 232, 144, 238, 22, 150, 201, 117, 62, 207, 164, 13, 137, 245, 127, 67, 247, 28, 155, 43, 203, 107, 233, 53, 143, 46],
    [242, 93, 169, 50, 144, 210, 39, 118, 202, 188, 201, 189, 143, 108, 196, 37, 185, 112, 134, 230, 245, 63, 197, 190, 250, 106, 185, 221, 175, 64, 114, 71, 161, 44, 147, 6, 27, 218, 51, 63, 87, 10, 40, 130, 188, 17, 163, 31, 176, 170, 4, 107, 232, 7, 94, 166, 224, 124, 86, 47, 11, 204],
    [220, 228, 173, 89, 251, 149, 159, 56, 89, 33, 147, 244, 154, 36, 73, 127, 213, 136, 248, 180, 234, 197, 158, 177, 68, 122, 93, 213, 15, 160, 227, 236, 66, 139, 153, 185, 202, 167, 179, 25, 220, 232, 96, 210, 231, 136, 223, 239, 181, 241, 59, 52, 172, 25, 49, 232, 211, 189, 64, 54, 108, 153, 132, 63, 96, 103, 82, 186],
]

CABECALHO = """/**
 * As tabelas do Data Matrix. **Gerado** por `tests/gerar-tabela-datamatrix.py`.
 *
 * Duas tabelas, e nenhuma delas é dedutível.
 *
 * A dos **símbolos** diz, para cada um dos 24 tamanhos quadrados, quantos
 * codewords de dados cabem, quantos de correcção, como a região de dados se
 * divide e onde é o corte em blocos. Uma entrada trocada dá um símbolo que não
 * lê, e o sintoma é uma mensagem que não aponta para a tabela.
 *
 * A dos **factores** são os 16 polinómios geradores de Reed-Solomon, de grau 5
 * a 68. Tentei derivá-los e não batem: a tabela põe o coeficiente de
 * `x^(n-1)` no primeiro lugar e o cálculo põe o termo de ordem zero. Vão
 * copiados, e a verificação é funcional — um factor errado faz a correcção de
 * erros não bater e o ZXing não devolve o texto ao ler.
 *
 * Só entram os símbolos **quadrados**. Os rectangulares ficam de fora: a norma
 * também os define e nenhum leitor de bolso os lê.
 *
 * Vêm da implementação de referência do ZXing (Apache 2.0), que é também o
 * leitor que verifica o que este encoder produz. **Não editar à mão.**
 */

/**
 * Os símbolos quadrados, por ordem de capacidade.
 *
 * Cada linha é `[dados, correcção, larguraDaRegião, alturaDaRegião,
 * regiõesDeDados, dadosPorBloco, errosPorBloco]`. Os dois últimos valem `-1`
 * quando o bloco é o símbolo inteiro, que é o caso de quase todos.
 */
export const SIMBOLOS = [
"""

RODAPE = """];

/**
 * O 144x144, que é o único com blocos de tamanho desigual.
 *
 * **Oito** blocos de 156 codewords de dados e **dois** de 155 — 8 × 156 + 2 ×
 * 155 = 1558, a capacidade que a linha de cima declara — mais 62 de correcção
 * em cada.
 *
 * Nota para quem contar, porque é um a menos e não dois: a primeira versão
 * punha 154, e a conta dava 1556 em vez de 1558. Dois codewords num código de
 * 1558, e o leitor acusa isso como corrupção e não como tabela errada.
 */
export const ULTIMO = {
  simbolo: 23,
  blocos: 10,
  cheios: 8,
  dadosCheio: 156,
  dadosUltimos: 155,
  erros: 62,
};

/** Os factores de Reed-Solomon, indexados pelo número de codewords de correcção. */
export const FATORES = {
"""


def principal() -> int:
    partes = [CABECALHO]

    for (dados, correccao, largura, altura, regioes, blocoDados, blocoErros) in SIMBOLOS:
        partes.append(
            f"  [{dados}, {correccao}, {largura}, {altura}, {regioes}, "
            f"{blocoDados}, {blocoErros}],\n"
        )

    partes.append(RODAPE)

    for n, factores in enumerate(FATORES_EC):
        chave = len(factores)
        lista = ", ".join(str(f) for f in factores)
        partes.append(f"  {chave}: [{lista}],\n")
    partes.append("};\n")

    DESTINO.write_text("".join(partes), encoding="utf-8")

    print(
        f"{DESTINO.relative_to(RAIZ)} "
        f"({len(SIMBOLOS)} símbolos, {len(FATORES_EC)} conjuntos de factores)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
