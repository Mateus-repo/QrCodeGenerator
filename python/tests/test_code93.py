"""
Os testes do Code 93.

    cd python && python -m pytest tests/test_code93.py -q

## Os tres niveis, e porque este ficheiro so cobre um

| | onde | o que apanha |
|---|---|---|
| **zero** | este ficheiro | uma tabela transcrita, um checksum com o peso errado |
| **paridade** | `web/tests/paridade-code93.py` | Python e web a dizerem coisas diferentes |
| **dois** | `web/tests/descodificar-code93-python.py` | o ZXing a ler o codigo |

**Este ficheiro e' o mais barato e o que mais apanha.** Uma tabela de codigos de
barras errada **nao da erro nenhum** — o codigo desenha-se com o aspecto certo e
o leitor devolve outra coisa, ou nada. Nao ha teste estrutural que apanhe uma
tabela transcrita de memoria, e e' por isso que a tabela e' gerada.

**O que este ficheiro apanha, e que ja aconteceu:** o peso do checksum a
reiniciar no sitio errado, os digitos calculados sobre o texto errado, e o
asterisco que ficava so nas guardas e nao no codigo. Nenhum dos tres dava erro —
davam um codigo com o aspecto certo que nao e' lido.

## A nao ser

**Nao verifica que o ZXing le.** Um `modulos` com o comprimento certo e a
geometria errada passa em todos os testes deste ficheiro, e nao le. Da' o nivel
dois, que e' o unico que o `AGENTS.md` aceita como prova.
"""

from __future__ import annotations

import pytest

from qrcode_core.simbologias.code93 import (
    _checksum,
    _codificar_estendido,
    _modulos_do,
    code93,
)
from qrcode_core.simbologias.tabelas_code93 import (
    ALFABETO,
    ASTERISCO,
    CONTROLES,
    INDICE,
    MODULO_CHECKSUM,
    PADROES,
)

# Os valores que o ZXing leu do encoder do web. Sao a referencia: nao sao o que
# este codigo produz, sao o que um leitor independente leu.
#
# **Vem do `paridade-code93.py`, nao de um calculo feito aqui** — o mesmo ficheiro
# que compara os dois encoders. Um valor esperado escrito a mao no teste e' uma
# segunda implementacao disfarcada de teste.
LIDOS_PELO_ZXING = {
    # **Os valores sao os que um leitor independente leu**, e nao o que este
    # codigo produz. Vem do `paridade-code93.py`, nao de um calculo feito
    # aqui: um valor esperado escrito a mao e' uma segunda implementacao
    # disfarcada de teste.
    #
    # **Os casos com caracteres de controlo nao estao aqui, e a razao e'
    # pratica**: as entradas deles sao o proprio caracter de controlo, e um
    # `chr(0)` num ficheiro Python e' um byte nulo que o `compile` recusa —
    # e um `chr(13)` parte a linha do ficheiro em duas. Eles estao
    # verificados pelo `descodificar-code93-python.py`, que os manda ao ZXing
    # e ve o que volta.
    "ABC-1234": ("ABC-12346b", 109),
    "teste-93": ("dTdEdSdTdE-93$0", 154),
    "Teste93Minusculas": ("TdEdSdTdE93MdIdNdUdSdCdUdLdAdS3B", 307),
    "ABC $/%+-.": ("ABC $/%+-.W+", 127),
    "A": ("AAU", 46),
    "MAST-2024-0001-LOTE-A": ("MAST-2024-0001-LOTE-ATE", 226),
    "999999999999999999999999999999": ("999999999999999999999999999999ZX", 307),
    "MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20": (
        "MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20-U",
        505,
    ),
    "AB": ("AbTB6C", 73),
}


# --- nivel zero: a tabela ------------------------------------------------


def test_a_tabela_tem_48_valores():
    """**A contagem primeiro, e nao o conteudo.**

    Uma extracao truncada dava 43 valores plausiveis e todos os digitos de
    controlo a sair do sitio, sem erro em lado nenhum. E' a razao de o gerador
    falhar em vez de devolver.
    """
    assert len(PADROES) == 48
    assert len(ALFABETO) == 48
    assert len(INDICE) == 48


def test_todos_os_padroes_comecam_em_barra():
    """
    **O invariante de que o leitor depende.**

    O ZXing ancora cada caracter na primeira barra, e um padrao que comece em
    espaco desenha-se bem e **nao e' lido por nada**. Foi o que aconteceu a
    primeira versao do encoder do web, e a razao de o gerador verificar os 48
    valores antes de os escrever.
    """
    for i, padrao in enumerate(PADROES):
        assert padrao & 0x100, f"{ALFABETO[i]!r} (0x{padrao:03X}) comeca em espaco"


def test_todos_os_padroes_tem_nove_bits():
    """Nove bits, nem mais nem menos. **Um padrao de dez da' modulos a mais** e o
    comprimento fica errado, que e' o mesmo sintoma de uma guarda em falta."""
    for i, padrao in enumerate(PADROES):
        assert 0 <= padrao <= 0x1FF, f"{ALFABETO[i]!r} tem mais de nove bits"


def test_o_asterisco_esta_no_indice_47():
    """
    **Nao se descobre pela contagem, e a consequencia e' silenciosa.**

    O start e o stop saem outro qualquer, e o leitor recusa por checksum sem
    dizer qual dos dois digitos.
    """
    assert ASTERISCO == 47
    assert ALFABETO[ASTERISCO] == "*"
    assert INDICE["*"] == 47


def test_o_modulo_do_checksum_e_47_e_nao_43():
    """
    **47 e nao 43**, porque contam o asterisco e os quatro de controle.

    E a razao de os dois parecerem tao diferentes a quem os compara: o Code 39
    tem 43 e nao conta o asterisco.
    """
    assert MODULO_CHECKSUM == 47
    assert MODULO_CHECKSUM == len(PADROES) - 1


def test_as_unicas_minusculas_da_tabela_sao_as_de_escape():
    """
    **A tabela tem quatro minusculas, e sao as letras de escape.**

    Dizer que a tabela "nao tem minusculas" e' verdade no sentido que importa —
    nenhuma minuscula e' um valor de dados — e falso se lido a letra. Os
    valores de dados sao 43: os dez digitos, as vinte e seis maiusculas e os
    sete simbolos `-`, `.`, espaco, `$`, `/`, `+` e `%`.

    **E as quatro letras de escape nunca podem aparecer a soltas nos dados.**
    O `decodeExtended` do ZXing comeca com `if (c >= 'a' && c <= 'd')` e nao
    olha para o indice: um `c` solto faz o leitor tentar ler o par seguinte e,
    se nao for uma letra valida, levanta `FormatException` e nao devolve nada.
    """
    minusculas = [c for c in ALFABETO if c.islower()]

    assert minusculas == ["a", "b", "c", "d"]
    assert minusculas == sorted(minusculas), "estao por ordem"

    # **Os 43 valores nao tem nenhuma minuscula.**
    valores = ALFABETO[: ASTERISCO - 4]
    assert len(valores) == 43
    assert not any(c.islower() for c in valores)

    # **E o `d` de `dTdE` e' sempre par, nunca solto.**
    assert CONTROLES[ord("a")][0] == "d"
    assert len(CONTROLES[ord("a")]) == 2

#: **A regra do ZXing, escrita aqui para o teste poder confirmar a tabela.**
#:
#: E' o `decodeExtended` do `Code93Reader.java` ao contrario: cada letra de
#: escape com a regra que a ela cede. **Vem da fonte e nao de memoria**, e e' a
#: unica copia deste ficheiro — a tabela gerada e' que se compara com ela.
#:
#: **E' o que torna o teste util.** Um `assert CONTROLES[27] == "bA"` escrito a
#: mao so prova que o ficheiro nao mudou. Isto prova que **o par que a tabela
#: da devolve o caracter certo pela regra que o ZXing aplica** — que e' o que
#: apanha um par trocado, e foi exactamente o que estava trocado em vinte e
#: quatro dos trinta e dois caracteres de controlo.
DECODIFICAR = {
    "d": lambda n: n + 32 if ord("A") <= n <= ord("Z") else None,
    "a": lambda n: n - 64 if ord("A") <= n <= ord("Z") else None,
    "b": lambda n: _decodificar_b(n),
    "c": lambda n: n - 32 if ord("A") <= n <= ord("O") else 58 if n == ord("Z") else None,
}

def _decodificar_b(letra: int) -> int | None:
    """A sexta transformacao do `b` do ZXing."""
    if ord("A") <= letra <= ord("E"):
        return letra - 38
    if ord("F") <= letra <= ord("J"):
        return letra - 11
    if ord("K") <= letra <= ord("O"):
        return letra + 16
    if ord("P") <= letra <= ord("T"):
        return letra + 43
    if letra == ord("U"):
        return 0
    if letra == ord("V"):
        return 64
    if letra == ord("W"):
        return 96
    if ord("X") <= letra <= ord("Z"):
        return 127
    return None


def test_todos_os_128_caracteres_tem_entrada():
    """**A tabela cobre os 128 caracteres ASCII, todos.** Um furo seria um
    caracter que o encoder recusa sem dizer porque, e o `ord` de um caractere
    acima de 127 seria um `IndexError` dentro do encoder."""
    assert len(CONTROLES) == 128


def test_cada_par_volta_ao_caracter_de_origem():
    """
    **A tabela contra a regra do ZXing, entrada a entrada.**

    E' o teste que teria apanhado os vinte e quatro caracteres de controlo
    errados: um par trocado devolve um caracter diferente pela regra, e aqui
    isso da' `None` ou um numero que nao e' o codigo de origem.

    **Os 37 que estao no alfabeto devolvem-se a si proprios**, e por isso que
    este teste os cobre tambem — sao a unica parte da tabela que nao e' um par.
    """
    for codigo in range(128):
        entrada = CONTROLES[codigo]

        if len(entrada) == 1:
            # **Esta no alfabeto e devolve-se a si mesmo.** O `decodeExtended` so
            # desfaz o par quando a letra de escape aparece, e um caractere do
            # alfabeto nunca e' uma das quatro.
            assert ord(entrada) == codigo, (
                f"o codigo {codigo} (0x{codigo:02X}) devolve "
                f"{entrada!r} em vez de se devolver a si mesmo"
            )
            continue

        assert len(entrada) == 2, (
            f"o codigo {codigo} (0x{codigo:02X}) tem a entrada {entrada!r}, que "
            f"nao e' nem um caracter nem um par"
        )

        regra = DECODIFICAR.get(entrada[0])
        assert regra is not None, (
            f"o codigo {codigo} (0x{codigo:02X}) comeca por {entrada[0]!r}, que "
            f"nao e' uma das quatro letras de escape"
        )

        devolvido = regra(ord(entrada[1]))
        assert devolvido == codigo, (
            f"o par {entrada!r} do codigo {codigo} (0x{codigo:02X}) devolve "
            f"{devolvido} pela regra do ZXing, e nao {codigo}"
        )


def test_as_minusculas_vao_como_par_de_escape():
    """
    A minuscula vira ``d`` mais a maiuscula.

    **Sem este passo `teste-93` falha logo no ``t``** com "o caractere nao tem
    padrao" — que foi o que a primeira versao do web fazia.
    """
    assert _codificar_estendido("aZ") == ["d", "A", "Z"]
    assert "".join(_codificar_estendido("teste-93")) == "dTdEdSdTdE-93"


def test_os_caracteres_de_iguais_passam_iguais():
    """Maiusculas, digitos e o espaco sao directeitos — nao ha par."""
    assert _codificar_estendido("AZ09 ") == list("AZ09 ")


@pytest.mark.parametrize(
    "codigo, esperado",
    [
        # **O CR e' `aM` e nao o algarismo `0`.** Era `0` na escada do web, e o
        # ZXing devolvia um `0` onde estava supposed estar um CR — uma etiqueta
        # com um zero a mais, lida por um leitor e nao por outro.
        (0x00, "bU"),
        (0x0D, "aM"),
        (0x1B, "bA"),
        # Os que a escada trocava por `bC`, `bD` e `bE` — que o ZXing le como
        # 29, 30 e 31.
        (0x06, "aF"),
        (0x07, "aG"),
        (0x08, "aH"),
        # O tab, que a escada mandava para `bW` — que o ZXing le como 96.
        (0x09, "aI"),
        (0x7F, "bT"),
    ],
)
def test_os_pares_que_a_escada_antiga_errava(codigo, esperado):
    """
    **Os casos onde a escada estava errada, afirmados um a um.**

    Ficam aqui em vez de na lista completa de 128 porque sao os que **ja
    falharam uma vez**. Um parametrize com 32 valores diz que a tabela esta
    certa; estes oito dizem *como* ela ja esteve errada, e por isso nao se
    volta a escrever de memoria.
    """
    assert CONTROLES[codigo] == esperado


def test_o_carriage_return_nao_e_o_algarismo_zero():
    """
    **Um `chr(13)` literal num ficheiro conta como uma entrada e estraga a
    contagem** — e era por isso que a escada antiga escrevia `'0'`, com um
    comentario a justificar que o CR "e' o valor zero da tabela". **Nao e'**:
    o valor zero da tabela e' o algarismo `0`, que e' um codigo diferente, e o
    CR e' o codigo 13.
    """
    assert CONTROLES[0x0D] == "aM"
    assert CONTROLES[0x0D] != "0"


def test_todos_os_32_de_controle_sao_um_par():
    """
    **Os 32 de controlo sao sempre dois caracteres.**

    Um par de uma letra desvia a leitura de tudo a seguir, e o sintoma e' um
    codigo desenhado certo e lido a partir do sitio errado.
    """
    for codigo in range(0x20):
        assert len(CONTROLES[codigo]) == 2, f"o controlo {codigo} nao e' um par"


# --- o checksum ----------------------------------------------------------


def test_o_peso_reinicia_quando_passa_o_maximo():
    """
    **Ao passar do indice vinte, o peso volta a um — e nao a vinte e um.**

    E' a diferença entre o codigo certo e o que cresce sem parar. O sintoma do
    errado e' o mais enganador de todos os codigos de barras: o codigo
    desenha-se bem, o primeiro digito bate certo e o segundo nao, e o leitor
    recusa por checksum **sem dizer qual dos dois**.

    **O texto tem de tornar a diferença visivel, e isso mede-se antes de
    afirmar.** Um texto em que o indice nunca passa de vinte nao distingue as
    duas formulas — o `i % 20` e um contador que reinicia sao a mesma coisa ate
    la. Por isso o texto abaixo tem vinte e cinco caracteres, e o teste
    confirma que a soma com pesos que nao reiniciam da um numero diferente.
    """
    # **O `0` esta no indice 0 da tabela, e por isso contribute zero.** E' o que
    # fazia o texto anterior nao separar as duas formulas: o unico caracter com
    # indice diferente de zero estava na posicao zero, que pesa um em ambas.
    #
    # **As cinco letras vao no inicio da cadeia** porque e' o inicio que recebe
    # os pesos altos: o `checksum` le de tras para a frente, e com vinte e cinco
    # caracteres o primeiro e' o de peso 21 (ou 1, se reiniciar).
    texto = ["A", "B", "C", "D", "E"] + ["0"] * 20
    assert len(texto) == 25

    # **O peso correcto: 1, 2, ... 20, 1, 2, ...** e o indice vinte e um pesa 1.
    pesos = [1 + (i % 20) for i in range(len(texto))]
    assert pesos[20] == 1, "o peso no indice vinte tem de voltar a um"

    com_reinicio = sum(peso * INDICE[c] for peso, c in zip(pesos, reversed(texto)))
    assert _checksum(texto, 20) == com_reinicio % MODULO_CHECKSUM

    # **O peso que nao reinicia: 1, 2, ... 25.** E' o que se faz somando com o
    # indice cru, e o que produz o digito errado.
    sem_reinicio = sum(
        (i + 1) * INDICE[c] for i, c in enumerate(reversed(texto))
    )

    assert sem_reinicio % MODULO_CHECKSUM != com_reinicio % MODULO_CHECKSUM, (
        "o texto de teste nao separa as duas formulas — escolher outro"
    )

def test_o_checksum_calcula_de_tras_para_a_frente():
    """**De tras para a frente, com o peso a subir.** Ao contrario de uma soma de
    esquerda para a direita, que daria um digito diferente."""
    texto = ["A", "B", "C"]
    para_a_frente = (INDICE["A"] * 1 + INDICE["B"] * 2 + INDICE["C"] * 3)
    para_a_tras = (INDICE["C"] * 1 + INDICE["B"] * 2 + INDICE["A"] * 3)

    assert _checksum(texto, 20) == para_a_tras % MODULO_CHECKSUM
    assert para_a_frente % MODULO_CHECKSUM != para_a_tras % MODULO_CHECKSUM


# --- a codificacao completa ----------------------------------------------


@pytest.mark.parametrize(
    "valor, legenda, modulos",
    # **O `*dados` descompacta o par** que o `items()` devolve. Sem ele o
    # `parametrize` recebe tuplas de dois e os tres nomes do cabeçalho nao
    # batem — e o erro aparece na colecção, com um rasto de `importlib` que nao
    # fala do ficheiro nem da linha.
    [(valor, *dados) for valor, dados in LIDOS_PELO_ZXING.items()],
)
def test_os_valores_que_o_zxing_leu(valor, legenda, modulos):
    """
    **Os valores sao os que um leitor independente leu**, e nao o que este codigo
    produz.

    Um valor esperado escrito a mao no teste e' uma segunda implementacao
    disfarcada de teste — e a `AGENTS.md` diz que a spec e' o arbrito, nao o que
    qualquer cliente faz.
    """
    codigo = code93(valor)

    assert codigo["legenda"] == legenda
    assert len(codigo["modulos"]) == modulos


def test_o_asterisco_esta_nas_duas_pontas_do_codigo():
    """
    **O asterisco no inicio e no fim, e nao e' opcional.**

    E' o start e o stop do Code 93, e sem eles o leitor nao sabe onde comeca o
    codigo. **A primeira versao emitia os dados e os digitos, e os asteriscos so
    apareciam na lista de guardas** — que e' informacao para o desenho e nao vai
    no codigo. O ZXing le uma fila de modulos, e o asterisco nunca la estava.
    """
    codigo = code93("ABC")

    # **O comprimento em modulos diz quantos caracteres ha**, porque cada um tem
    # sempre nove mais a barra de terminacao.
    n_caracteres = (len(codigo["modulos"]) - 1) // 9
    assert n_caracteres == len("ABC") + 2 + 2, "sao os dados e os dois digitos"

    inicio = codigo["valores"][0]
    fim = codigo["valores"][-1]
    assert inicio == ASTERISCO
    assert fim == ASTERISCO


def test_a_barra_de_terminacao_no_fim():
    """
    **Uma barra preta no fim, depois da barra de fim, e sem ela o codigo nao le.**

    Nao e' um start nem um stop: e' a unica barra solitaria do codigo, e o que da
    ao leitor a certeza de que leu ate ao fim. **A primeira versao nao a tinha, e
    o sintoma foi o pior possivel** — o codigo desenhava-se certo, o comprimento
    era o que o ZXing esperava, e a leitura dava nada sem dizer porque.
    """
    codigo = code93("ABC")

    assert codigo["modulos"][-1] is True
    # E solitaria: o modulo antes dela e' o fim do asterisco, que acaba em barra
    # tambem — mas a de penultimo e' a ultima do asterisco, e o ZXing conta a
    # barra solitaria a parte. O que se afirma aqui e' o comprimento.
    assert len(codigo["modulos"]) % 9 == 1


def test_o_texto_entra_estendido_no_legenda():
    """
    **A legenda tem os dois digitos, e o `valor` nao.**

    O ZXing devolve o texto sem eles, porque sao de controlo — mas a etiqueta
    impressa tem de os ter, e e' obrigatorio numa etiqueta de automovel. Por isso
    a legenda e' a string com os digitos e nao o que a pessoa escreveu.
    """
    codigo = code93("teste")

    assert codigo["legenda"].startswith("dTdEdS")
    assert codigo["legenda"] != "teste"


def test_os_digitos_calculam_sobre_o_texto_estendido():
    """
    **O checksum e' do que esta no codigo**, e o que esta no codigo e' o texto
    com os escapes.

    Calcular sobre o original daria um digito diferente em qualquer texto com
    minusculas — e o codigo desenhava-se bem, o primeiro digito batia certo e o
    segundo nao, e o leitor recusava por checksum sem dizer qual.

    **A forma estendida nao passa pelo encoder, e e' por isso que a comparacao
    de modulo a modulo e' com `teste-93` e nao com `dTdEdSdTdE-93`.** Metter a
    forma estendida em `code93()` volta a estende-la: o `d` de `dTdE` virava
    `dD`, e o codigo sairia com o dobro de caracteres de escape. **Passar por
    la e' pasan-lo duas vezes.**

    E' por isso que a prova de que o checksum e' sobre o estendido e' a
    paridade com o `paridade-code93.py`, que compara os dois encoders com o
    ZXing a ler os dois.
    """
    com_minusculas = code93("teste-93")

    # **O mesmo texto em minusculas e em maiusculas da digitos diferentes.**
    assert com_minusculas["verificacao"] != code93("TESTE-93")["verificacao"]

    # **E a forma estendida e' mesmo a que vai no codigo.** A legenda e' a
    # estendida mais os dois digitos, e o leitor desfaz os pares.
    assert com_minusculas["legenda"] == "dTdEdSdTdE-93" + "".join(
        com_minusculas["verificacao"]
    )

    # **Cada minuscula da entrada produz um `d` mais a maiuscula, e nada mais.**
    # `teste-93` tem cinco minusculas — t, e, s, t, e — e a forma estendida tem
    # cinco `d`. **Nem mais nem menos**, e este e' o teste que apanha um `d`
    # dobrado ou um `d` em falta.
    estendido = com_minusculas["legenda"][:-2]
    minusculas = [c for c in "teste-93" if c.islower()]
    assert estendido.count("d") == len(minusculas) == 5
    assert len(estendido) == len("teste-93") + len(minusculas)

def test_as_guardas_sao_o_inicio_e_o_fim():
    """**O asterisco e' o unico ponto de referencia que o leitor tem**, porque o
    Code 93 nao tem barras de guarda como o EAN — e desce mais para se ver a olho."""
    codigo = code93("ABC")

    assert codigo["guardas"][0] == 0
    assert len(codigo["guardas"]) == 2
    assert codigo["guardas"][1] % 9 == 0


# --- a validacao ---------------------------------------------------------


def test_recusa_o_texto_vazio():
    with pytest.raises(ValueError, match="alguma coisa"):
        code93("")


def test_recusa_o_asterisco_nos_dados():
    """
    **Um asterisco nos dados faz o leitor terminar a leitura ali**, e o que vem a
    seguir e' lido como lixo.

    O codigo desenha-se e le-se — a metade, que e' pior do que nao ler nada,
    porque parece que leu.
    """
    with pytest.raises(ValueError, match="asterisco"):
        code93("ABC*123")


def test_recusa_o_que_nao_e_ascii():
    """Com a razao, e nao so o erro. **Para acentos ou alfabetos nao latinos usa
    QR** — e a pessoa precisa de saber qual usar."""
    with pytest.raises(ValueError, match="ASCII"):
        code93("LOTAÇÃO")


def test_aceita_os_43_dados_mais_os_4_de_controle():
    """
    **Os 43 valores da tabela, todos, num codigo so.**

    E' o que prova que a tabela esta completa e que nenhum indice esta
    trocado. Os 43 valores nao precisam de escape — sao os dez digitos, as vinte
    e seis maiusculas e os sete simbolos — e por isso que o codigo tem 47
    caracteres: **43 mais os dois asteriscos mais os dois digitos de controlo.**
    """
    dados = ALFABETO[:43]
    assert len(dados) == 43

    codigo = code93("".join(dados))

    # **47 e nao 49**: os dois asteriscos ja estao dentro dos 47, e os dois
    # digitos tambem. Somar `+ 2` aqui era contar os asteriscos duas vezes.
    assert len(codigo["valores"]) == 47
    assert codigo["valores"][0] == ASTERISCO
    assert codigo["valores"][-1] == ASTERISCO


def test_o_asterisco_so_pode_ser_o_ultimo_indice():
    """**O asterisco e' indice 47 e nao esta no meio da tabela**, e por isso que
    um texto com 47 caracteres da para codificar e um com 48 nao."""
    codigo = code93(ALFABETO[:MODULO_CHECKSUM])
    valores = codigo["valores"]

    assert valores.count(ASTERISCO) == 2, "o do inicio e o do fim"

def test_o_asterisco_so_pode_ser_o_ultimo_indice():
    """**O asterisco e' indice 47 e nao esta no meio da tabela**, e por isso que
    um texto com 47 caracteres da para codificar e um com 48 nao."""
    codigo = code93(ALFABETO[:MODULO_CHECKSUM])
    valores = codigo["valores"]

    assert valores.count(ASTERISCO) == 2, "o do inicio e o do fim"
