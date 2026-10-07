"""
O Data Matrix (ECC200), em Python.

Este modulo e' a **implementacao de referencia** do Data Matrix no repositorio, e
e' por isso que e' Python e nao qualquer outra coisa: as outras stacks sao portas
desta, e o `web/symbologies/datamatrix.js` diz o que tem de dar certo em todas.

Porque e' quadrado e nao tem padroes de localizacao
---------------------------------------------------

O QR tem tres quadrados nos cantos e o Code 128 tem barras. O Data Matrix nao tem
nenhum dos dois: a orientacao vem de **duas guias em L**, uma **cheia** em baixo
e a esquerda e outra **tracejada** em cima e a direita. E' isso que se ve numa
etiqueta de farmacia ou de aeroespacial.

**A assimetria das duas guias e' o que o leitor usa para se orientar**, e e' por
isso que trocar uma delas de cheia para tracejada - ou o sitio - da um codigo que
se parece com um Data Matrix e nao e' lido por nada. Nenhum teste estrutural o
apanha, porque a estrutura continua valida.

Os cinco modos, e porque so dois entram
----------------------------------------

A ISO/IEC 16022 define cinco modos de codificacao de nivel alto: ASCII, C40, Text,
X12 e EDIFACT. **Este encoder so usa dois**: ASCII e o deslocamento para ASCII
estendido.

Os outros tres sao modos de **compressao**, e nao de correccao: o codigo que sai
sem eles e' perfeitamente valido e le-se em qualquer leitor. A diferenca e' o
tamanho - ``MAST-2024-0001`` sai num simbolo maior do que sairia em C40 - e
isso e' otimizacao, nao conformidade. Um modo de compressao mal implementado
troca bytes por(codewords e o leitor devolve outra coisa, e o sintoma e' um texto
que parece um resumo de papel.

**Nao ha mascaras, nao ha versoes com nomes e nao ha nivel a escolher.** Escolhe-se
o menor simbolo que caiba e a correccao e fixa - o ECC200 e' o unico modo. Isto e'
o oposto do QR em tudo, e e' o que torna este formato o mais simples dos dois
para implementar e um dos mais- dificeis de acertar.

O valor de ``b - 127``, que parece um erro
--------------------------------------------

O byte acima de 127 leva um ``UPPER_SHIFT`` a frente e **o valor menos 127**, e
nao menos 128 como a norma parece dizer. A leitura literal da ISO daria ``b -
128``; a implementacao de referencia do ZXing emite ``b - 128 + 1`` e o leitor
dela faz ``valor + 128 - 1``, que e' o mesmo numero. **Os dois concordam, e o
resultado e' que o valor certo e' ``b - 127``.**

A primeira versao fazia ``b - 128`` "porque e' o que a norma diz", e o ZXing
devolvia cada byte alto **um abaixo** do que tinha sido escrito: um ``ç`` saia
como ``r``, um ``€`` como ``Ñ``. Todos os payloads ASCII e todos os numericos
liam-se bem e so os com acentos e emojis falhavam - que e' a assinatura de um erro
que so aparece no canto, e que nenhuma verificacao estrutural apanha.
"""

from __future__ import annotations

from typing import NamedTuple

from .tabelas_datamatrix import FATORES_EC, SIMBOLOS, ULTIMO

#: O codeword de enchimento.
PAD = 129

#: O deslocamento para ASCII estendido, que vale para o codeword seguinte.
UPPER_SHIFT = 235

#: O FNC1 do Data Matrix, que no GS1 faz as duas coisas: sinaliza e separa.
FNC1 = 232

#: O polinomio irredutivel do corpo finito, e o que o ZXing chama de ``0x12D``.
MODULO = 0x12D

#: A capacidade maxima, em codewords de dados, de qualquer simbolo.
CAPACIDADE_MAXIMA = SIMBOLOS[-1][0]


# --- O corpo finito ---------------------------------------------------------


def _tabelas_gf() -> tuple[list[int], list[int]]:
    """
    As tabelas de logaritmos e anti-logaritmos de ``GF(256)``.

    **Sao calculadas, nao transcritas**, e e' o que torna este modulo diferente de
    um que tenha de levar tabelas: o corpo e' gerado pelo polinomio ``0x12D`` a
    partir do 1, e cada multiplicacao e' uma soma de logaritmos.

    O indice 255 repete o 0 porque ``LOG[a] + LOG[b]`` chega a 508 e a tabela de
    exponenciais e' usada com modulo 255.
    """
    exponenciais = [0] * 512
    logaritmos = [0] * 256

    p = 1
    for i in range(255):
        exponenciais[i] = p
        logaritmos[p] = i
        p <<= 1
        if p & 0x100:
            p ^= MODULO

    for i in range(255, 512):
        exponenciais[i] = exponenciais[i - 255]

    return exponenciais, logaritmos


_EXP, _LOG = _tabelas_gf()


def _multiplicar(a: int, b: int) -> int:
    """Uma multiplicacao em ``GF(256)``, pela soma dos logaritmos."""
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


# --- O tamanho do simbolo --------------------------------------------------


#: Quantas regioes de dados sao, por numero de regioes.
#:
#: **A tabela tem cinco chaves e nao seis**, porque ``1`` e ``2`` dao a mesma
#: resposta, e o ``?? 1`` do JavaScript e' o que traduz isso. Um simbolo de uma
#: regiao e um de duas regioes diferem no tamanho do bloco, nunca na quantidade
#: de regioes lado a lado.
_REGIOES = {1: 1, 2: 1, 4: 2, 16: 4, 36: 6}


def _colunas_de_regiao(n: int) -> int:
    """Quantas regioes de dados ha na horizontal."""
    return _REGIOES.get(n, 1)


def _linhas_de_regiao(n: int) -> int:
    """Quantas regioes de dados ha na vertical."""
    return _REGIOES.get(n, 1)


def simbolo_para(codewords: int) -> tuple[int, ...]:
    """
    O menor simbolo quadrado que leva ``codewords`` de dados.

    A lista esta' por ordem de capacidade, e a primeira que chegue serve. Nao ha
    escolha envolvida: e' o menor que caiba, e o ECC200 e' sempre o mesmo.

    :raises ValueError: se o texto for maior do que o maior simbolo.
    """
    if codewords > CAPACIDADE_MAXIMA:
        raise ValueError(
            f"Data Matrix: o conteudo da {codewords} codewords e o maior simbolo "
            f"leva {CAPACIDADE_MAXIMA}. O limite e' {CAPACIDADE_MAXIMA} codewords de "
            "dados, e com acentos cada caractere pode gastar dois."
        )

    for simbolo in SIMBOLOS:
        if codewords <= simbolo[0]:
            return simbolo

    # **Isto e' inalcancavel** e nao esta' aqui porque: com a guarda de cima o
    # `for` devolve sempre, e um `raise` no fim e' a forma de o compilador nao
    # se queixar do `return` em falta. Apanhar um simbolo vazio aqui diria que a
    # tabela esta' corrompida, que e' o que e' verdade.
    raise ValueError(f"Data Matrix: nenhum simbolo leva {codewords} codewords")


class Geometria(NamedTuple):
    """A geometria de um simbolo, ja com os ``-1`` da tabela resolvidos."""

    dados: int
    correccao: int
    regiao_largura: int
    regiao_altura: int
    regioes: int
    bloco_dados: int
    bloco_erros: int
    colunas: int
    linhas: int
    #: A largura e a altura da regiao de dados, sem as guias. **E' o que o
    #: `colocar()` recebe**, e nao as do simbolo: colocar um codeword numa guia
    #: sobrescreve a orientacao que o leitor usa para se orientar.
    dados_colunas: int
    dados_linhas: int


def geometria(simbolo: tuple[int, ...]) -> "Geometria":
    """
    A geometria de um simbolo a partir da sua linha da tabela.

    **A largura e a altura do simbolo e' a regiao de dados mais as duas guias**,
    e as guias sao uma por regiao em cada direccao. E por isso que a conta e'
    ``regioes * largura + regioes * 2`` e nao ``+ 2``: um simbolo de 144x144 tem
    seis regioes de cada lado, e nao uma.
    """
    dados, correccao, largura, altura, regioes, bloco_dados, bloco_erros = simbolo

    colunas_regiao = _colunas_de_regiao(regioes)
    linhas_regiao = _linhas_de_regiao(regioes)
    dados_colunas = colunas_regiao * largura
    dados_linhas = linhas_regiao * altura

    return Geometria(
        dados=dados,
        correccao=correccao,
        regiao_largura=largura,
        regiao_altura=altura,
        regioes=regioes,
        # **Os dois ultimos valem `-1` quando o bloco e' o simbolo inteiro**, que
        # e' o caso de quase todos os 24 simbolos.
        bloco_dados=dados if bloco_dados == -1 else bloco_dados,
        bloco_erros=correccao if bloco_erros == -1 else bloco_erros,
        colunas=colunas_regiao * largura + colunas_regiao * 2,
        linhas=linhas_regiao * altura + linhas_regiao * 2,
        dados_colunas=dados_colunas,
        dados_linhas=dados_linhas,
    )


# --- A codificacao de nivel alto -------------------------------------------


def compactar(dados: bytes) -> list[int]:
    """
    O texto em codewords, no modo ASCII.

    Tres regras, e so tres:

    - **Digitos aos pares.** ``2026`` sao dois codewords, e nao quatro. O valor e'
      ``d1 * 10 + d2 + 130``. E' a compressao do ECC200 de que o Data Matrix tira
      o nome: um numero de serie longo entra em metade do espaco.
    - **ASCII 0 a 127** entra com o valor mais um. O ``+1`` e' para reservar o 0,
      que e' o valor de um codeword que nao existe.
    - **Tudo o resto** (128 a 255) leva um ``UPPER_SHIFT`` a frente e o valor
      menos 127. O deslocamento vale para um codeword so, e por isso um acento
      custa dois.

    Nao ha aqui nenhum valor aleatorizado, e e' de proposito: a aleatorizacao existe
    para que um 254 ou um 255 nao parecam um unlatch, e este encoder nunca os
    emite; e o enchimento, esse sim, e' aleatorizado - ver :func:`encher`.
    """
    codewords: list[int] = []
    i = 0

    while i < len(dados):
        b = dados[i]

        if 0x30 <= b <= 0x39 and i + 1 < len(dados):
            seguinte = dados[i + 1]
            if 0x30 <= seguinte <= 0x39:
                codewords.append((b - 0x30) * 10 + (seguinte - 0x30) + 130)
                i += 2
                continue

        if b < 128:
            codewords.append(b + 1)
        else:
            # **O `b - 127` e' o que a nota do modulo explica.** A norma parece
            # dizer `b - 128`, e a implementacao de referencia do ZXing emite
            # `b - 128 + 1` porque o leitor dela faz `valor + 128 - 1`.
            codewords.append(UPPER_SHIFT)
            codewords.append(b - 127)

        i += 1

    return codewords


def aleatorizar253(posicao: int) -> int:
    """
    O estado 253 de aleatorizacao, para o enchimento.

    O enchimento e' o mesmo problema do PDF417 com outro nome: uma fileira de 129
    seguida de mais 129 e' um padrao que o leitor pode confundir com o fim dos
    dados. Em vez disso, o primeiro e' 129 a serio e os seguintes sao valores
    calculados, que e' o que a ISO manda.

    E a formula nao e' arbitraria: 149 e' primo, e e' o que faz com que os valores
    saiem espalhados pelos 254 possiveis em vez de se agruparem.
    """
    pseudo = ((149 * posicao) % 253) + 1
    temp = PAD + pseudo
    return temp if temp <= 254 else temp - 254


def encher(codewords: list[int], capacidade: int) -> list[int]:
    """Completa com 129 e depois com valores aleatorizados, ate a capacidade."""
    cheios = list(codewords)

    if len(cheios) < capacidade:
        cheios.append(PAD)

    while len(cheios) < capacidade:
        cheios.append(aleatorizar253(len(cheios) + 1))

    return cheios


# --- A correccao de erros ---------------------------------------------------


def correccao_de_bloco(codewords: list[int], quantos: int) -> list[int]:
    """
    O Reed-Solomon de um bloco, com a convencao do ECC200.

    O laco vai de tras para a frente e o resultado sai **invertido**. As duas
    coisas sao da tabela, nao uma escolha: a tabela dos factores poe o ``x^(n-1)``
    no primeiro lugar, e o ``eccReversed`` inverte a lista. Sem o inverter, a
    correccao sai toda ao contrario - e o sintoma e' o pior dos possiveis: a
    primeira linha do simbolo bate certo e nenhuma le.
    """
    coeficientes = FATORES_EC.get(quantos)
    if coeficientes is None:
        raise ValueError(
            f"Data Matrix: nao ha factores para {quantos} codewords de correccao"
        )

    ecc = [0] * quantos

    for c in codewords:
        m = ecc[quantos - 1] ^ c
        for k in range(quantos - 1, 0, -1):
            if m != 0 and coeficientes[k] != 0:
                ecc[k] = ecc[k - 1] ^ _multiplicar(m, coeficientes[k])
            else:
                ecc[k] = ecc[k - 1]
        ecc[0] = _multiplicar(m, coeficientes[0]) if m and coeficientes[0] else 0

    ecc.reverse()
    return ecc


def _eh_ultimo(simbolo: tuple[int, ...]) -> bool:
    return simbolo == SIMBOLOS[-1]


def corrigir(codewords: list[int], simbolo: tuple[int, ...]) -> list[int]:
    """
    A correccao de erros do simbolo todo, com o entrelacamento.

    **O entrelacamento e' o que faz um rasgo vertical ser recuperavel.** Os
    codewords de dados sao espalhados pelos blocos round-robin, de modo que um
    rasgo numa coluna parte o mesmo numero de codewords em cada bloco, e cada
    bloco sabe corrigir os seus. Sem entrelacar, uma linha inteira de dados ia
    para o mesmo bloco e nao havia por onde recuperar.
    """
    g = geometria(simbolo)

    if _eh_ultimo(simbolo):
        blocos = ULTIMO["blocos"]
        erros = ULTIMO["erros"]
        saida = list(codewords) + [0] * (erros * blocos)

        # **O 144x144 e' o unico com blocos de tamanho desigual**, e por isso o
        # comprimento de cada bloco vem dos dados e nao de uma divisao.
        #
        # A conta e' ``cheios`` blocos de 156 e os restantes de 155:
        # 8 x 156 + 2 x 155 = 1558, que e' a capacidade. Com 154 dava 1556, e dois
        # codewords a menos num codigo de 1558 e' o tipo de erro que o leitor
        # acusa como corrupcao e nao como tabela errada.
        #
        # O tamanho de cada bloco **nao e' preciso calcula-lo**: o
        # entrelacamento round-robin da 156 a quem tem indices a partir de 0 e
        # 155 a quem comeca mais tarde, sozinho. O que a tabela regista e' o
        # facto, e e' o teste que confirma que a conta fecha.

        for bloco in range(blocos):
            dados = codewords[bloco::blocos]
            ecc = correccao_de_bloco(dados, erros)
            for p, e in enumerate(range(bloco, erros * blocos, blocos)):
                saida[g.dados + e] = ecc[p]

        return saida

    blocos = g.dados // g.bloco_dados

    if blocos == 1:
        return codewords + correccao_de_bloco(codewords, g.correccao)

    # **A correccao e' reservationada antes de a escrever.** Em JavaScript
    # `saida[i] = x` a um indice do fim estende o array, e por isso o web nunca
    # precisou de reservar nada. **Em Python um `list` nao cresce por atribuicao**
    # e a mesma linha levanta `IndexError` - e a excecao apontava para a
    # correccao, que estava certa, e nao para a atribuicao, que era a coisa nova.
    saida = list(codewords) + [0] * (blocos * g.bloco_erros)

    for bloco in range(blocos):
        dados = codewords[bloco::blocos]
        ecc = correccao_de_bloco(dados, g.bloco_erros)
        for p, e in enumerate(range(bloco, g.bloco_erros * blocos, blocos)):
            saida[g.dados + e] = ecc[p]

    return saida


# --- A colocacao dos modulos ------------------------------------------------


def colocar(codewords: list[int], colunas: int, linhas: int) -> list[int]:
    """
    A colocacao dos codewords na regiao de dados, do Anexo M.1 da ISO/IEC 16022.

    Esta e' a parte do Data Matrix que ninguem acerta de memoria, e nao por ser
    complicada: e' uma **varredura em zigue-zague com quatro cantos especiais**,
    e os cantos disparam em condicoes que dependem do tamanho modulo a modulo
    (``colunas % 4 != 0``, ``colunas % 8 == 4``, ...). Errar numa dessas condicoes
    da um codigo que se desenha perfeitamente e nao le.

    Cada codeword ocupa oito modulos com o formato em ``utah``, que e' a forma de
    "casa" que da nome ao ``codeword``: dois modulos em cima, tres no meio, dois
    em baixo, deslocados um para a esquerda a cada linha.
    """
    # **O `-1` e' "ainda nao preenchido"**, e nao um bit. A distincao e' o que
    # permite ao laco perguntar se pode escrever: um zero e' um modulo branco e
    # ja foi posto, e escrever por cima dele estragaria o codigo anterior.
    modulos = [-1] * (colunas * linhas)

    def fora(col: int, linha: int) -> bool:
        return col < 0 or linha < 0 or col >= colunas or linha >= linhas

    def livre(col: int, linha: int) -> bool:
        return not fora(col, linha) and modulos[linha * colunas + col] < 0

    def por(col: int, linha: int, valor: int) -> None:
        modulos[linha * colunas + col] = valor

    def modulo(linha: int, col: int, pos: int, bit: int) -> None:
        """
        Um modulo de um codeword, com a inversao das coordenadas nas pontas.

        A linha e a coluna saem **as duas** das pontas ao mesmo tempo, e o quanto
        uma se desloca depende do tamanho da **outra**: ``(linhas + 4) % 8`` para
        a coluna, ``(colunas + 4) % 8`` para a linha. Trocar as duas, ou esquecer
        o ``+ 4``, da uma matriz que se desenha com o aspecto certo e nao le - e
        nenhum teste estrutural diz o que e', porque a estrutura continua valida:
        e' um erro de sincronizacao, e sincronizacao nao se ve na geometria.
        """
        if linha < 0:
            linha += linhas
            col += 4 - ((linhas + 4) % 8)
        if col < 0:
            col += colunas
            linha += 4 - ((colunas + 4) % 8)

        por(col, linha, 1 if codewords[pos] & (1 << (8 - bit)) else 0)

    def utah(linha: int, col: int, pos: int) -> None:
        modulo(linha - 2, col - 2, pos, 1)
        modulo(linha - 2, col - 1, pos, 2)
        modulo(linha - 1, col - 2, pos, 3)
        modulo(linha - 1, col - 1, pos, 4)
        modulo(linha - 1, col, pos, 5)
        modulo(linha, col - 2, pos, 6)
        modulo(linha, col - 1, pos, 7)
        modulo(linha, col, pos, 8)

    # Os quatro cantos, nas condicoes em que a norma os poe.
    def canto1(pos: int) -> None:
        modulo(linhas - 1, 0, pos, 1)
        modulo(linhas - 1, 1, pos, 2)
        modulo(linhas - 1, 2, pos, 3)
        modulo(0, colunas - 2, pos, 4)
        modulo(0, colunas - 1, pos, 5)
        modulo(1, colunas - 1, pos, 6)
        modulo(2, colunas - 1, pos, 7)
        modulo(3, colunas - 1, pos, 8)

    def canto2(pos: int) -> None:
        modulo(linhas - 3, 0, pos, 1)
        modulo(linhas - 2, 0, pos, 2)
        modulo(linhas - 1, 0, pos, 3)
        modulo(0, colunas - 4, pos, 4)
        modulo(0, colunas - 3, pos, 5)
        modulo(0, colunas - 2, pos, 6)
        modulo(0, colunas - 1, pos, 7)
        modulo(1, colunas - 1, pos, 8)

    def canto3(pos: int) -> None:
        modulo(linhas - 3, 0, pos, 1)
        modulo(linhas - 2, 0, pos, 2)
        modulo(linhas - 1, 0, pos, 3)
        modulo(0, colunas - 2, pos, 4)
        modulo(0, colunas - 1, pos, 5)
        modulo(1, colunas - 1, pos, 6)
        modulo(2, colunas - 1, pos, 7)
        modulo(3, colunas - 1, pos, 8)

    def canto4(pos: int) -> None:
        modulo(linhas - 1, 0, pos, 1)
        modulo(linhas - 1, colunas - 1, pos, 2)
        modulo(0, colunas - 3, pos, 3)
        modulo(0, colunas - 2, pos, 4)
        modulo(0, colunas - 1, pos, 5)
        modulo(1, colunas - 3, pos, 6)
        modulo(1, colunas - 2, pos, 7)
        modulo(1, colunas - 1, pos, 8)

    pos = 0
    linha = 4
    col = 0

    while True:
        if linha == linhas and col == 0:
            canto1(pos)
            pos += 1
        if linha == linhas - 2 and col == 0 and colunas % 4 != 0:
            canto2(pos)
            pos += 1
        if linha == linhas - 2 and col == 0 and colunas % 8 == 4:
            canto3(pos)
            pos += 1
        if linha == linhas + 4 and col == 2 and colunas % 8 == 0:
            canto4(pos)
            pos += 1

        while True:
            if linha < linhas and col >= 0 and livre(col, linha):
                utah(linha, col, pos)
                pos += 1
            linha -= 2
            col += 2
            if not (linha >= 0 and col < colunas):
                break
        linha += 1
        col += 3

        while True:
            if linha >= 0 and col < colunas and livre(col, linha):
                utah(linha, col, pos)
                pos += 1
            linha += 2
            col -= 2
            if not (linha < linhas and col >= 0):
                break
        linha += 3
        col += 1

        if not (linha < linhas or col < colunas):
            break

    # O canto de baixo a direita, se sobrou por preencher.
    #
    # **O indice e' `linhas * colunas - 1` e nao `+ colunas - 1`.** O web
    # escreveva `linhas * colunas + colunas - 1`, que e' `colunas - 1` posicoes
    # a mais: em JavaScript um `Uint8Array` fora do fim dao `undefined`, e
    # `undefined < 0` e' falso, portanto **o bloco nunca corria** e o bug ficava
    # dormido. Em Python o mesmo indice levanta `IndexError`, e foi ao portar que
    # ele apareceu.
    #
    # **E' o melhor exemplo que ha de "o mesmo bug com outro nome noutra
    # linguagem"**: o codigo e' igual, a expressao e' igual, e so o que acontece
    # com um indice fora do fim e' que difere. Em JS o sintoma de um erro e' nada
    # acontecer; em Python e' uma excecao que aponta para a linha.
    if modulos[linhas * colunas - 1] < 0:
        por(colunas - 1, linhas - 1, 1)
        por(colunas - 2, linhas - 2, 1)

    return modulos


# --- A construcao do simbolo ------------------------------------------------


def com_guias(regiao: list[int], simbolo: tuple[int, ...]) -> list[list[int]]:
    """
    Poe as guias a volta da regiao de dados.

    **A guia de baixo-esquerda e' cheia e a de cima-direita e' tracejada**, e essa
    assimetria e' a assinatura do Data Matrix. Nao e' decorativo: o leitor sabe
    onde esta' o canto pelas duas juntas, e uma delas ser cheia quando devia ser
    tracejada (ou o contrario) da um codigo que ninguem le.
    """
    g = geometria(simbolo)
    largura_dados = g.dados_colunas
    altura_dados = g.dados_linhas

    modulos = [[0] * g.colunas for _ in range(g.linhas)]
    y = 0

    for f in range(altura_dados):
        x = 0

        # A guia de cima: alternada, e e' a tracejada do canto de cima-direita.
        if f % g.regiao_altura == 0:
            for i in range(g.colunas):
                modulos[y][x] = 1 if i % 2 == 0 else 0
                x += 1
            y += 1

        x = 0
        for i in range(largura_dados):
            # A guia da esquerda de cada regiao: cheia. E' a vertical do L.
            if i % g.regiao_largura == 0:
                modulos[y][x] = 1
                x += 1
            modulos[y][x] = 1 if regiao[f * largura_dados + i] == 1 else 0
            x += 1
            # A guia da direita de cada regiao: alternada com as linhas.
            if i % g.regiao_largura == g.regiao_largura - 1:
                modulos[y][x] = 1 if f % 2 == 0 else 0
                x += 1
        y += 1

        # A guia de baixo: cheia. E' a horizontal do L.
        #
        # **O `x = 0` e' obrigatorio.** Sem ele, a guia comeca onde a linha de
        # dados acabou - ou seja, fora da matriz - e a ultima linha do simbolo sai
        # vazia. O sintoma e' um codigo que se parece com um Data Matrix e nao e'
        # lido por nada, porque e' a guia de baixo que o leitor usa para se
        # orientar. E a ultima linha e' a ultima coisa que se olha.
        if f % g.regiao_altura == g.regiao_altura - 1:
            x = 0
            for i in range(g.colunas):
                modulos[y][x] = 1
                x += 1
            y += 1

    return modulos


def montar(dados: list[int], nome_simbolio: str = "Data Matrix") -> dict:
    """
    De uma lista de codewords ate a matriz.

    Separado de :func:`data_matrix` para que o GS1 entre por aqui: a escolha do
    simbolo, o enchimento, a correccao de erros e a colocacao sao as mesmas, e uma
    segunda implementacao de cada uma delas seria uma segunda fonte de verdade
    sobre a parte que o ZXing verifica.
    """
    simbolo = simbolo_para(len(dados))
    g = geometria(simbolo)
    com_dados = encher(dados, g.dados)
    com_ec = corrigir(com_dados, simbolo)

    regiao = colocar(com_ec, g.dados_colunas, g.dados_linhas)

    return {
        "simbologia": nome_simbolio,
        "modulos": com_guias(regiao, simbolo),
        "colunas": g.colunas,
        "linhas": g.linhas,
        "dados": g.dados,
        "correccao": g.correccao,
        "capacidade": g.dados,
        "usado": len(dados),
        "codewords": list(dados),
    }


# --- A API ------------------------------------------------------------------


def data_matrix(texto: str) -> dict:
    """
    Codifica em Data Matrix (ECC200).

    :param texto: o que codificar. Qualquer texto UTF-8 cabe - nao ha o limite de
        ASCII dos codigos de barras de uma linha, porque cada byte acima de 127
        custa dois codewords em vez de ser recusado.
    :raises ValueError: se o texto estiver vazio ou for maior que 1558 codewords.
    :return: ``simbologia``, ``modulos`` (a matriz com as guias), ``colunas``,
        ``linhas``, ``dados``, ``correccao``, ``capacidade``, ``usado`` e
        ``codewords``.
    """
    conteudo = str(texto)

    if len(conteudo) == 0:
        raise ValueError("Data Matrix: escreve alguma coisa para codificar.")

    # **`codewords` salta a compactacao, e e' por isso que `montar` e' publico.**
    #
    # O GS1 DataMatrix nao e' um texto com um prefixo: e' uma lista de codewords
    # onde o FNC1 - o 232 - aparece em posicoes que dependem da estrutura dos
    # campos, e nao do texto. Passar por `compactar` perderia essa estrutura, e o
    # 232 no meio seria lido como o par de digitos "02", que e' o mesmo codeword.
    return montar(compactar(conteudo.encode("utf-8")))


def data_matrix_de_codewords(
    codewords: list[int], nome_simbolio: str = "Data Matrix"
) -> dict:
    """De uma lista de codewords ate a matriz, para quem precisar dela."""
    return montar(list(codewords), nome_simbolio)


#: O registo, pelo id que o selector usa.
#:
#: **A chave e' a mesma nos cinco clientes**, e e' o que a `AGENTS.md` chama de
#: lista escrita duas vezes: o selector de formatos vive no cliente e o registo
#: vive no modulo, e nada os ligava.
SIMBOLOGIAS_DATAMATRIX = {"datamatrix": data_matrix}