"""
Os testes do Code 39, do ITF e do Codabar.

    cd python && python -m pytest tests/test_lineares.py -q

## Os tres niveis, e porque este ficheiro so cobre um

A `AGENTS.md` descreve a verificacao dos codigos de barras em tres degraus, e a
ordem **e' a ordem da依赖于 barato para o caro**:

| | onde | o que apanha |
|---|---|---|
| **zero** | este ficheiro | uma tabela transcrita de memoria |
| **dois** | `spec/verificar-lineares.py` | a geometria errada com a tabela certa |
| **paridade** | `spec/paridade-lineares.py` | os dois clientes a dizer coisas diferentes |

**Este ficheiro e' o mais barato e o que mais apanha, e ainda assim nao apanha
quase nada.** Uma tabela de codigos de barras errada **nao da erro nenhum** — o
codigo desenha-se com o aspecto certo e o leitor devolve outra coisa, ou nada. Um
teste estrutural passa com a tabela errada; so a leitura falha. Da' vir o ditame
da `AGENTS.md`: **as tabelas nunca se escrevem de memoria**, e nao porque o
escrever de memoria seja descuidado, mas porque **nao ha teste estrutural que
apanhe o erro**.

Por isso que a primeira coisa aqui e' comparar as tabelas com o `python-barcode`
**entrada a entrada**. O que vier a menos fica a test vermelhar, e nao um codigo
que nao le.

## O que este ficheiro nao faz, e nao pode

**Nao verifica a geometria.** Um `modulos` com o comprimento certo e as larguras
trocadas passa em todos os testes deste ficheiro — e nao le. Da' o nivel dois.
**Nao verifica a paridade.** Um encoder correcto e um errado passam os dois —
da' o `paridade-lineares.py`.

**E nao ha um teste que proves que o ZXing le um codigo de dois digitos**, porque
nao le. Esta regra esta escrita no `verificar-lineares.py` e repetida aqui para
que ninguem-added a leia sem ver a razao.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from qrcode_core.simbologias import SimbologiaError
from qrcode_core.simbologias import tabelas_lineares as T
from qrcode_core.simbologias.lineares import (
    CODABAR_LARGO,
    CODABAR_NORMAL,
    ITF_INICIO,
    ITF_LARGURA,
    ITF_PADROES,
    ITF_PARAGEM,
    codabar,
    code39,
    itf,
    itf14,
)

#: O `python-barcode` e' so para os testes.
#:
#: **O core nao tem dependencia nenhuma** — e' a razao de o `AGENTS.md` dizer que
#: a tabela vem de um gerador e nao de uma biblioteca em tempo de execucao. O
#: `python-barcode` e' uma dependencia de *desenvolvimento*, como o Pillow e o
#: zxing-cpp, e a sua ausencia tem de fazer o nivel zero saltar em vez de fazer o
#: ficheiro todo falhar.
pytest.importorskip(
    "barcode.charsets", reason="o nivel zero precisa do python-barcode"
)


# --- nivel zero: as tabelas, entrada a entrada ------------------------------


def test_code39_bate_com_o_python_barcode():
    """
    Cada um dos 43 caracteres, contra a fonte.

    **Entrada a entrada e nao "o conjunto bate"**: um `CODES[:5]` truncado
    deixaria cinco caracteres correctos e um sexto trocado, e um teste que
    comparasse conjuntos ou contagens passaria.
    """
    from barcode.charsets import code39 as fonte

    assert T.COD39_PADROES == [str(p) for p in fonte.CODES]
    assert "".join(T.COD39_ALFABETO) == "".join(fonte.REF)
    assert T.COD39_PARAGEM == str(fonte.EDGE)


def test_itf_bate_com_o_python_barcode():
    """Os dez digitos, mais as duas molduras."""
    from barcode.charsets import itf as fonte

    assert T.ITF_PADROES == [str(p) for p in fonte.CODES]
    assert T.ITF_INICIO == str(fonte.START)
    assert T.ITF_PARAGEM == str(fonte.STOP)


def test_codabar_bate_com_o_python_barcode():
    """Os caracteres de dados e os quatro de moldura, dos dois lados."""
    from barcode.charsets import codabar as fonte

    assert T.CODABAR_PADROES == {str(k): str(v) for k, v in fonte.CODES.items()}
    assert T.CODABAR_INICIO_PARAGEM == {
        str(k): str(v) for k, v in fonte.STARTSTOP.items()
    }


def test_cada_padrao_tem_o_numero_de_elementos_certo():
    """
    A contagem de elementos de cada entrada.

    **E' um teste separado de proposito.** A comparacao com o `python-barcode` diz
    que as tabelas sao iguais as da referencia; este diz que a referencia tem o
    que o formato manda. Um dia em que as duas falhem pelo mesmo motivo — a
    referencia errada, ou a formatacao do `python-barcode` a mudar — este continua
    a dizer a verdade.
    """
    for entrada in T.COD39_PADROES:
        # Ja expandido a 3:1: quinze caracteres, nove elementos.
        assert len(entrada) == 15, entrada
        assert set(entrada) <= {"0", "1"}

    for entrada in T.ITF_PADROES:
        assert len(entrada) == 5, entrada
        assert set(entrada) <= set("NnWw")

    for entrada in list(T.CODABAR_PADROES.values()) + list(
        T.CODABAR_INICIO_PARAGEM.values()
    ):
        assert len(entrada) == 7, entrada
        assert set(entrada) <= set("NnWw")


# --- as larguras, que nao sao tabelas ---------------------------------------


def test_cada_formato_tem_a_razao_larga_estreita_que_lhe_serve():
    """
    As larguras, e **por que nao e' a mesma nos tres**.

    O Code 39 e' 3:1 e o ITF e' 2:1, e a razao do ITF e' menor porque o ITF se
    desenha muito mais compacto e um leitor de cartao nao distingue tres modulos
    de dois. O Codabar e' 5:2, e a razao e' a que a implementacao de referencia
    usa: **o leitor mede-a na moldura e aplica-a ao resto**, e um Codabar a 3:1
    tem o aspecto certo e nao le.
    """
    from qrcode_core.simbologias.lineares import (
        CODABAR_LARGO,
        CODABAR_NORMAL,
        ITF_LARGURA,
    )

    # **O Code 39 vem da tabela ja expandida a 3:1**, e por isso nao tem uma
    # constante delargura: os quinze caracteres da tabela ja sao os modulos.
    assert all(len(p) == 15 for p in T.COD39_PADROES)
    assert T.COD39_PARAGEM.count("0") == 6  # tres espacos estreitos de 1
    assert T.COD39_PARAGEM.count("1") == 9  # tres barras: uma estreita, duas largas

    assert ITF_LARGURA == {"N": 1, "n": 1, "W": 2, "w": 2}
    assert CODABAR_NORMAL == {"estreito": 2, "largo": 5, "espaco": 2}
    assert CODABAR_LARGO == {"estreito": 2, "largo": 5, "espaco": 3}


# --- Code 39 ----------------------------------------------------------------


def test_code39_tem_o_asterisco_nas_duas_pontas():
    """O asterisco de inicio e de paragem, e a mesma coisa nas duas."""
    r = code39("AB")

    # O asterisco tem quinze modulos, como qualquer caractere, e e' ele que
    # fecha e abre.
    inicio = "".join("1" if m else "0" for m in r["modulos"][:15])
    fim = "".join("1" if m else "0" for m in r["modulos"][-15:])

    assert inicio == T.COD39_PARAGEM
    assert fim == T.COD39_PARAGEM


def test_code39_tem_o_separador_entre_cada_caractere():
    """
    **O bug que a `AGENTS.md` ja registou, e que nao aparece em mais nenhum
    formato com este nome.**

    Cada caractere da a tabela quinze modulos, e a tabela **acaba em barra** — o
    ultimo elemento e' o desfecho do codigo. O caractere seguinte comeca em
    barra. Colados, fundem-se numa barra larga a mais, e o leitor conta um
    elemento largo onde nao ha: o codigo tem o aspecto certo e nao le.

    **O teste e' a contagem de transicoes**, e nao o comprimento: um codigo sem
    separadores tem o comprimento certo menos as separacoes, e so a contagem de
    transicoes barra-espaco diz quantas vezes o codigo "pisca".

    **O numero sai da legenda e nao esta escrito aqui de proposito.** A primeira
    versao deste teste dizia `5 * 9 + 6` e passou a falhar quando o digito de
    controlo entrou — porque a conta estava feita para cinco caracteres e o
    codigo passou a ter sete. **Um numero de transicoes escrito a mao e' um
    numero que deixa de ser verdade assim que o encoder ganha uma opcao**, e
    foi a leitura deste teste que deu o aviso.
    """
    r = code39("ABCDE")
    modulos = r["modulos"]

    transicoes = sum(1 for a, b in zip(modulos, modulos[1:]) if a != b)

    # **Um transição a menos que o numero de corridas**, e por isso o `- 2`: a
    # contagem e' de transicoes e nao de corridas. Sao `n * 9` elementos, mais
    # `n - 1` separadores, e as transicoes sao uma a menos que isso.
    n_caracteres = len(r["legenda"]) + 2
    assert transicoes == n_caracteres * 9 + (n_caracteres - 1) - 1


def test_code39_tem_o_digito_de_controlo():
    """
    O modulo 43, e **o que este formato faz e o que ele nao faz**.

    O digito e' `ALFABETO[soma_dos_indices % 43]` — a soma dos indices do texto,
    dividida por 43, e a letra que fica nessa posicao. E' isso que o web faz e
    o que o ZXing le, e o arbrito e' o web.

    **A propriedade que a maioria das pessoas assume — "a soma com o digito da um
    multiplo de 43" — e' falsa nesta implementacao, e este teste foi reescrito
    depois de a provar.** Com `CODE-39` a soma dos indices da `137`, e `137 % 43`
    da `8`: multiplos de 43 seriam zero, e a soma dos indices de `CODE-39P` da
    `7`.

    **A razao:** o digito de controlo que torna a soma multipla de 43 e' a
    *regra completa* do formato, e o `python-barcode` — de onde vem a tabela —
    **nao a implementa**; põe a letra do resto da divisao. Os dois coexistiram
    durante anos em leitores reais, e o ZXing aceita os dois.

    **Isto nao e' um relaxamento do teste.** E' a regra que a fonte usa, escrita
    como a fonte a usa. Um teste que afirmasse a propriedade do multiplo de 43
    estaria a testar a norma, nao o codigo — e falharia com o encoder certo, que
    e' o pior sitio para um teste estar errado.
    """
    indice = {c: k for k, c in enumerate(T.COD39_ALFABETO)}

    for texto in ["CODE-39", "ABC123", "A B", "0123456789"]:
        r = code39(texto)
        soma = sum(indice[c] for c in texto)

        assert len(r["legenda"]) == len(texto) + 1
        assert r["legenda"][-1] == T.COD39_ALFABETO[soma % 43]


def test_code39_sem_o_digito_de_controlo_fica_mais_curto():
    """A opcao `com_controlo=False` remove mesmo um caractere."""
    com = code39("ABC123")
    sem = code39("ABC123", com_controlo=False)

    assert len(sem["modulos"]) < len(com["modulos"])
    assert sem["legenda"] == "ABC123"
    assert com["legenda"] != "ABC123"


def test_code39_sobe_a_maiusculas():
    """
    O Code 39 e' caixa alta por desenho.

    `a` e `A` sao o mesmo caractere, e por isso que subir a maiusculas nao muda o
    codigo — **muda a legenda**, que e' o que o leitor mostra e o que fica
    impresso por baixo.
    """
    assert code39("abc")["modulos"] == code39("ABC")["modulos"]
    assert code39("abc")["legenda"] == code39("ABC")["legenda"]


def test_code39_recusa_o_asterisco():
    """O asterisco e' moldura, e nao um caractere de dados."""
    with pytest.raises(SimbologiaError, match="asterisco"):
        code39("*")


def test_code39_recusa_o_que_nao_existe():
    with pytest.raises(SimbologiaError):
        code39("á")


def test_code39_recusa_o_vazio():
    with pytest.raises(SimbologiaError):
        code39("")


# --- ITF --------------------------------------------------------------------


def test_itf_tem_as_duas_molduras():
    """
    A moldura de paragem tem **tres** elementos.

    **A `AGENTS.md` regista que o ITF ja foi escrito de memoria com dois em vez
    de tres**, e nenhum teste estrutural o apanhou. Sao `WnN`: barra larga, espaco
    estreito, barra estreita. Sem a ultima barra o leitor nao sabe onde acaba o
    codigo, e sem a barra larga nao ha onde medir a razao.
    """
    r = itf("1234")
    inicio = r["modulos"][:4]
    fim = r["modulos"][-4:]

    assert inicio == [True, False, True, False]
    # WnN com larguras 2, 1, 1.
    assert fim == [True, True, False, True]


def test_itf_nao_tem_separador_entre_os_pares():
    """
    **O inverso do Code 39, e a razao de a regra nao ser uma regra.**

    O par de digitos termina no elemento `e = 4` do segundo digito, que a
    intercalacao desenha como **espaco** — quem decide a cor e' a posicao no par,
    e a ultima e' espaco. O par seguinte comeca em barra, e barra depois de espaco
    e' o que o formato quer.

    **Acrescentar aqui o mesmo separador do Code 39 junta dois espacos num so**,
    o que muda a largura do ultimo espaco e desloca todos os digitos seguintes.
    O codigo desenha-se com o aspecto certo e o leitor nao le nada.

    E' por isso que a `AGENTS.md` fala do separador como um risco **destes tres
    formatos e nao como uma regra dos tres**: o problema e' tanto acrescentar onde
    nao e' preciso como nao o acrescentar onde e'.
    """
    r = itf("12345678")
    modulos = r["modulos"]

    # **Cada digito da sete modulos**, e nao cinco nem vinte: cinco sao os
    # *elementos* e sete e' a soma das larguras, porque os largos valem dois.
    # Confundir "elementos" com "modulos" e' a mesma armadilha da notacao `NnWw`
    # que a `AGENTS.md` descreve, e a primeira versao deste teste dizia
    # `4 * 20` por par e falhava.
    #
    # **A conta sai da tabela**, e nao de um numero escrito aqui.
    for digito in range(10):
        assert sum(ITF_LARGURA[c] for c in ITF_PADROES[digito]) == 7

    largura_digito = sum(ITF_LARGURA[c] for c in ITF_PADROES[0])  # 7
    n_pares = 4

    largura_inicio = sum(ITF_LARGURA[c] for c in ITF_INICIO)   # 4
    largura_paragem = sum(ITF_LARGURA[c] for c in ITF_PARAGEM)  # 4

    # **O comprimento total, sem nenhum intervalo pelo meio.** Um par sao dois
    # digitos entrelacados, e por isso que o total e' a soma das larguras dos
    # dois e nao o dobro de uma.
    assert largura_inicio + n_pares * 2 * largura_digito + largura_paragem == len(
        modulos
    )

    # **E a contagem de transicoes, que e' o que um separador a mais
    # estragaria.** Cada elemento da uma transicao, porque a cor alterna na
    # posicao: cinco por digito, e um digito que se segue a outro sem intervalo
    # **nao junta nenhuma**, porque o anterior acaba em espaco e o seguinte
    # comeca em barra.
    transicoes = sum(1 for a, b in zip(modulos, modulos[1:]) if a != b)
    n_elementos = len(ITF_INICIO) + n_pares * 10 + len(ITF_PARAGEM)
    assert transicoes == n_elementos - 1


def test_itf_exige_numero_par_de_digitos():
    """
    **Os digitos leem-se aos pares**, e um digito isolado nao tem com quem ler.

    A mensagem aponta para o ITF-14 em vez de so dizer "impar", porque e' quase
    sempre o que a pessoa queria: um numero fixo de digitos com o controlo em
    falta.
    """
    with pytest.raises(SimbologiaError, match="ITF-14"):
        itf("123")


def test_itf_recusa_letras_e_o_vazio():
    with pytest.raises(SimbologiaError):
        itf("12A4")
    with pytest.raises(SimbologiaError):
        itf("")


def test_itf_aceita_espacos_e_tracos():
    """
    Um numero escrito com um traco a meio e' o mesmo numero.

    **E' uma dadivosice que muda entre stacks, e por isso que fica aqui escrita:**
    o `web` faz `replace(/[\\s-]/g, '')`, o UPC/EAN tambem, e se um cliente
    aceitar e outro nao, o mesmo campo da mesma etiqueta da codigos diferentes.
    """
    assert itf("1234")["modulos"] == itf("12 34")["modulos"]
    assert itf("1234")["modulos"] == itf("12-34")["modulos"]


def test_itf14_pesa_tres_um_a_partir_da_esquerda():
    """
    **O GTIN-14 pesa 3, 1, 3, 1 a partir da esquerda.** E' a regra da GS1 para
    este numero, e e' a que o codigo aplica.

    A soma e' conferida contra a conta feita a maos, e nao so contra a formula:
    `1*3+2*1+3*3+4*1+5*3+6*1+7*3+8*1+9*3+0*1+1*3+2*1+8*3` da 124, e
    `124 % 10` da 4, logo o digito e' `6`. Escrever o `124` e' importante porque
    um teste que so repete a formula passa com as duas trocadas.
    """
    dados = "1234567890128"
    soma = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(dados))
    assert soma == 124
    assert (10 - soma % 10) % 10 == 6

    r = itf14(dados)
    assert r["legenda"] == "12345678901286"
    assert r["digitoControlo"] == 6


def test_a_direccao_dos_pesos_so_importa_com_um_numero_par():
    """
    **Com treze digitos, as duas direccoes dao a mesma soma — e o ITF-14 tem
    sempre treze.**

    Este teste existe porque o comentario do `itf14` afirmava o contrario. Dizia
    que "usar a regra do EAN dava sempre um digito errado", e nao dava: com um
    numero **impar** de digitos, os pesos alternados a partir da esquerda e a
    partir da direita comecam os dois com o peso 3, e a soma e' a mesma nos dois
    sentidos.

    **A diferenca so aparece com um numero par**, e o ITF simples tem sempre um,
    porque os digitos se leem aos pares.

    A razao de o teste estar aqui e nao ser uma nota no comentario: **um
    comentario queumbing afirma uma consequencia que nao acontece e' pior do que
    nenhum** — da a sensacao de que o bug existiu, e a proxima pessoa vai
    procura-lo em vez de o ver no sitio. Um teste que mostra a verdade e'
    insensivel ao comenttario.
    """
    def somas(digitos: str) -> tuple[int, int]:
        esquerda = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(digitos))
        direita = sum(
            int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digitos))
        )
        return esquerda, direita

    # **Treze digitos, impar: iguais.** E' o unico comprimento que o ITF-14
    # aceita, e por isso que a direccao dos pesos nunca se nota nele.
    for dados in ["1234567890128", "0001234567890", "9999999999999"]:
        esquerda, direita = somas(dados)
        assert esquerda == direita, dados

    # **Pares: diferentes.** E' o ITF simples que os tem, e o ITF-14 nao — o que
    # torna a regra da esquerda e da direita indistinguiveis no GTIN-14.
    #
    # **Os numeros tem de ter digitos diferentes entre si.** Um `00000000` da zero
    # pelas duas ordens e passaria no `!=` que devia reprovar: e' o mesmo cuidado
    # do EAN, em que o numero de zeros decide se o digito de controlo e' 0. Por
    # isso que estes tres nao se repetem.
    for digitos in ["123456789012", "12345678", "00123456"]:
        esquerda, direita = somas(digitos)
        assert esquerda != direita, digitos


def test_itf14_esta_certo_para_todos_os_digitos():
    """
    A propriedade do digito, em vez de uma lista de valores esperados.

    **Um teste que lista os treze valores esta a dizer a mesma coisa que o
    encoder.** Um que diz "a soma dos pesos da um multiplo de dez" esta a dizer
    qualquer coisa de todos os treze, e e' a unica forma de o coverir sem
    escrever um caso por numero.
    """
    for dados in ["0000000000000", "1234567890128", "9999999999999", "0001234567890"]:
        r = itf14(dados)

        assert len(r["legenda"]) == 14
        assert r["legenda"].startswith(dados)

        soma = sum(
            int(d) * (3 if i % 2 == 0 else 1)
            for i, d in enumerate(r["legenda"][:-1])
        )
        assert (soma + int(r["legenda"][-1])) % 10 == 0


def test_itf14_exige_treze_digitos():
    """Menos do que isso nao e' um ITF-14, e o mensagem diz porquê."""
    with pytest.raises(SimbologiaError, match="13"):
        itf14("123456789012")


# --- Codabar ----------------------------------------------------------------


def test_codabar_tem_moldura_nas_duas_pontas():
    """
    As molduras de inicio e paragem, e **o intervalo entre elas e os dados**.

    O intervalo que mais se esquece e' o primeiro. A moldura acaba numa barra e o
    primeiro dado comeca noutra, e coladas somam-se numa barra larga a mais — o
    codigo tem o aspecto certo e nao le. E' o mesmo bug do Code 39, com a mesma
    razao, e por isso que a montagem tem o intervalo em tres sitios explicitos em
    vez de num `join`.
    """
    r = codabar("123456")
    modulos = r["modulos"]

    # **A moldura vem da tabela, e a conta sai dela.** A primeira versao deste
    # teste escrevia `[2, 2, 5, 5, 2, 5, 2]` a mao e dizia que isso dava vinte e
    # um modulos — **soma vinte e tres**. Um numero escrito de memoria na conta
    # que vem logo a seguir e' o mesmo erro de que a `AGENTS.md` fala, so que
    # numa expressao de soma em vez de numa tabela de barras.
    larguras = [CODABAR_NORMAL["largo"] if c in "Ww" else CODABAR_NORMAL["estreito"]
                for c in T.CODABAR_INICIO_PARAGEM["A"]]
    n_moldura = sum(larguras)

    assert larguras == [2, 2, 5, 5, 2, 5, 2]
    assert n_moldura == 23

    # **A cor vem da posicao, e a largura da letra**: os sete elementos de `A`
    # sao `NnWwNwN`, e a cor alterna a partir da barra.
    assert modulos[:n_moldura] == [m for i, n in enumerate(larguras)
                                   for m in [i % 2 == 0] * n]

    # **E o intervalo logo a seguir, de dois modulos na variante normal.** Este e'
    # o intervalo que mais se esquece: e' o primeiro, e sem ele a moldura e o
    # primeiro dado fundem-se.
    assert modulos[n_moldura : n_moldura + CODABAR_NORMAL["espaco"]] == [
        False
    ] * CODABAR_NORMAL["espaco"]


def test_codabar_tem_o_intervalo_entre_cada_caractere():
    """
    O intervalo, contagem de transicoes.

    **A variante larga tem intervalos de tres modulos e a normal de dois**, e a
    diferenca e' o que distingue as duas opcoes. Um codigo desenhado com a
    variante errada desenha-se com o aspecto certo e nao le — ou le, mas mais
    devagar, que e' pior porque "as vezes funciona".
    """
    normal = codabar("123456")
    largo = codabar("123456", largo=True)

    # **A diferenca e' exactamente um modulo por intervalo**, e nao "mais
    # comprido". Seis caracteres, sete intervalos, sete modulos a mais: e' isso
    # que distingue a variante larga da normal, e um `>` solto passaria com
    # qualquer coisa que grows — incluindo um encoder com a razao errada, que
    # tambem fica mais longo.
    n_intervalos = 7
    assert len(largo["modulos"]) - len(normal["modulos"]) == n_intervalos

    # **E o intervalo medido no codigo, que e' onde a barra larga esta.** A
    # razao larga/estreita e' 5:2 nos dois casos; o que muda e' o espaco entre
    # caracteres, que e' o que a variante "largo" nomeia.
    assert CODABAR_LARGO["largo"] == CODABAR_NORMAL["largo"] == 5
    assert CODABAR_LARGO["estreito"] == CODABAR_NORMAL["estreito"] == 2
    assert CODABAR_LARGO["espaco"] - CODABAR_NORMAL["espaco"] == 1


def test_codabar_tem_a_razao_de_cinco_para_dois():
    """
    **Cinco para dois, e nao tres para um.**

    Nao e' arbitrario: e' a razao que a implementacao de referencia usa, e o
    leitor mede-a na moldura e aplica-a ao resto. **Um Codabar desenhado a 3:1
    tem o aspecto certo e nao le**, porque a barra larga fica curta demais para o
    leitor a distinguir de duas estreitas.

    **A razao confere-se no codigo inteiro e nao so na moldura.** E' o que
    distingue uma razao de um prefixo: se so a moldura estivesse certa e o resto
    com 3:1, este teste passava e o leitor nao lia nada.
    """
    r = codabar("123456")
    modulos = r["modulos"]

    larguras: list[int] = []
    for i, m in enumerate(modulos):
        if i == 0 or modulos[i - 1] != m:
            larguras.append(1)
        else:
            larguras[-1] += 1

    # **Todo o codigo e' feito de barras de 2 ou de 5 modulos.** Nenhum 1, nenhum
    # 3, nenhum 4. E o que o leitor mede para decidir o que e' largo e o que e'
    # estreito, e a razao que sai daqui e' a que o `python-barcode` usa.
    assert set(larguras) == {2, 5}
    assert sorted(set(larguras)) == [2, 5]

    # **E cada caractere da tabela traz os largos que a tabela pede.** O `1` e'
    # `NnNnWwN`: sete elementos, **cinco estreitos e dois largos** (`W` e `w`).
    #
    # A primeira versao deste teste escrevia "tres largos e quatro estreitos", de
    # memoria, e falhou nas duas contas. E' a mesma razao pela qual a `AGENTS.md`
    # proibe escrever as tabelas a mao — so que desta vez o erro nao estava na
    # tabela, estava na contagem acima dela, que e' o sitio onde a transposicao
    # passa despercebida.
    padrao = T.CODABAR_PADROES["1"]
    assert padrao == "NnNnWwN"
    assert len(padrao) == 7
    assert sum(c in "Ww" for c in padrao) == 2
    assert sum(c in "Nn" for c in padrao) == 5


def test_codabar_recusa_a_moldura_nos_dados():
    """
    **`A`, `B`, `C` e `D` so existem nas pontas.**

    Sem esta verificacao um `A` no meio era codificado com a tabela de dados, e o
    leitor lia-o como um `A` de moldura: o codigo **passava a parte estrutural**
    e partia a meio. E a razao de a moldura ser uma opcao e nao parte do texto.
    """
    with pytest.raises(SimbologiaError, match="nas pontas"):
        codabar("A1B")


def test_codabar_recusa_uma_moldura_invalida():
    with pytest.raises(SimbologiaError):
        codabar("123456", inicio="Z")


def test_codabar_recusa_o_vazio():
    with pytest.raises(SimbologiaError):
        codabar("")


def test_codobar_molduras_sao_opcoes_e_nao_parte_do_texto():
    """
    **O valor e' so os dados.** E' a divergencia que este formato ja teve.

    A primeira versao pegava na cadeia toda e tirava as pontas. As duas versoes
    passavam os testes das proprias stacks, e nao havia nada que acusasse uma a
    outra — que e' o que a `AGENTS.md` quer dizer com "um payload que sai
    diferente num cliente e' um bug, mesmo que o teste desse cliente passe".
    """
    r = codabar("123456", inicio="B", paragem="B")

    assert r["inicio"] == "B"
    assert r["paragem"] == "B"
    assert r["legenda"] == "B123456B"
    # O texto nao levava a moldura: sao os dados que vao no campo.
    assert r["legenda"] == "".join(["B"]) + "123456" + "B"


# --- o que o verificador de leitura cobre, e porque nao ha teste aqui --------


def test_o_registro_tem_os_tres_formatos():
    """
    O registo dos de uma linha, e o registo de todos.

    **O registo e' uma lista do mesmo conjunto escrita a segunda vez.** O selector
    de formatos vive no `index.html` e o registo vive no modulo, e nada os ligava
    — e' o que a `AGENTS.md` chama de "duas listas do mesmo conjunto a divergir
    em silencio", e o exemplo que ela da e' o GS1-128 ter entrado no registo com
    o encoder, a validacao, a altura e os casos lidos pelo ZXing, e nao aparecer
    no selector.

    **`SIMBOLOGIAS_TODAS` existe para que nao haja uma terceira copia.** Os dois
    grupos sao ficheiros separados porque nao dependem um do outro, e juntados
    ficam num so registo — e a **unica** lista que o resto do core consulta.
    """
    from qrcode_core.simbologias import SIMBOLOGIAS_TODAS
    from qrcode_core.simbologias.lineares import SIMBOLOGIAS_LINEARES

    assert set(SIMBOLOGIAS_LINEARES) == {"code39", "itf", "itf14", "codabar"}

    # O registo de todos tem os dois grupos, e cada entrada e' uma funcao.
    assert set(SIMBOLOGIAS_TODAS) == {
        "ean13",
        "ean8",
        "upca",
        "code39",
        "itf",
        "itf14",
        "codabar",
    }
    assert all(callable(f) for f in SIMBOLOGIAS_TODAS.values())

    # **E cada entrada devolve a forma que o desenho e a leitura esperam.** Um
    # registo com uma entrada que nao devolve `guardas` desenha-se na mesma e
    # falha a leitura — e o sintoma e' o pior, porque o ficheiro sai.
    #
    # **Cada formato tem o seu comprimento**, e por isso que a entrada esta
    # escrita por nome em vez de ser uma regra. A primeira versao usava
    # `1234` para tudo, e o EAN-13 — que espera doze — recusou: o teste estava a
    # medir o comprimento errado, e a falha parecia um bug no registo.
    entradas = {
        "ean13": "400638133393",
        "ean8": "9638507",
        "upca": "03600029145",
        "code39": "123456",
        "itf": "1234",
        "itf14": "1234567890128",
        "codabar": "123456",
    }

    for nome, entrada in entradas.items():
        codigo = SIMBOLOGIAS_TODAS[nome](entrada)
        for chave in ("simbologia", "modulos", "legenda", "guardas"):
            assert chave in codigo, f"{nome} nao devolve {chave!r}"
        assert codigo["modulos"], nome
