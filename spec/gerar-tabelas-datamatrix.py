"""
Gera as tabelas do Data Matrix para as cinco stacks.

    python spec/gerar-tabelas-datamatrix.py

Porque e' gerado e nao escrito a mao
-----------------------------------

Duas tabelas, e nenhuma delas se escreve de memoria.

A dos **simbolos** sao 24 tamanhos quadrados, cada um com a sua capacidade em
codewords de dados, os de correccao, a geometria da regiao de dados e o corte em
blocos. Uma entrada trocada da um simbolo que nao le, e o sintoma e' um "codeword
700 nao existe" ou um codigo que o leitor recusa sem dizer porque.

A dos **factores** sao 16 conjuntos, com ate 68 factores cada. Nenhum deles e'
dedutivel: sao os polinomios geradores de Reed-Solomon, de grau 5 a 68, e a
convencao de ordenacao e' uma escolha do autor. Derivei-os e nao batem — a tabela
do ZXing poe o coeficiente de ``x^(n-1)`` no primeiro lugar, e o calculo poe o
termo de ordem zero. Por isso vao copiados, e a verificacao e' funcional: se um
factor estivesse errado, a correccao de erros nao bateria e o ZXing nao devolvia
o texto ao ler.

De onde vem
-----------

Da implementacao de referencia do ZXing (Apache 2.0), que e' tambem o leitor que
va verificar o que este encoder produz. A tabela dos factores e' a ``FACTORS``
de ``ErrorCorrection.java`` e a dos simbolos e' a ``PROD_SYMBOLS`` de
``SymbolInfo.java`` mais ``DataMatrixSymbolInfo144``.

Sao os **quadrados** que entram. O Data Matrix tem tambem simbolos rectangulares
(8x18 e familia), que a norma ISO/IEC 16022 tambem define e que aqui ficam de
fora: nenhum leitor de bolso os le, e o que interessa e' o quadrado.

Porque cinco alvos
------------------

**Uma tabela, uma fonte.** O que a ``AGENTS.md`` proibe e' escrever as tabelas de
memoria, e o que ela nao resolve e' transcreve-las para cada linguagem. Um
``int[]`` em Java copiado a mao da lista em Python e' a mesma tabela duas vezes, e
diverge no mesmo silencio — so que agora sem nenhum teste de estrutura que as
compare, porque cada stack so conhece a sua.

Por isso que o gerador escreve os cinco ficheiros a partir dos mesmos valores, e
a regra passa a ser "corre o gerador" em vez de "nao transcrevas".

O que muda entre os cinco alvos, e so isto:

  - a forma de escrever a lista de simbolos: ``[1, 2, 3]``, ``(1, 2, 3)``,
    ``intArrayOf(1, 2, 3)``
  - a forma do 144x144: seis constantes em Java, Kotlin e C#, e um dicionario em
    Python — **porque sao seis numeros com nome**, e um mapa de seis chaves de
    texto lido em cada laço e' um mapa de texto onde cabiam numeros

**O que nao muda, e e' o que interessa:** os valores, e a verificacao de que os
quatro ficheiros gerados tem os mesmos numeros.

O que fica de fora e porque
---------------------------

Os modos **C40, Text, X12 e EDIFACT** nao estao implementados, e a escolha de modo
e' o algoritmo de look-ahead da ISO, que e' a parte mais longa do encoder do
ZXing. Sem eles o codigo e' **perfeitamente valido e le em qualquer leitor** — sao
modos de *compressao*, nao de correccao. A diferenca e' que "MAST-2024-0001" sai
um simbolo maior do que sairia em C40. Esta como otimizacao, e nao como
conformidade.
"""

from __future__ import annotations

from pathlib import Path

#: A quebra de linha, **como constante e nao como escape dentro de uma cadeia**.
#:
#: O gerador escreve codigo, e codigo escrito com ``\n`` dentro de uma cadeia sai
#: com a barra e o ``n`` no ficheiro — e o ficheiro gerado nao compila, com um
#: ``SyntaxError`` que aponta para a coluna 1 e nao para a cadeia que o produziu.
#: **Um gerador de texto tem de ter a quebra de linha como valor.**
NL = chr(10)

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent

#: Os cinco destinos, e **o mesmo script escreve os cinco**.
#:
#: **Uma tabela, uma fonte.** O que a `AGENTS.md` proibe e' escrever as tabelas de
#: memoria, e o que ela nao resolve e' transcreve-las para cada linguagem. Por isso
#: que o gerador escreve os cinco ficheiros a partir dos mesmos valores, e a regra
#: passa a ser "corre o gerador" em vez de "nao transcrevas".
ALVOS = [
    RAIZ / "web" / "symbologies" / "datamatrix-tabelas.js",
    RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_datamatrix.py",
    RAIZ / "java" / "core" / "src" / "main" / "java" / "com" / "qrcodegen"
        / "core" / "simbologias" / "TabelasDataMatrix.java",
    RAIZ / "kotlin" / "core" / "src" / "main" / "kotlin" / "com" / "qrcodegen"
        / "core" / "simbologias" / "TabelasDataMatrix.kt",
    RAIZ / "csharp" / "core" / "Simbologias" / "TabelasDataMatrix.cs",
]


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


# --- as formas de escrever ------------------------------------------------


def simbolos(abertura: str, separador: str, fecho: str, indent: str) -> str:
    """
    As 24 linhas dos simbolos, na forma de cada linguagem.

    :param abertura: o que poe **antes** dos sete numeros
    :param separador: o que os separa
    :param fecho: o que poe **depois** — e' diferente da abertura em duas das
        cinco linguagens, e nao pode ser o mesmo valor
    :param indent: o que poe no inicio da linha
    :return: as linhas
    """
    linhas = []
    for simbolo in SIMBOLOS:
        numeros = separador.join(str(n) for n in simbolo)
        linhas.append(indent + abertura + numeros + fecho + ",")
    return NL.join(linhas)


def rs_sem_chave(abertura: str, separador: str, fecho: str, indent: str) -> str:
    """
    Os 16 conjuntos de Reed-Solomon, **sem a chave escrita**.

    **O Java, o C# e o JS implicam a chave pela ordem** — o n-esimo bloco e' o
    n-esimo conjunto — e por isso que so estes nao a escrevem. O Java e' o que
    fica com as chaves implicitas num array bidimensional: o compilador nao
    pergunta, e a ordem e' a do codigo.
    """
    linhas = []
    for conjunto in FATORES_EC:
        numeros = separador.join(str(f) for f in conjunto)
        linhas.append(indent + abertura + numeros + fecho + ",")
    return NL.join(linhas)


def rs_com_chave(
    antes: str, depois: str, abertura: str, separador: str, fecho: str, indent: str
) -> str:
    """
    Os 16 conjuntos de Reed-Solomon, **com a chave escrita**.

    **O Python e' um `{` sem chaves**, que e' um conjunto — e um conjunto de
    listas nao existe, e o resultado e' um `set` de todos os inteiros de todos
    os conjuntos. O Kotlin e' um `mapOf` sem chaves, que tambem nao existe.

    **A chave e' o numero de codewords de correccao**, que e' o comprimento do
    conjunto — e nao o indice, que coincidem nos primeiros e nao coincidem nos
    ultimos.

    :param antes: o que poe antes da chave — o `": "` de Python, o `" to "` de
        Kotlin, o `"["` do C#
    :param depois: o que poe entre a chave e os numeros
    :param abertura: o que abre cada lista de numeros
    :param separador: o que separa os numeros
    :param fecho: o que fecha cada lista
    :param indent: o que poe no inicio da linha
    """
    linhas = []
    for conjunto in FATORES_EC:
        numeros = separador.join(str(f) for f in conjunto)
        linhas.append(
            indent + antes + str(len(conjunto)) + depois + abertura + numeros + fecho + ","
        )
    return NL.join(linhas)


#: A nota do 144x144, **em prosa e nao em nenhuma linguagem**, e cada escritor
#: converte-a para o prefixo de comentario que usa.
NOTA = (
    "**O 144x144, que e' o unico com blocos de tamanho desigual.** Oito blocos de "
    "156 codewords de dados e dois de 155 — 8 x 156 + 2 x 155 = 1558, a capacidade "
    "que a linha de cima declara — mais 62 de correccao em cada."
    + NL + NL
    + "*Nota para quem contar, porque e' um a menos e nao dois:* a primeira versao "
    "punha 154, e a conta dava 1556 em vez de 1558. **Dois codewords num codigo de "
    "1558, e o leitor acusa isso como corrupcao e nao como tabela errada** — que e' "
    "o pior dos sintomas, porque a mensagem aponta para o leitor."
)


def nota(prefixo: str) -> str:
    """A nota do 144x144, com o prefixo de comentario de cada linguagem."""
    return NL.join(prefixo + linha for linha in NOTA.split(NL))


def constantes_ultimo(indent: str, formato: str, maiusculas: bool = True) -> str:
    """
    As seis constantes do 144x144, uma por chave.

    **Sao seis numeros com nome, e nao um dicionario** nas linguagens
    compiladas: `ULTIMO_DADOSCHEIO` e' um nome que o compilador verifica e
    escreve uma vez, e um mapa com seis chaves de texto lido em cada laço e' um
    mapa de texto onde cabiam numeros.

    **O Python e' o unico com o dicionario**, porque nele um `=` dentro de
    `{...}` nao e' valido e um mapa com nomes e' a forma natural.

    :param maiusculas: as tres linguagens compiladas põem o nome da chave em
        `MAIUSCULAS`, e o web e o Python em `minusculas`. **Nao e' um
        detalhe** — o `ULTIMO.simbolo` do web e' lido por nome em
        `datamatrix.test.mjs`, e com a chave em maiusculas o teste rebenta com
        `undefined is not iterable` numa linha a cem do encoder.
    """
    return "".join(
        indent + formato.format(chave=chave.upper() if maiusculas else chave,
                                valor=valor) + NL
        for chave, valor in ULTIMO.items()
    )


# --- o web ---------------------------------------------------------------


def web() -> str:
    partes = [
        "/**" + NL,
        " * As tabelas do Data Matrix. **Gerado** por "
        "`spec/gerar-tabelas-datamatrix.py`." + NL + " *" + NL,
        " * Duas tabelas, e nenhuma delas e' dedutivel." + NL + " *" + NL,
        " * A dos **simbolos** diz, para cada um dos 24 tamanhos quadrados, quantos"
        + NL + " * codewords de dados cabem, quantos de correccao, como a regiao de"
        + NL + " * dados se divide e onde e' o corte em blocos. Uma entrada trocada da"
        + NL + " * um simbolo que nao le, e o sintoma e' uma mensagem que nao aponta"
        + NL + " * para a tabela." + NL + " *" + NL,
        " * A dos **factors** sao os 16 polinomios geradores de Reed-Solomon, de"
        + NL + " * grau 5 a 68. Nenhum e' dedutivel: o ZXing poe o coeficiente de"
        + NL + " * `x^(n-1)` no primeiro lugar e o calculo poe o termo de ordem zero."
        + NL + " * A verificacao e' funcional — um factor errado faz a correccao de"
        + NL + " * erros nao bater e o ZXing nao devolve o texto ao ler." + NL + " *" + NL,
        " * So entram os simbolos **quadrados**. Os rectangulares ficam de fora: a"
        + NL + " * norma tambem os define e nenhum leitor de bolso os le." + NL + " *" + NL,
        " * Vem da implementacao de referencia do ZXing (Apache 2.0), que e' tambem"
        + NL + " * o leitor que verifica o que este encoder produz. **Nao editar a mao.**"
        + NL + " */" + NL + NL,
        "/**" + NL + " * Os simbolos quadrados, por ordem de capacidade." + NL + " *" + NL,
        " * Cada linha e' `[dados, correccao, larguraDaRegiao, alturaDaRegiao," + NL
        + " * regioesDeDados, dadosPorBloco, errosPorBloco]`. Os dois ultimos valem"
        + NL + " * `-1` quando o bloco e' o simbolo inteiro, que e' o caso de quase"
        + NL + " * todos." + NL + " */" + NL,
        "export const SIMBOLOS = [" + NL,
        simbolos("[", ", ", "]", "  ") + NL,
        "];" + NL + NL,
        "/**" + NL + " * " + nota(" * ") + NL + " */" + NL,
        "export const ULTIMO = {" + NL,
        constantes_ultimo("  ", "  {chave}: {valor},", maiusculas=False),
        "};" + NL + NL,
        "/** Os factors de Reed-Solomon, indexados pelo numero de codewords. */" + NL,
        "export const FATORES = {" + NL,
        rs_com_chave("", ": [", "", ", ", "]", "  ") + NL,
        "};" + NL,
    ]
    return "".join(partes)


# --- o Python, que e' a implementacao de referencia ----------------------


def python() -> str:
    partes = [
        '"""' + NL,
        "As tabelas do Data Matrix. **Gerado** por "
        "`spec/gerar-tabelas-datamatrix.py`." + NL + NL,
        "Duas tabelas, e nenhuma delas e' dedutivel." + NL + '"""' + NL + NL,
        "#: Os 24 simbolos quadrados, por ordem de capacidade." + NL + "#:" + NL,
        "#: Cada linha e' `(dados, correccao, larguraDaRegiao, alturaDaRegiao," + NL
        + "#: regioesDeDados, dadosPorBloco, errosPorBloco)`. **Os dois ultimos valem"
        + NL + "#: `-1`** quando o bloco e' o simbolo inteiro, que e' o caso de quase"
        + NL + "#: todos." + NL + "#:" + NL,
        "#: **Uma entrada trocada da um simbolo que nao le**, e o sintoma e' uma"
        + NL + "#: mensagem que nao aponta para a tabela." + NL,
        "SIMBOLOS = (" + NL,
        simbolos("(", ", ", ")", "    ") + NL + ")" + NL + NL,
        '"""' + NL + NL + nota("") + NL + '"""' + NL,
        # **O `:` e' obrigatorio**: em `{a=1}` o Python diz `invalid syntax. Maybe
        # you meant '==' or ':='` — e as duas sugeridas tambem nao servem, porque o
        # que falta e' o dois pontos. O `=` so vale numa assinatura de funcao.
        "ULTIMO = {" + NL,
        "".join(f"    '{chave}': {valor!r}," + NL for chave, valor in ULTIMO.items()),
        "}" + NL + NL,
        "#: Os factors de Reed-Solomon, indexados pelo numero de codewords de"
        + NL + "#: correccao — **que e' o comprimento do conjunto**, e nao o indice."
        + NL + "#:" + NL,
        "#: **Nenhum destes e' dedutivel**: o ZXing poe o coeficiente de "
        "`x^(n-1)`" + NL + "#: no primeiro lugar e o calculo poe o termo de ordem "
        "zero. Vem copiado da" + NL + "#: implementacao de referencia, e a "
        "verificacao e' funcional — um factor" + NL + "#: errado faz a correccao de "
        "erros nao bater e o ZXing nao devolve o texto." + NL,
        "FATORES_EC = {" + NL,
        # **A chave e' escrita.** Um `{` sem chaves em Python e' um conjunto, e
        # um conjunto de listas nao existe: o Python lia cada lista como valores
        # soltos e o resultado era um `set` de todos os inteiros de todos os
        # conjuntos.
        rs_com_chave("", ": [", "", ", ", "]", "    ") + NL,
        "}" + NL,
    ]
    return "".join(partes)


# --- o Java --------------------------------------------------------------


def java() -> str:
    partes = [
        "package com.qrcodegen.core.simbologias;" + NL + NL,
        "/**" + NL + " * As tabelas do Data Matrix. **Gerado** por "
        "`spec/gerar-tabelas-datamatrix.py`." + NL + " *" + NL,
        " * <p>Duas tabelas, e nenhuma delas e' dedutivel. <b>Nao editar a mao.</b>"
        + NL + " * Vem da implementacao de referencia do ZXing, que e' tambem o leitor"
        + NL + " * que verifica o que este encoder produz." + NL + " */" + NL,
        "public final class TabelasDataMatrix {" + NL + NL,
        "    private TabelasDataMatrix() {" + NL + "    }" + NL + NL,
        "    /**" + NL,
        "     * Os 24 simbolos quadrados, por ordem de capacidade." + NL + "     *" + NL,
        "     * <p><b>Os dois ultimos valem {@code -1}</b> quando o bloco e' o simbolo"
        + NL + "     * inteiro, que e' o caso de quase todos." + NL + "     */" + NL,
        "    public static final int[][] SIMBOLOS = {" + NL,
        simbolos("{", ", ", "}", "        ") + NL + "    };" + NL + NL,
        "    /**" + NL,
        nota("     * ") + NL,
        "     */" + NL,
        constantes_ultimo("    ", "    public static final int ULTIMO_{chave} = {valor};"),
        NL,
        "    /** Os factors de Reed-Solomon, por numero de codewords. */" + NL,
        "    public static final int[][] FATORES = {" + NL,
        rs_sem_chave("{", ", ", "}", "        ") + NL + "    };" + NL,
        "}" + NL,
    ]
    return "".join(partes)


# --- o Kotlin ------------------------------------------------------------


def kotlin() -> str:
    partes = [
        "package com.qrcodegen.core.simbologias" + NL + NL,
        "/**" + NL + " * As tabelas do Data Matrix. **Gerado** por "
        "`spec/gerar-tabelas-datamatrix.py`." + NL + " *" + NL,
        " * Sao duas tabelas, e nenhuma delas e' dedutivel. **Nao editar a mao.**"
        + NL + " * Vem da implementacao de referencia do ZXing." + NL + " */" + NL,
        "object TabelasDataMatrix {" + NL + NL,
        "    /**" + NL,
        "     * Os 24 simbolos quadrados, por ordem de capacidade." + NL + "     *" + NL,
        "     * **Os dois ultimos valem `-1`** quando o bloco e' o simbolo inteiro."
        + NL + "     */" + NL,
        "    val SIMBOLOS = arrayOf(" + NL,
        simbolos("intArrayOf(", ", ", ")", "        ") + NL + "    )" + NL + NL,
        "    /**" + NL,
        nota("     * ") + NL,
        "     */" + NL,
        constantes_ultimo("    ", "    const val ULTIMO_{chave} = {valor}"),
        NL,
        "    /** Os factors de Reed-Solomon, por numero de codewords. */" + NL,
        "    val FATORES = mapOf(" + NL,
        rs_com_chave("", " to intArrayOf(", "", ", ", ")", "        ") + NL,
        "    )" + NL,
        "}" + NL,
    ]
    return "".join(partes)


# --- o C# ----------------------------------------------------------------


def csharp() -> str:
    partes = [
        "namespace QrCodeGenerator.Core.Simbologias;" + NL + NL,
        "/// <summary>As tabelas do Data Matrix. <b>Gerado</b> por "
        "<c>spec/gerar-tabelas-datamatrix.py</c>.</summary>" + NL + NL,
        "/// <remarks>Sao duas tabelas, e nenhuma delas e' dedutivel. "
        "<b>Nao editar a mao.</b>" + NL + "/// Vem da implementacao de referencia "
        "do ZXing.</remarks>" + NL,
        "public static class TabelasDataMatrix" + NL + "{" + NL,
        "    /// <summary>Os 24 simbolos quadrados, por ordem de capacidade.</summary>"
        + NL + "    /// <remarks><b>Os dois ultimos valem <c>-1</c></b> quando o bloco "
        "e' o simbolo inteiro.</remarks>" + NL,
        "    public static readonly int[][] Simbolos =" + NL + "    {" + NL,
        simbolos("new[] { ", ", ", " }", "        ") + NL + "    };" + NL + NL,
        "    /// <summary>" + NL,
        nota("    /// ") + NL,
        "    /// </summary>" + NL,
        constantes_ultimo("    ", "    public const int ULTIMO_{chave} = {valor};"),
        NL,
        "    /// <summary>Os factors de Reed-Solomon, por numero de codewords."
        "</summary>" + NL,
        # **Os arrays e os mapas em PascalCase, e as constantes em MAIUSCULAS.**
        # E' a convencao que o `TabelasCode93.cs` ja segue — `Controles`, `Indice`
        # e `PADROES` — e nao uma preferencia: um ficheiro gerado com os nomes de
        # outra linguagem aparece no meio de um ficheiro que nao segue essa
        # convencao, e ninguem sabe dizer qual das duas e' a errada. **O gerador
        # escreve o codigo de cada linguagem, nao os nomes de uma delas em todas.**
        "    public static readonly Dictionary<int, int[]> Fatores =" + NL
        # **O `new()` nao e' opcional.** Sem ele o compilador trata o `{` como
        # inicio de um inicializador de *array* e diz `CS0622`, e `CS0131` em cada
        # chave. A forma `{ chave, valor }` dentro de `new()` nao sofre disso.
        + "    new()" + NL + "    {" + NL,
        # **O C# escreve a chave e o Java nao** — e' a unica diferenca entre os
        # dois lados do mesmo array bidimensional: um `Dictionary` sem chave nao
        # e' um dicionario, e um `int[][]` implica a ordem.
        rs_com_chave("{ ", ", ", "new[] { ", ", ", " } }", "        ") + NL,
        "    };" + NL + "}" + NL,
    ]
    return "".join(partes)


ESCRITORES = [web, python, java, kotlin, csharp]


def principal() -> int:
    """
    Escreve os cinco ficheiros, e diz quantos de cada.

    **A verificacao de que os cinco metem os mesmos numeros vive no
    verificador, e nao aqui.** Uma verificacao sobre a funcao que escreve vale
    pouco: uma funcao que erra duas vezes da a mesma resposta as duas vezes.
    **So a leitura dos cinco ficheiros ja escritos apanha uma virgula a menos** —
    e o verificador compara as sequencias de numeros, em vez de contar virgulas,
    que diferem entre linguagens.
    """
    for caminho, escrever in zip(ALVOS, ESCRITORES):
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(escrever(), encoding="utf-8", newline="")
        print(
            f"{caminho.relative_to(RAIZ)}: {len(SIMBOLOS)} simbolos, "
            f"{len(FATORES_EC)} conjuntos de factors"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
