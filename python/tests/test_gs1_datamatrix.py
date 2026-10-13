"""
Testes do GS1 DataMatrix.

Este e' o ficheiro de onde saem os casos de **todas** as pontas: o
``gerar-gs1-datamatrix-python.mjs`` le os ``CASOS`` daqui, e o
``descodificar-gs1-datamatrix-python.py`` le pelo ZXing o que o web codificou com eles.
**Nao ha uma segunda lista** - duas listas do mesmo conjunto divergem em silencio, que
e' o que aconteceu ao Code 93.

## O que o GS1 DataMatrix tem de ser, e como se prova

O encoder nao e' um texto com um 232 a frente: e' uma lista de codewords em que o
FNC1 - o **232** - aparece em posicoes que dependem da estrutura dos campos. Por isso
que os testes olham para os **codewords**, e nao para a imagem: o ZXing diz que o
simbolo se le, e os codewords dizem *porque*.

A propriedade central e' a ambiguidade do 232: **o FNC1 do inicio e o par de digitos
"02" sao o mesmo codeword** (``232 - 130 = 102``). So a posicao os distingue. Um
GS1 DataMatrix em que o 232 apareca onde devia estar um "02" desenha-se e le-se bem, e
o leitor le o lote com dois digitos a mais - o tipo de erro que so o teste de leitura
do outro lado do ZXing apanha.
"""

import pytest

from qrcode_core.simbologias import gs1_128, gs1_datamatrix
from qrcode_core.simbologias.gs1_datamatrix import FNC1
from qrcode_core.simbologias.upcean import SimbologiaError

#: Os casos de encode, com os codewords esperados byte a byte.
#:
#: **O segundo elemento sao os codewords inteiros, e nao o numero de modulos.** E' a
#: diferenca entre uma verificacao que apanha um erro e uma que nao: o numero de
#: modulos e' o mesmo para varios conjuntos de codewords, e os codewords sao o formato
#: de fio - e o que o ZXing le. Um `GS1 DataMatrix` com o 232 no sitio errado tem o
#: mesmo numero de modulos e le-se errado.
#:
#: Cada tuplo e' `(texto, codewords)`.
CASOS = [
    # --- o GTIN sozinho: um campo fixo, o caso mais simples -----------------
    # FNC1 + "01" (1+130) + o GTIN-14 aos pares (7 codewords) = 9.
    (
        "(01)04012345678901",
        [232, 131, 134, 131, 153, 175, 197, 219, 131],
    ),
    # --- GTIN e um lote ao fim: o "10" vai em digitos, o valor em ASCII ------
    # O "10" e' 10 + 130 = 140; "LOTE-A1" sao sete caracteres, cada um +1.
    (
        "(01)04012345678901(10)LOTE-A1",
        [
            232, 131, 134, 131, 153, 175, 197, 219, 131,
            140,
            77, 80, 85, 70, 46, 66, 50,
        ],
    ),
    # --- o lote no meio: ai recebe o separador antes do 17 -------------------
    # O FNC1 do inicio, o 140, "LOTE-A1", o 232 do separador, e o "17" (147) com a
    # data "270630" aos pares: 27 -> 157, 06 -> 136, 30 -> 160.
    (
        "(01)04012345678901(10)LOTE-A1(17)270630",
        [
            232, 131, 134, 131, 153, 175, 197, 219, 131,
            140, 77, 80, 85, 70, 46, 66, 50,
            232,
            147, 157, 136, 160,
        ],
    ),
    # --- tres campos: dois variaveis (10 e 21) e um fixo no fim (17) ---------
    # O (21) e' um SSCC **alfanumerico** de comprimento variavel: "SER-000123" vai em
    # ASCII. Os dois 232 do meio sao **um separador por campo variavel que nao seja
    # o ultimo**: um depois do (10), outro depois do (21). O (17) e' fixo e nao leva.
    (
        "(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630",
        [
            232, 131, 134, 131, 153, 175, 197, 219, 131,
            140, 77, 80, 85, 70, 46, 66, 50,
            232,
            151, 84, 70, 83, 46, 49, 49, 49, 50, 51, 52,
            232,
            147, 157, 136, 160,
        ],
    ),
    # --- o AI 415, um GLN de 13 digitos: o AI tem tres digitos, "415" ---------
    # "41" aos pares da 171, e o "5" que fica sem par vai em ASCII, 53 + 1 = 54. O GLN
    # "0123456789012" tem treze digitos: seis pares mais o "2" solto, que da 51. O
    # lote "LOTE-B2" em ASCII, cada caractere mais um - o "-" e' 45 + 1 = 46.
    (
        "(415)0123456789012(10)LOTE-B2",
        [
            232, 171, 54,
            131, 153, 175, 197, 219, 131, 51,
            140,
            77, 80, 85, 70, 46, 67, 51,
        ],
    ),
    # --- a posicao decimal implicita: 3103 -----------------------------------
    # "3103" aos pares: 31 -> 161, 03 -> 133. O valor "000123" aos pares:
    # 00 -> 130, 01 -> 131, 23 -> 153.
    (
        "(3103)000123",
        [232, 161, 133, 130, 131, 153],
    ),
]

#: As recusas, uma por ramo da validacao.
#:
#: **O segundo elemento e' a palavra que tem de estar na mensagem** - mais forte do que
#: um `pytest.raises` sem mais, que passa com um `TypeError` vindo de uma linha a
#: cima. E uma validacao que nao da a razao e' uma validacao que ninguem consegue
#: corrigir.
#:
#: A validacao vem do GS1-128, e sao **as mesmas recusas**: um AI de data invalida, um
#: GTIN com um digito a menos, um AI inexistente. **A paridade entre os dois formatos
#: exige que um campo valido num seja valido no outro** - e um `provar-maximo` mede
#: os 44 AIs de varios componentes em que o web divergia.
RECUSAS = [
    ("(01)9501101530003", "13"),  # GTIN com treze, e a mensagem diz os dois
    ("(11)155630", "GS1"),  # mes 56
    ("(888)ABC", "nao existe"),  # AI que a GS1 nao publica
    ("(01)", "valor"),  # campo sem valor
]


def test_o_fnc1_do_datamatrix_e_o_232_e_nao_o_do_code_128():
    """
    O FNC1 do Data Matrix e' o **232**, e o do Code 128 e' o 102.

    **Sao numeros diferentes em formatos diferentes, e a confusao entre eles e' o que
    faria o 232 virar um 102 dentro do simbolo** - um codigo que se desenhava e nao se
    lia. Este teste existe para o numero estar onde se le, e nao na memoria de quem o
    escreveu.
    """
    assert FNC1 == 232, "o FNC1 do Data Matrix e' o 232"


def test_o_codigo_word_do_gs1_data_matrix_comeca_no_fnc1():
    """O primeiro codeword de dados e' sempre o FNC1, sem excepcao.

    **E' o que diz ao leitor que isto e' GS1 e nao texto solto**, e e' o que o ZXing
    marca no `symbology_identifier` como ``]d2``. Um simbolo que comeca por outra
    coisa le-se como um Data Matrix normal, sem queixa nenhuma.
    """
    for texto, esperado in CASOS:
        codigo = gs1_datamatrix(texto)
        assert codigo["codewords"][0] == FNC1, f"o {texto} comeca no FNC1"


@pytest.mark.parametrize("texto,codewords", CASOS)
def test_o_encoder_emite_os_codewords_esperados(texto, codewords):
    """
    O encoder emite estes codewords, byte a byte.

    **E' a verificacao de nivel zero**: antes de gerar imagem nenhuma. Um ``GS1
    DataMatrix`` que desenha-se bem e le-se com um campo partido nao passa aqui - os
    codewordsestyao errados, e o ZXing na fase seguinte e' que diz o que errou.
    """
    codigo = gs1_datamatrix(texto)
    assert codigo["codewords"] == codewords


@pytest.mark.parametrize("texto,codewords", CASOS)
def test_o_valor_de_um_ai_numerico_vai_no_modo_de_digitos(texto, codewords):
    """
    O valor de um AI numerico vai no modo de digitos, aos pares.

    **A distincao do modo de digitos e' o que torna o 232 ambiguo**, e um valor
    numerico em ASCII em vez de digitos nao dava erro nenhum: desenhava-se certo,
    lia-se certo, e ocupava o dobro do espaco. **E' a segunda metade da decisao do
    `numerico`** - a primeira, o AI ir em digitos, e' uma linha a parte no encoder e
    nunca esteve dependente do AI.
    """
    codigo = gs1_datamatrix(texto)
    # O "01" do GTIN e' 1 + 130 = 131; e depois vem o valor aos pares. **A presenca do
    # 131 no fim da lista de codigo e' o GTIN em digitos, e nao em ASCII** - em ASCII
    # o '0' seria 49 e o '1' seria 50.
    assert 131 in codigo["codewords"], f"o GTIN de {texto} vai em digitos, como 131"


def test_o_valor_de_um_ai_alfanumerico_vai_em_ascii():
    """
    O valor de um AI **alfanumerico** vai em ASCII, um codeword por caractere.

    **E' o outro ramo da mesma decisao.** O `LOTE-A1` sao sete codewords, e nao quatro -
    que e' o que aconteceria se o `numerico` estivesse a dizer que sim para todo o
    mundo. **Um ramo sem caso e' um ramo onde um erro custa meses**, e os dois ramos
    precisam de um caso cada um.
    """
    codigo = gs1_datamatrix("(01)04012345678901(10)LOTE-A1")
    # O 140 e' o "10" em digitos; os sete seguintes sao "LOTE-A1" em ASCII, e cada
    # codeword menos um e' o caractere.
    pos10 = codigo["codewords"].index(140)
    lote = codigo["codewords"][pos10 + 1 : pos10 + 8]
    assert "".join(chr(cw - 1) for cw in lote) == "LOTE-A1"


def test_o_separador_so_vai_no_fim_de_um_variavel_que_nao_seja_o_ultimo():
    """
    O separador vai no fim de cada campo variavel, **menos no ultimo**.

    **Um separador no fim nao separa de nada**, e o leitor accounta-o como parte do
    campo seguinte. Por isso que:
    - o GTIN sozinho tem so o FNC1 do inicio;
    - o GTIN com o lote ao fim tem so o FNC1 do inicio;
    - o GTIN com o lote **no meio** tem o do inicio e o separador antes do ``(17)``.
    """
    soGtin = gs1_datamatrix("(01)04012345678901")
    assert soGtin["separadores"] == 1, "so o FNC1 do inicio"

    loteAoFim = gs1_datamatrix("(01)04012345678901(10)LOTE-A1")
    assert loteAoFim["separadores"] == 1, "o lote e' o ultimo, nao leva separador"
    assert "\x1d" not in loteAoFim["payload"]

    loteNoMeio = gs1_datamatrix("(01)04012345678901(10)LOTE-A1(17)270630")
    assert loteNoMeio["separadores"] == 2, "o do inicio e o separador antes do 17"
    assert loteNoMeio["payload"].count("\x1d") == 1


def test_o_payload_e_o_gs1_tem_o_gs_onde_o_separador_vai():
    """
    O ``payload`` e' a forma de maquina, com o ``GS`` onde o separador vai; e o ``gs1``
    e' a forma humana, sem separador nenhum.

    **O ``payload`` e' o que o ZXing devolve nos bytes**, e portanto o que o teste de
    leitura compara. O ``gs1`` e' o que a pessoa le, com os AI entre parenteses.
    """
    codigo = gs1_datamatrix("(01)04012345678901(10)LOTE-A1(17)270630")
    assert codigo["payload"] == "010401234567890110LOTE-A1\x1d17270630"
    assert codigo["gs1"] == "(01)04012345678901(10)LOTE-A1(17)270630"


def test_o_fnc1_do_inicio_e_o_separador_sao_o_mesmo_codigo():
    """
    O FNC1 do inicio e o separador sao o **mesmo** 232, e nao dois codigos diferentes.

    **Ao contrario do que se pode supor**, e como no GS1-128. **A distincao e' a
    posicao** - o primeiro codeword e' o inicio, os do meio sao separadores - e nao o
    valor.
    """
    codigo = gs1_datamatrix("(01)04012345678901(10)LOTE-A1(17)270630")
    fcs = [cw for cw in codigo["codewords"] if cw == FNC1]
    assert len(fcs) == 2, "sao dois FNC1"
    assert all(cw == FNC1 for cw in fcs), "e sao o mesmo codigo"


def test_a_forma_humana_aceita_o_espaco_de_leitura():
    """A GS1 escreve ``(10) LOTE-A1`` nos exemplos, e o espaco nao faz parte do valor.

    **O `strip` e' o que torna a forma humana legivel.** Sem ele, metade dos exemplos
    que a propria GS1 escreve seriam recusados. E o espaco **nao vai para o simbolo** -
    o valor no codigo e' ``LOTE-A1``, e nao `` LOTE-A1``.
    """
    codigo = gs1_datamatrix("(01)04012345678901(10) LOTE-A1 (17)270630")
    assert codigo["gs1"] == "(01)04012345678901(10)LOTE-A1(17)270630"
    assert "L" in codigo["gs1"]


def test_o_ai_de_tres_digitos_nao_arrasta_o_quarto():
    """
    Um ``(3103)`` e' um AI de **quatro** digitos, e nao um ``31`` com o ``03`` a mais.

    **Nao se pode saber pelo primeiro digito** - e' o que o `ai_de` resolve. Se o
    ``03`` fosse lido como parte do valor, o codigo seria outro e o ZXing leria um
    peso diferente.
    """
    codigo = gs1_datamatrix("(3103)000123")
    # O "3103" em digitos: 31 -> 161, 03 -> 133. **Se o AI fosse "31", seriam 161 e o
    # valor comecaria no 03 em ASCII.**
    assert codigo["codewords"][1:3] == [161, 133]


@pytest.mark.parametrize("texto,palavra", RECUSAS)
def test_as_recusas_dizem_porque(texto, palavra):
    """Uma recusa tem de dizer **porquê**, e a palavra tem de estar na mensagem.

    E o `pytest.raises` sem mais **passa com um `TypeError` vindo de uma linha a
    cima** - por isso que se mede a mensagem e nao o facto de ter lancado.
    """
    with pytest.raises(SimbologiaError) as erro:
        gs1_datamatrix(texto)

    assert palavra in str(erro.value), f"a recusa de {texto} diz '{palavra}'"


def test_a_recusa_diz_o_gs1_data_matrix_e_nao_o_gs1_128():
    """
    A mensagem de recusa identifica o **formato certo**.

    **O `analisar` e' o do GS1-128**, com um rotulo - porque a tabela, o `fixo`, o
    `maximo` e o `regex` sao os mesmos nos dois. O rotulo existe para uma mensagem que
    diz "GS1-128" quando o utilizador fez um GS1 DataMatrix nao o mandar procurar o erro
    no sitio errado.
    """
    with pytest.raises(SimbologiaError) as erro:
        gs1_datamatrix("(01)9501101530003")

    mensagem = str(erro.value)
    assert mensagem.startswith("GS1 DataMatrix: "), mensagem
    assert "GS1-128" not in mensagem


def test_o_gs1_128_diz_o_gs1_128():
    """E o GS1-128 continua a dizer "GS1-128" - o rotulo tem um valor por omissao."""
    with pytest.raises(SimbologiaError) as erro:
        gs1_128("(01)9501101530003")

    assert str(erro.value).startswith("GS1-128: ")


def test_a_validacao_e_a_do_gs1_128_e_da_o_mesmo_veredicto():
    """
    Um campo **valido** num e' valido no outro: a tabela e' a mesma e o `analisar` e' o
    mesmo.

    **Este e' o teste que garante a paridade dos dois formatos**, e o que apanha a
    divergencia do `maximo`: o web tinha o seu proprio `analisar`, que usava o
    comprimento do **ultimo** componente em vez da **soma**, e recusava 44 AIs que o
    GS1-128 aceitava. **Um AI de varios componentes tem um valor que e' a soma deles.**
    """
    # O 253 e' `N3+N13[+X..17]`: ultimo componente 17, soma 30.
    trinta = "1" * 30
    # Nos dois formatos o valor de 30 e' valido.
    gs1_datamatrix(f"(253){trinta}")
    gs1_128(f"(253){trinta}")

    # E 31 e' recusado nos dois, com o mesmo maximo na mensagem.
    for encoder in (gs1_datamatrix, gs1_128):
        with pytest.raises(SimbologiaError) as erro:
            encoder(f"(253){'1' * 31}")
        assert "aceita no maximo 30" in str(erro.value)


def test_o_gs1_datamatrix_esta_no_registro():
    """O GS1 DataMatrix tem entrada no registo, com a chave que o selector usa.

    **A chave e' a mesma nos cinco clientes**, e e' o que a `AGENTS.md` chama de lista
    escrita duas vezes: o selector de formatos vive no cliente e o registo vive no
    modulo. Um registo sem ``<option>`` no selector e' um formato invisivel - que e' o
    que aconteceu ao GS1-128 quando entrou sem aparecer.
    """
    from qrcode_core.simbologias import SIMBOLOGIAS_TODAS

    assert "gs1-datamatrix" in SIMBOLOGIAS_TODAS
    assert SIMBOLOGIAS_TODAS["gs1-datamatrix"] is gs1_datamatrix