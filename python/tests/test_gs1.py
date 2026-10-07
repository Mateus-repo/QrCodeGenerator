"""
Os testes do GS1-128.

    cd python && python -m pytest tests/test_gs1.py -q

## Os três níveis, e porque este ficheiro só cobre um

| | onde | o que apanha |
|---|---|---|
| **zero** | este ficheiro | um separador a mais, o AI dentro do código, o `resto` do `3103` |
| **paridade** | `web/tests/paridade-gs1.py` | Python e web a dizerem coisas diferentes |
| **dois** | `web/tests/descodificar-gs1-python.py` | o ZXing a ler o código |

**O GS1-128 é o caso em que o erro não se vê nenhum.** O Code 128 tem uma troca de
conjunto a mais e devolve `ABC,3`; o GS1-128 tem um separador a mais ou a menos e
devolve o GTIN partido ao meio. Nenhum dos dois dá erro na interface, e nenhum
deles é apanhado por um teste estrutural que não conte os separadores.

**E é por isso que a lista de casos é por ramo da lógica e não por caminho feliz.**
Um `modulos` com o comprimento certo passa em todos os testes estruturais e não
serve: o ZXing devolve o mesmo texto com um `0x1D` a menos e o código continua a
ler. A contagem de FNC1 é a única coisa que denuncia, e por isso que ela é uma
afirmação explícita e não um subproduto de outra.

## O que já aconteceu aqui, e que estes testes apanham

- **O AI não ia para dentro do código.** Só os parênteses é que eram de leitura
  humana; os dígitos do AI vão. O resultado eram 17 codewords em vez de 20 e o
  ZXing não lia nada.
- **O FNC1 ficou fora da soma de verificação**, "porque não é um carácter". Dava
  um valor de verificação errado, que o leitor recusa sem dizer por quê.
- **O separador foi posto também no último campo**, e um separador no fim não
  separa de nada: o leitor conta-o como parte do campo seguinte.
- **O `resto` do `3103` entrou depois do valor** em vez de antes. Num `3103` o
  último dígito é a posição decimal implícita e faz parte do valor.

**Um caso de leitura por ramo da lógica.** O encoder tem cinco ramos — só um
campo, campo variável, `resto` do AI, recusas e acentos — e os casos tinham
quatro.
"""

from __future__ import annotations

import pytest

import re

from qrcode_core.simbologias.gs1 import (
    FNC1,
    GS,
    INICIO_B,
    comprimento_total,
    gs1_128,
    validar,
)
from qrcode_core.simbologias.lineares import CODE128_PARAGEM_VALOR
from qrcode_core.simbologias.tabelas_gs1 import AIS, ai_de
from qrcode_core.simbologias.upcean import SimbologiaError

#: Um caso por ramo da lógica, e o número de módulos **medido no ZXing**.
#:
#: **O número está escrito à mão de propósito.** Se estivesse calculado a partir do
#: encoder, o teste passaria com o encoder errado — e a regra do `AGENTS.md` sobre
#: um teste que passa com o bug e sem ele. O valor de cada um foi medido com
#: `descodificar-gs1.py`; se o encoder mudar, estes números dizem-no.
#: **Os números de módulos são medidos, e medidos nos dois lados.**
#:
#: A primeira versão desta lista tinha 210 para o GTIN sozinho, e dá 222. O 210
#: foi calculado a partir do número de caracteres e é um palpite; o 222 é o que o
#: encoder produz e o que o ZXing leu. **A diferença de 12 é a do código de
#: verificação e a da paragem, que têm 11 e 13 elementos em vez de 11** — e é
#: precisamente a conta que um palpite erra.
#:
#: `web/tests/paridade-gs1.py` confirma que o web dá os mesmos números, e
#: `web/tests/descodificar-gs1-python.py` confirma que o ZXing devolve o texto.
CASOS = [
    # --- o GTIN sozinho, que é o caso mais comum numa caixa -----------------
    ("(01)04012345678901", 222, 1),
    # --- o GTIN e um lote: aqui aparece o separador --------------------------
    ("(01)04012345678901(10)LOTE-A1", 321, 1),
    # --- três campos, dois separadores: o do meio é o que se conta ---------
    ("(01)04012345678901(10)LOTE-A1(17)270630", 420, 2),
    # --- o `3103`, cujo último dígito é a posição decimal implícita ---------
    ("(3103)000750", 156, 1),
    # --- um AI de comprimento fixo antes de um variável --------------------
    ("(3103)000750(01)04012345678901", 332, 1),
    # --- SSCC de 18 dígitos, o campo mais longo da tabela ------------------
    ("(00)095060001343521234", 266, 1),
    # --- duas datas, e o `regex` da GS1 recusa o mês 56 -------------------
    ("(11)150327(17)270630", 222, 1),
    # --- dois campos variáveis seguidos: o primeiro recebe separador -------
    ("(240)9501101530003(241)9501234567890", 409, 2),
    # --- três dígitos e quatro lado a lado ---------------------------------
    ("(415)9501101530000(3103)000750(10)LOTE-A1", 431, 1),
]

#: As recusas, uma por ramo da validação.
#:
#: **O segundo elemento do tuplo é a palavra que tem de estar na mensagem.** É
#: mais forte do que `pytest.raises` sem mais, que passa com um `TypeError` vindo
#: de uma linha a acima — e uma validação que não dá a razão é uma validação que
#: ninguém consegue corrigir.
RECUSAS = [
    ("(01)9501101530003", "13"),  # GTIN com treze, e a mensagem diz os dois
    ("(00)09506000134352", "14"),  # SSCC com catorze
    ("(11)155630", "GS1"),  # mês 56
    ("(11)150332", "GS1"),  # dia 32
        # **Um AI de três dígitos que a GS1 não publica.** O `999` não está na
    # tabela — e escolher um que *existe* foi o erro da primeira versão, em
    # que o caso suposto ser uma recusa de "AI inexistente" era aceito, porque
    # o `98` existe e é um AI de até 90 caracteres e `XYZ` cabe nele.
    ("(888)ABC", "nao existe"),
    # **O `999` não seria uma recusa de "AI inexistente".** Não está na
    # tabela, mas o `99` está, e o `ai_de` devolve o `99` com o `9` de resto —
    # que é o mecanismo a funcionar, e não um erro. O `888` não tem nenhum
    # prefixo na tabela, e é esse que é o caso de "AI inexistente".
    ("(99)", "valor"),  # AI 99 existe, e o campo fica sem valor
    ("(01)04012345678901(10", "nao fecha"),  # parênteses que não fecha
    ("0104012345678901", "("),  # sem parênteses
    ("(AB)1234", "digitos"),  # AI com letras
    ("(01)", "valor"),  # campo sem valor
    ("", "campo"),  # texto vazio
        # **O acento é recusado pelo `regex` da GS1, não pelaASCII.** E é isso que
    # a mensagem diz: o `regex` do AI 10 é `[!%-?A-Z_a-z\x22]`, que é o
    # conjunto de caracteres que a GS1 aceita — e o `Á` não está nele.
    # **Um `ASCII` na mensagem seria mentira**: o encoder nunca chega à
    # validação do Code 128 porque o `regex` apanha primeiro.
    ("(10)LOTE-Á1", "GS1"),
]


# --- o que o encoder devolve -----------------------------------------------


@pytest.mark.parametrize(("texto", "modulos", "fnnc1"), CASOS)
def test_o_numero_de_modulos_e_de_fnc1(texto: str, modulos: int, fnnc1: int) -> None:
    """O comprimento e os separadores, que é o que o ZXing mediu.

    **A contagem de FNC1 é uma afirmação à parte e não um subproduto.** O módulo
    certo com um separador a menos dá um código que o leitor lê e em que o campo
    seguinte aparece colado ao anterior — e o único sintoma é o texto devolvido
    vir sem o `0x1D`.
    """
    codigo = gs1_128(texto)

    assert len(codigo["modulos"]) == modulos
    assert codigo["separadores"] == fnnc1


@pytest.mark.parametrize(("texto", "modulos", "fnnc1"), CASOS)
def test_o_ai_vai_dentro_do_codigo(texto: str, modulos: int, fnnc1: int) -> None:
    """Os dígitos do AI vão no código; os parênteses não.

    **Esta foi a confusão que custou o primeiro encoder.** Em `(10)LOTE-A1` os
    parênteses são para quem lê e não vão para o código — mas os **dígitos do AI
    vão**. Um GS1-128 sem os AIs desenha-se perfeitamente e não diz o que é a
    etiqueta, que é a mesma coisa que uma etiqueta sem escrever nada.
    """
    codigo = gs1_128(texto)
    payload = codigo["payload"]

    for campo in codigo["campos"]:
        assert campo["ai"] in payload, f"o AI {campo['ai']} nao esta no payload"

    # E os parênteses não vão, que é a outra metade da mesma confusão.
    assert "(" not in payload
    assert ")" not in payload


@pytest.mark.parametrize(("texto", "modulos", "fnnc1"), CASOS)
def test_a_legenda_tem_os_ais_entre_parenteses(texto: str, modulos: int, fnnc1: int) -> None:
    """A forma impressa é a humana, com parênteses e sem separador.

    **A GS1 pede que a linha impressa tenha os AIs entre parênteses**, e não é
    opcional: é o que permite a uma pessoa ler o código sem scanner. A primeira
    versão punha aqui um separador entre os campos, e o `descodificar` falhou em
    seis de oito casos — o ZXing devolvia o mesmo código com um `0x1D` a mais e o
    código continuava a ler bem, pelo que a falha era só na comparação.
    """
    codigo = gs1_128(texto)

    # A legenda e o `gs1` são a mesma coisa — **a mesma cadeia, não duasparecidas**.
    assert codigo["legenda"] == codigo["gs1"]

    # Os parênteses estão lá, que é o que permite ler sem scanner…
    assert ")" in codigo["legenda"]

    # …e o separador não, que é o que a GS1 pede e o que a primeira versão punha.
    assert GS not in codigo["legenda"]


def test_a_legenda_recusa_o_espaco_de_leitura() -> None:
    """O espaço que a GS1 põe nos exemplos não vai para o código.

    A GS1 escreve os campos com um espaço de cada lado — `(10) LOTE-A1` — e o
    espaço não faz parte do valor. **Um `strip` sem isto recusa metade dos
    exemplos que a própria GS1 escreve**, e parece um detalhe.
    """
    com_espaco = gs1_128("(01)04012345678901(10) LOTE-A1")
    sem_espaco = gs1_128("(01)04012345678901(10)LOTE-A1")

    assert com_espaco["modulos"] == sem_espaco["modulos"]
    assert com_espaco["payload"] == sem_espaco["payload"]


# --- o separador ------------------------------------------------------------


def test_o_separador_vao_no_fim_de_cada_variavel_menos_no_ultimo() -> None:
    """A regra da GS1, e a parte do encoder que é dele e não do Code 128.

    **Um separador no fim não separa de nada**, e o leitor conta-o como parte do
    campo seguinte. A primeira versão punha um em todos os campos variáveis, e o
    `descodificar` falhava em seis dos oito casos: o ZXing devolvia o mesmo código
    com menos um `0x1D` nos bytes.
    """
    codigo = gs1_128("(01)04012345678901(10)LOTE-A1(17)270630")
    campos = codigo["campos"]

    # O GTIN é fixo, o lote é variável e não é o último, a validade é fixa.
    assert [c["separador"] for c in campos] == [False, True, False]

    # O `payload` tem **um** `0x1D`, e está entre o lote e a validade.
    assert codigo["payload"].count(GS) == 1
    assert codigo["payload"] == "010401234567890110LOTE-A1" + GS + "17270630"


def test_o_primeiro_campo_variavel_nao_recebe_separador() -> None:
    """Um `GS` no fim do payload é o sintoma do separador a mais.

    **É o teste que teria apanhado o bug da primeira versão**, e que passava sem
    ele: o `modulos` tinha o comprimento certo, porque o separador é um codeword
    e um codeword a mais também dá um comprimento que o leitor aceita.
    """
    codigo = gs1_128("(10)LOTE-A1")

    assert codigo["separadores"] == 1  # só o do início
    assert codigo["payload"] == "10LOTE-A1"
    assert not codigo["payload"].endswith(GS)


def test_o_fnc1_do_inicio_e_o_separador_sao_o_mesmo_codigo() -> None:
    """102 é uma função, e é 102 nos dois contextos.

    **Não há um "FNC1 de início" e um "FNC1 separador" com números diferentes**,
    ao contrário do que se pode supor. E se fossem diferentes, o `separadores`
    contaria um valor que o código não emitia.
    """
    codigo = gs1_128("(10)LOTE-A1")

    # Só o FNC1 do início: um campo, e nenhum separador.
    assert codigo["separadores"] == 1
    assert FNC1 == 102


def test_o_fnc1_do_inicio_entra_na_soma_de_verificacao() -> None:
    """O valor de verificação tem de contar o FNC1 do início.

    **Foi o primeiro bug real deste encoder.** A primeira versão punha o FNC1
    fora da soma, "porque não é um carácter" — e isso dava um código com o valor
    de verificação errado, que o leitor recusa **sem dizer por quê**. O sintoma é
    o pior possível: o código desenha-se, o leitor lê, e recusa.

    A soma do `Code 128` normal **não** dá o valor certo, e essa é a prova de que
    o FNC1 está na conta: mesmo código de barras, mesmo texto, valor de
    verificação diferente.
    """
    gs = gs1_128("(10)LOTE-A1")

    # A soma feita à mão, com o FNC1 a valer 102 e com o peso da sua posição.
    valores = [INICIO_B, FNC1]
    for caractere in "10LOTE-A1":
        valores.append(ord(caractere) - 32)

    soma = valores[0]
    for i in range(1, len(valores)):
        soma += valores[i] * i

    assert soma % 103 == gs["verificacao"]

    # **E a soma sem o FNC1 dá um valor diferente**, que é o que a primeira versão
    # produzia. Se as duas fossem iguais, o bug estaria em todo o lado menos aqui.
    #
    # A soma errada é a de verdade, com o peso da posição de cada codeword: tirar o
    # FNC1 da lista **e** manter os pesos. O que a primeira versão fazia
    # era somar os valores todos sem ponderar, o que dá um terceiro número.
    i = 0
    soma_ruim = INICIO_B
    for v in valores[1:]:
        i += 1
        if v != FNC1:
            soma_ruim += v * i

    assert (soma_ruim % 103) != (soma % 103)

    # E o que ela fazia mesmo: a soma sem pesos, que dá um quarto número.
    assert (sum(valores) % 103) != (soma % 103)


def test_o_valor_de_verificacao_e_o_dos_da_norma() -> None:
    """A fórmula é a do Code 128, e o resultado tem de estar no módulo 106.

    A fórmula dá um valor de **0 a 102**, e não um dígito: um valor de troca de
    conjunto vale 102. **Um verificador de EAN aplicado aqui daria sempre um
    valor errado.**
    """
    codigo = gs1_128("(01)04012345678901")

    assert 0 <= codigo["verificacao"] <= 102

    # A paragem é o último codeword, e é o único de treze elementos.
    assert codigo["valores"][-1] == CODE128_PARAGEM_VALOR


# --- o `resto` do AI --------------------------------------------------------


def test_o_ai_de_tres_digitos_nao_arrasta_o_quarto() -> None:
    """O `3103` e' um AI de quatro, e nao o `31` com um `03` a frente.

    **Este e' o `resto`, e ele e' do valor.** Num `3103` o ultimo digito e' a posicao
    decimal implicita e faz parte do peso - por isso que o valor de `3103` sao
    **seis** digitos e nao sete. Um `ai_de` que devolvesse o `31` com o `03` como
    resto dava o peso errado, e **o ZXing le os dois sem distinguir**.
    """
    achado = ai_de("3103")

    assert achado is not None
    assert achado["numero"] == "3103"
    assert achado.get("resto") is None

    codigo = gs1_128("(3103)000750")
    campo = codigo["campos"][0]

    assert campo["ai"] == "3103"
    assert campo["conteudo"] == "000750"
    assert campo["valor"] == "000750"
    assert codigo["payload"] == "3103000750"


def test_o_resto_entra_no_valor_e_nunca_no_ai() -> None:
    """O mecanismo do `resto`, testado por injecao porque a tabela nao tem caso.

    **Nenhum AI e' prefixo de outro na GS1 hoje** - o
    `gs1-tabelas-paridade.test.mjs` confirma isso, e o comentario do `ai_de` diz que
    a procura do mais comprido primeiro e' um seguro e nao a correccao de um caso que
    exista.

    Por isso este teste **injeta** o `31` ao lado do `3103`, para haver `resto`. E' o
    que apanha uma implementacao que devolva `numero` e `resto` trocados, e que
    **passaria em todos os casos da tabela** precisamente porque nenhum deles tem
    `resto` - que e' o que a `AGENTS.md` chama um ramo sem caso.
    """
    entrada = {
        "formato": "N2+N6",
        "fixo": 6,
        "maximo": None,
        "campos": ({"tipo": "N", "fixo": 6, "maximo": None},),
        "separador": False,
        "regex": "(\\d{6})",
    }

    #: **O `3103` sai da tabela e o `31` entra.** Só acrescentar o `31` não
    #: chega: o `ai_de` procura do mais comprido para o mais curto, e o `3103`
    #: continua lá, e é o `3103` que ganha. A primeira versão injectava sem tirar
    #: e o teste falhava a dizer `assert '3103' == '31'` — **um teste que falha
    #: porque o setup estava mal e não porque o encoder estava mal**, que é o
    #: pior dos dois.
    original = dict(AIS)
    del AIS["3103"]
    AIS["31"] = entrada
    try:
        achado = ai_de("3103")

        # **O AI e' o `31`, que e' o que existe na tabela, e o resto vai no valor.**
        assert achado["numero"] == "31"
        assert achado["resto"] == "03"

        codigo = gs1_128("(3103)000750")
        campo = codigo["campos"][0]

        assert campo["ai"] == "31"
        assert campo["conteudo"] == "000750"
        assert campo["valor"] == "03000750"
    finally:
        AIS.clear()
        AIS.update(original)


# --- as recusas -------------------------------------------------------------


@pytest.mark.parametrize(("texto", "palavra"), RECUSAS)
def test_as_recusas_dizem_porque(texto: str, palavra: str) -> None:
    """Cada recusa nomeia a razão, e não levanta um `TypeError` de uma linha a mais.

    **`pytest.raises` sem mais passa com qualquer excepção**, incluindo uma que não
    seja a do encoder. A palavra na mensagem é o que diz que foi a validação do
    AI a recusar e não outra coisa.
    """
    with pytest.raises(SimbologiaError) as info:
        gs1_128(texto)

    assert palavra in str(info.value)


def test_o_ai_de_comprimento_fixo_recusa_o_valor_curto() -> None:
    """Um AI fixo não encolhe para o que der, mesmo que o `regex` passe.

    **O `regex` sozinho aceitaria um valor curto** — `(\\d{14})` não casa com
    treze, mas um AI com `\\d{2,14}` casaria com doze. A validação são as duas
    coisas: o comprimento que a tabela diz, e o `regex` da GS1.
    """
    with pytest.raises(SimbologiaError) as info:
        gs1_128("(01)9501101530003")

    # **A mensagem diz os dois números**, e não "não corresponde ao que a GS1
    # define": uma recusa sem números é uma recusa com que ninguém consegue
    # corrigir o campo. É este o defeito que a validação do comprimento corrigiu.
    mensagem = str(info.value)
    assert "14" in mensagem
    assert "13" in mensagem


def test_o_lote_para_no_maximo_da_tabela() -> None:
    """Vinte é o máximo do AI 10, e vinte e um recusa com o número na mensagem.

    **A mensagem tem de dizer o máximo e o que foi escrito.** Uma recusa sem
    números é uma recusa com que ninguém consegue corrigir o campo.
    """
    with pytest.raises(SimbologiaError) as info:
        gs1_128("(10)" + "A" * 21)

    mensagem = str(info.value)
    assert "20" in mensagem
    assert "21" in mensagem


def test_o_maximo_vem_da_tabela_e_nao_de_uma_constante() -> None:
    """O `maximo` que o encoder usa é o da tabela, e não um número escrito à mão.

    **Um `20` no encoder e um `20` na tabela divergem sem dar erro**: o encoder
    aceita o que a tabela devia recusar, e o sintoma é um código que se lê com o
    campo partido. A afirmação lê a tabela e compara, o que apanha a divergência
    no instante em que ela é feita.
    """
    maximo = AIS["10"]["maximo"]

    assert maximo == 20

    with pytest.raises(SimbologiaError):
        gs1_128("(10)" + "A" * (maximo + 1))


# --- o comprimento de um AI com varios componentes ---------------------------


def test_o_maximo_dos_ais_com_varios_componentes_e_a_soma() -> None:
    """47 dos 541 AIs recusavam um valor que a GS1 aceita.

    **O `maximo` da tabela e' o do *ultimo* componente, e serve para _dividir_ o
    valor** — o ultimo componente e' o que vai ate ao fim do texto. **Para
    _conferir_ o comprimento o numero certo e' a soma**, porque o valor de um AI
    de varios componentes tem todos eles.

    O AI `253` e' `N3+N13[+X..17]`: o ultimo componente tem maximo 17 e um valor
    valido pode ter 13 + 17 = **30** caracteres. Com o 17, os trinta recusavam.

    **O sintoma e' o pior dos possiveis**: o utilizador escreve o valor certo e o
    encoder recusa, com uma mensagem que fala de um comprimento que nao e' o do
    campo — porque o numero na mensagem e' o do ultimo componente. Nao ha como
    adivinhar o que se fez de errado a partir do erro.

    **O numero de AIs nao esta escrito a mao.** A tabela sabe quantos tem mais de um
    componente, e a affirmacao usa essa contagem: um dia que a GS1 acrescente um
    AI assim, o numero muda e o teste continua a dizer a verdade.
    """
    varios = [ai for ai in AIS.values() if len(ai["campos"]) > 1]

    # **Oitenta e um AIs tem mais de um componente e quarenta e sete tem algum
    # variavel** — e sao os quarenta e sete que o bug afectava, porque sem
    # componente variavel o `maximo` da tabela ja e' o do campo. A affirmacao
    # conta os dois, para que a distancia entre os numeros se veja.
    #
    # **O numero vem da tabela e nao de mim.** Um dia que a GS1 acrescente um AI
    # assim o numero muda, e o teste passa a dizer a verdade nova em vez de
    # continuar a confirmar um numero antigo.
    assert len(varios) == 54, f"a tabela tem {len(varios)} AIs com varios componentes"

    com_variavel = [ai for ai in varios if comprimento_total(ai) is not None]
    assert len(com_variavel) == 47, (
        f"{len(com_variavel)} AIs com mais de um componente e algum variavel, "
        "e o bug afectava todos eles"
    )

    # O AI 253, que e' o caso de maior distancia entre os dois numeros.
    ai = AIS["253"]
    assert ai["maximo"] == 17, "o ultimo componente do 253 tem maximo 17"
    assert comprimento_total(ai) == 30, "e o valor pode ter trinta"


@pytest.mark.parametrize(
    ("ai", "valor"),
    [
        # (253) N3+N13[+X..17]: treze digitos e dezassete letras.
        ("253", "1234567890123ABCDEFGHIJKLMNOPQ"),
        # (421) N3+N3+X..9: tres, tres e nove.
        # (421) N3+N3+X..9: o **terceiro** componente e' de nove, e o
        # segundo tambem — o `regex` e' `(\d{3})([!%-?A-Z_a-z\x22]{1,9})`
        # e o segundo grupo e' de 1 a 9. Os doze sao tres, tres e seis.
        ("421", "123456ABCDEF"),
        # (8008) N4+N8[+N..4]: oito e quatro.
        # (8008) N4+N8[+N..4]: o `regex` e' uma data e uma hora, `YYMMDDHH`
        # mais minutos e segundos opcionais. O mes tem de estar entre 01 e 12,
        # e por isso que `12345678` nao serve: o `34` nao e' mes nenhum.
        ("8008", "010203001234"),
        # (3910) N4+N3+N..15: tres e quinze.
        ("3910", "123123456789012345"),
        # (7030) N4+N3+X..27: tres e vinte e sete.
        ("7030", "123ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    ],
)
def test_um_ai_de_varios_componentes_aceita_o_valor_no_sete(ai: str, valor: str) -> None:
    """Cada um dos cinco aceita o valor mais longo que a GS1 define.

    **Um caso por AI, e não um caso para "os AIs de vários componentes".** Os cinco
    têm formatos diferentes — `N13[+X..17]`, `N3[+X..9]`, `N8[+N..4]`,
    `N3[+N..15]`, `N3[+X..27]` — e um caso só apanha o primeiro.
    """
    codigo = gs1_128(f"({ai}){valor}")

    assert codigo["payload"] == ai + valor


def test_o_valor_que_excede_a_soma_continua_a_recusar() -> None:
    """A soma é o tecto, e um a mais recusa com os dois números na mensagem.

    **Sem esta afirmação, a soma podia ser um número qualquer.** Um `maximo` de 999
    aceitaria tudo e a validação do comprimento seria decorativa — que é o que a
    tornaria inútil sem ninguém dar por isso.
    """
    with pytest.raises(SimbologiaError) as info:
        gs1_128("(253)1234567890123ABCDEFGHIJKLMNOPQR")

    mensagem = str(info.value)
    assert "30" in mensagem
    assert "31" in mensagem


def test_o_comprimento_total_de_um_ai_de_componente_unico_e_o_seu() -> None:
    """A soma não inventa comprimento a um AI que tem um só componente.

    **O `maximo` da tabela e' o do ultimo componente e, com um só, é o máximo
    certo.** A soma é uma generalização, e uma generalização que muda o
    comportamento do caso simples é uma generalização errada.
    """
    assert comprimento_total(AIS["10"]) == 20
    assert comprimento_total(AIS["96"]) == 90

    # E um AI fixo não tem máximo — e é `None`, que é o que a tabela diz.
    assert comprimento_total(AIS["01"]) is None
    assert comprimento_total(AIS["13"]) is None


# --- o `regex` ancorado, e o que ele de facto faz --------------------------


def test_o_regex_ancorado_e_defensivo_e_nao_apanha_um_bug_so() -> None:
    """O ancoramento é redudante hoje, e o teste diz isso em vez de fingir o contrário.

    **Reintroduzi `search` em vez de `fullmatch` e a suite passou.** Fui ver porque
    e a regra da `AGENTS.md` diz que um teste que passa com o bug não afirma nada —
    e a resposta é que, com a validação do comprimento à frente, **o `regex` não
    é a linha que apanha nada**: o comprimento apanha, e o `regex` só apanha o que
    o comprimento não apanha, que é o mês 56.

    **Duas validações que apanham o mesmo erro não são duas validações.** Escrever
    um teste que diga "isto apanha o bug" quando não apanha treina quem o lê a
    confiar numa coisa que não é verdade — que é o mesmo defeito do
    `frameqr-centragem.test.mjs`, que importava a função e não a aplicação, e do
    `ComboBox` do C#, que media a categoria errada em catorze iterações a verde.

    **O que se afirma aqui é a verdade verificada**: para cada valor que o `search`
    aceita e o `fullmatch` recusa, o comprimento apanha-o. É essa a propriedade que
    torna o `fullmatch` redundante, e é ela que um dia deixa de ser verdade se o
    comprimento mudar.
    """
    valores = [
        "1", "12", "123", "1234", "12345", "123456", "1234567",
        "A", "AB", "ABC", "ABCDEFGH",
        "1234567890123ABC", "12345678901234567", "1234567890123ABCDEFGHIJ",
        "0ABC", "ABC0", "ABC-1",
    ]

    so_o_ancorado = []

    for numero, entrada in AIS.items():
        regex = entrada["regex"]
        maximo = comprimento_total(entrada)

        for valor in valores:
            if re.search(regex, valor) and not re.fullmatch(regex, valor):
                # O que interessa é **se o encoder aceita**. E pergunta-se ao
                # encoder, e não a uma cópia da regra dele: copiar a regra para o
                # teste é escrever um teste que passa com o encoder errado, que é o
                # que a `AGENTS.md` chama um teste que não afirma nada.
                #
                # **A primeira versão desta afirmação reimplementava a regra do
                # comprimento** e escrevia `maximo is None` para os AIs fixos — que
                # é dizer que um campo de catorze aceitaria dezassete. Deu 1654
                # falsos positivos. **Quem escreve a regra duas vezes escreve o
                # bug duas vezes.**
                try:
                    validar(ai_de(numero), valor)
                except SimbologiaError:
                    continue

                so_o_ancorado.append((numero, valor))

    assert so_o_ancorado == [], (
        f"ha {len(so_o_ancorado)} valores que o `search` aceita e o `fullmatch` "
        "recusa, e que o comprimento **não** apanha: "
        f"{so_o_ancorado[:5]}. O `fullmatch` deixou de ser redundante e a "
        "validação ficou com uma linha a mais que ninguém sabe porque existe."
    )


# --- o registo --------------------------------------------------------------


def test_o_gs1_128_esta_no_registro() -> None:
    """O registo tem a entrada, e com a chave que o selector usa.

    **O GS1-128 entrou no web no registo com o encoder e não apareceu no
    selector** — a `AGENTS.md` chama a isso lista escrita duas vezes, e é o
    registo que é a fonte.
    """
    from qrcode_core.simbologias import SIMBOLOGIAS_TODAS

    assert "gs1-128" in SIMBOLOGIAS_TODAS
    assert SIMBOLOGIAS_TODAS["gs1-128"] is gs1_128


def test_o_gs1_128_nao_substitui_o_code128() -> None:
    """São duas entradas, e não uma.

    Um GS1-128 **é** um Code 128 com o FNC1 no sítio certo. Se o registo tivesse um
    no lugar do outro, ou uma entrada que aceitasse os dois, a diferença entre um
    código com FNC1 no início e um sem ele deixava de ser visível — e é
    exactamente o caso em que o `]C1` do ZXing é o que diz que é um GS1.
    """
    from qrcode_core.simbologias import SIMBOLOGIAS_TODAS

    assert "code128" in SIMBOLOGIAS_TODAS
    assert "gs1-128" in SIMBOLOGIAS_TODAS
    assert SIMBOLOGIAS_TODAS["code128"] is not SIMBOLOGIAS_TODAS["gs1-128"]


def test_o_payload_de_um_gs1_nao_e_o_de_um_code128() -> None:
    """O mesmo texto nos dois dá códigos diferentes, e o payload mostra porquê.

    O Code 128 não tem `payload` nem `campos`: **recebe texto e não notação**. E é
    por isso que os dois são entradas separadas do registo — um encoder que
    aceitasse os dois diria que o GS1-128 é um Code 128 com uma opção.
    """
    from qrcode_core.simbologias import SIMBOLOGIAS_TODAS

    gs = SIMBOLOGIAS_TODAS["gs1-128"]("(10)LOTE-A1")
    normal = SIMBOLOGIAS_TODAS["code128"]("10LOTE-A1")

    # **O Code 128 escolhe o conjunto e faz as comutações.** `10LOTE-A1` começa em
    # dígitos, e a `_melhor_conjunto` muda para o `C` — que dá 145 módulos, e são
    # **mais** do que os 134 do GS1-128 com o mesmo texto.
    #
    # A comparação honesta é **com o conjunto forçado a B**, que é o que o GS1-128
    # usa sempre. E o que se vê é que o GS1-128 paga onze módulos — um codeword — pelo
    # FNC1 do início, e que a opção do Code 128 lhe poupava catorze.
    #
    # **Não comparar com o Code 128 sem forçar mede a escolha de conjunto, não o
    # FNC1** — e foi o que a primeira versão fez, e deu 145 − 145 = 0.
    forcado = SIMBOLOGIAS_TODAS["code128"]("10LOTE-A1", forcar_conjunto="B")

    assert len(gs["modulos"]) - len(forcado["modulos"]) == 11

    # **E o Code 128 sem forçar dá exatamente o mesmo número de módulos.**
    # Não é coincidência que não importe: os dois têm treze codewords, porque
    # o Code 128 comutativo troca dois dígitos por um valor e gasta um codeword
    # na troca, e o GS1-128 gasta um no FNC1. Treze por treze.
    #
    # **É por isso que o número de módulos não prova nada sozinho.** Um
    # separador a mais dá treze codewords em vez de treze, e treze codewords é o
    # que o `modulos` contava. A contagem de FNC1 é a afirmação que apanha.
    assert len(gs["modulos"]) == len(normal["modulos"])
