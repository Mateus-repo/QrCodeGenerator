"""
GS1 DataMatrix.

O Data Matrix com o FNC1, e nada mais. E' o que vai na etiqueta de uma ampola de
farmacia e de um chip: quadradinho, minusculo, e com a capacidade de um simbolo que
se le de longe e de lado.

## O que muda em relacao ao Data Matrix

Duas coisas, e as duas sao o FNC1 - o codeword 232:

  1. **No inicio**, logo no primeiro codeword de dados. E' o que diz ao leitor "isto
     e' GS1" e nao texto solto.
  2. **No fim de cada campo de comprimento variavel**, menos no ultimo. E' o
     separador, e e' o que permite ao leitor saber onde acaba ``(10)LOTE-A1`` e onde
     comeca o campo seguinte.

## Porque isto nao e' "o texto com um 232 a frente"

**O 232 e' simultaneamente o FNC1 e o par de digitos "02"**, porque ``232 - 130 =
102`` - e o valor 102 e' exactamente o do FNC1 no Code 128, por acaso, o que torna a
coisa mais chata demanage. So a posicao os distingue: na posicao 0 e' o FNC1, no
meio e' um "02" qualquer. Passar pelo :func:`~.datamatrix.compactar` perderia essa
estrutura, e o separador no meio do lote seria lido como os digitos "02".

Por isso o encoder emite codewords e nao texto, e por isso que o
:func:`~.datamatrix.data_matrix_de_codewords` existe. Todo o resto - a escolha do
simbolo, o enchimento, a correccao de erros, a colocacao - **e' o mesmo** que o
Data Matrix normal, porque uma segunda implementacao de cada uma delas seria uma
segunda fonte de verdade sobre a parte que o ZXing verifica.

## A validacao dos AI vem do GS1-128, e nao e' uma copia

A tabela dos 541 AIs, o ``fixo``, o ``maximo``, o ``resto`` do ``ai_de`` e o
``regex`` da GS1 sao **os mesmos** que o GS1-128 usa, e vem do
:func:`~.gs1.analisar` com um rotulo. **Nao ha uma segunda tabela de AI nem uma
segunda notacao**: os campos de um GS1 DataMatrix sao os mesmos campos de um
GS1-128, e um ``(10)`` tem o mesmo comprimento num e no outro.

O que muda e' so a notacao dos AIs **dentro do simbolo**: no Data Matrix, os digitos
do AI e do valor numerico vao no modo de digitos, que emparelha e soma 130. E e' por
isso que o FNC1 e' ambiguo - o "02" de ``(02)`` e o 232 sao o mesmo codeword.

## O que o leitor devolve, medido

Com ``web/tests/ver-dm-fnc1.py``, antes deste encoder existir:

  - ``symbology_identifier`` - ``]d2`` com FNC1 no inicio, ``]d1`` sem;
  - ``content_type`` - ``GS1`` com FNC1, ``Text`` sem;
  - ``bytes`` - os campos com ``0x1D`` onde esta' o separador, como no GS1-128;
  - ``text`` - os AI entre parenteses, como no GS1-128, e ``<GS>`` no separador.
"""

from __future__ import annotations

from .datamatrix import data_matrix_de_codewords
from .gs1 import GS, FNC1 as _FNC1_128, analisar

#: O FNC1 do Data Matrix. **E' o 232, e nao o 102 do Code 128.**
#:
#: Os dois FNC1 saem com o mesmo valor numerico por acaso - o 232 do Data Matrix e o
#: 102 do Code 128 - e sao codewords de formatos diferentes. Importamos o do GS1-128
#: para o caso de ele vir a ser preciso, mas **o que vai no simbolo e' o 232**.
FNC1 = 232

#: O GS que separa os campos, o mesmo byte que o leitor devolve.
GS_SEPARADOR = GS


def _digitos(texto: str) -> list[int]:
    """
    O modo de digitos: emparelha e soma 130.

    O Data Matrix tem um modo so para numeros, em que dois digitos cabem num codeword.
    O GS1 usa-o para **os AI e para os valores numericos**, que e' o que torna o 232
    ambiguo: o par "02" da ``2 + 130 = 132``, e o FNC1 e' 232.

    Um digito que fica sem par - o ultimo de um AI com numero impar de digitos - vai
    no modo ASCII, o valor mais um. Nao ha outro jeito: o modo de digitos trabalha
    aos pares.
    """
    saida: list[int] = []
    i = 0

    while i < len(texto):
        if i + 1 < len(texto):
            saida.append(int(texto[i : i + 2]) + 130)
            i += 2
        else:
            saida.append(ord(texto[i]) + 1)
            i += 1

    return saida


def _ascii(texto: str) -> list[int]:
    """O modo ASCII: o valor mais um."""
    return [ord(c) + 1 for c in texto]


def gs1_datamatrix(elemento_string: str) -> dict:
    """
    O codigo GS1 DataMatrix.

    :param elemento_string: os campos na forma humana da GS1, com os AI entre
        parenteses: ``(01)04012345678901(10)LOTE-A1``. Igual ao GS1-128, e pela mesma
        razao - e' a forma que a GS1 define e a que a pessoa le. Os parenteses nao vao
        para o simbolo.
    :returns: o que o ``data_matrix_de_codewords`` devolve, mais ``campos``, ``gs1``,
        ``payload`` e ``separadores``.

    ## O separador, e a mesma regra do GS1-128

    No fim de cada campo de comprimento variavel, **menos no ultimo**. Um FNC1 a mais
    produz um ``0x1D`` nos bytes que o leitor nao esperava, e o GS1 DataMatrix e' lido
    por leitores que sao mais rigorosos que o ZXing.
    """
    campos = analisar(elemento_string, "GS1 DataMatrix")

    # Os codewords, na ordem: FNC1, e depois cada campo com o seu separador.
    #
    # **Cada campo vai codificado conforme o que e': o AI e os valores numericos no
    # modo de digitos, o resto em ASCII.** Um ``(10)LOTE-A1`` da o "10" em digitos e
    # o "LOTE-A1" em ASCII, e e' essa mistura que faz o 232 ser ambiguo.
    codewords: list[int] = [FNC1]

    ultimo = len(campos) - 1
    for i, campo in enumerate(campos):
        codewords.extend(_digitos(campo["ai"]))
        valor = campo["conteudo"]
        codewords.extend(_digitos(valor) if campo["numerico"] else _ascii(valor))

        if campo["separador"] and i != ultimo:
            codewords.append(FNC1)

    codigo = data_matrix_de_codewords(codewords, "GS1 DataMatrix")

    return {
        **codigo,
        "campos": campos,
        "gs1": "".join(f"({c['ai']}){c['valor']}" for c in campos),
        # A forma de maquina, sem parenteses e com o GS nos separadores - que e' o
        # que o ZXing devolve nos bytes, e portanto o que o teste compara.
        "payload": "".join(
            c["ai"] + c["valor"] + (GS if c["separador"] and i != ultimo else "")
            for i, c in enumerate(campos)
        ),
        "separadores": sum(1 for cw in codewords if cw == FNC1),
    }


#: O registo, pelo id que o selector usa.
#:
#: **A chave e' a mesma nos cinco clientes**, e e' o que a `AGENTS.md` chama de lista
#: escrita duas vezes: o selector de formatos vive no cliente e o registo vive no
#: modulo, e nada os ligava. Um registo sem ``<option>`` no selector e' um formato
#: invisivel - que e' o que aconteceu ao GS1-128 quando entrou sem aparecer.
SIMBOLOGIAS_GS1_DATAMATRIX = {"gs1-datamatrix": gs1_datamatrix}