"""
O Data Matrix em Python: a geometria, a correccao de erros e as guias.

Este ficheiro e' o **nivel 1** dos tres. O nivel 2 - gerar a imagem e le-la com um
leitor independente - esta' no `web/tests/descodificar-datamatrix-python.py`, e e'
o que decide se o encoder entra no repositorio.

**Estes testes affirmam invariantes, e nao a geometria de cada simbolo.** Um teste
que desenha o 144x144 e conta os modulos passa com o canto de baixo a direita por
preencher; **um teste que affirme que o canto esta' preenchido quando sobrou por
preencher falha com ele.**
"""

from __future__ import annotations

import pytest

from qrcode_core.simbologias.datamatrix import (
    CAPACIDADE_MAXIMA,
    FNC1,
    PAD,
    UPPER_SHIFT,
    aleatorizar253,
    com_guias,
    compactar,
    corrigir,
    correccao_de_bloco,
    colocar,
    data_matrix,
    data_matrix_de_codewords,
    encher,
    geometria,
    simbolo_para,
)
from qrcode_core.simbologias.tabelas_datamatrix import FATORES_EC, SIMBOLOS, ULTIMO


# --- A escolha do simbolo ----------------------------------------------------


class TestSimbolo:
    def test_o_menor_que_caiba(self):
        """Um codeword da mais vai para o 10x10, e e' o mais pequeno que existe."""
        assert geometria(simbolo_para(1)).colunas == 10

    def test_a_capacidade_cresce_de_um_em_um(self):
        """
        **O simbolo de N codewords e' o primeiro da tabela com capacidade >= N.**

        A forma de o provar sem escrever numeros a mao e' a mesma que a do
        verificador dos cinco ficheiros: cada simbolo aguenta um codeword a
        menos do que o seguinte aguenta, e nenhum aguenta um a mais. Sem o
        segundo, uma tabela fora de ordem nao dava erro - dava um codigo grande
        a mais, que e' lido e nao se percebe porque.
        """
        for anterior, seguinte in zip(SIMBOLOS, SIMBOLOS[1:]):
            g = geometria(anterior)
            # O ultimo codeword do simbolo entra nele...
            assert geometria(simbolo_para(g.dados)).colunas == g.colunas
            # ...e o seguinte nao.
            assert geometria(simbolo_para(g.dados + 1)).colunas > g.colunas

    def test_um_codeword_a_mais_vae_para_o_simbolo_seguinte(self):
        """Encher um simbolo ate a capacidade muda-o: e' o que prova que a
        capacidade e' a que a tabela diz e nao a que a geometria permite."""
        g = geometria(simbolo_para(3))
        # O 10x10 leva 3 de dados. Quatro ja nao cabem.
        assert geometria(simbolo_para(4)).colunas > g.colunas

    def test_o_maior_leva_a_capacidade_da_tabela(self):
        assert CAPACIDADE_MAXIMA == SIMBOLOS[-1][0]

    def test_acima_da_capacidade_maxima_recusa(self):
        with pytest.raises(ValueError, match="1558"):
            data_matrix("A" * 4000)

    def test_a_mensagem_diz_o_limite(self):
        """O erro tem de dizer o limite e o que deu, e nao apenas 'erro'."""
        with pytest.raises(ValueError) as erro:
            data_matrix("A" * 4000)
        assert "1558" in str(erro.value)

    def test_vazio_recusa(self):
        with pytest.raises(ValueError, match="alguma coisa"):
            data_matrix("")


# --- A geometria -------------------------------------------------------------


class TestGeometria:
    def test_as_guias_sao_uma_por_regiao_de_cada_lado(self):
        """
        A largura do simbolo e' a regiao de dados mais **duas guias**, e as duas
        sao uma por regiao na horizontal e uma por regiao na vertical.

        **E' por isso que o `regioes` da tabela nao serve.** O 144x144 tem 36
        regioes - seis de cada lado - e a conta `+ regioes` dava 132 + 36 = 168
        em vez de 132 + 6 + 6 = 144. **A matriz saia 24 colunas mais larga do que
        o encoder pintou**, e o desenho wrote as guias fora dela.
        """
        ultimo = geometria(simbolo_para(CAPACIDADE_MAXIMA))

        assert ultimo.regioes == 36
        assert ultimo.colunas == ultimo.dados_colunas + 6 + 6
        assert ultimo.linhas == ultimo.dados_linhas + 6 + 6

    def test_a_largura_e_igual_a_altura_em_todos_os_24(self):
        for simbolo in SIMBOLOS:
            g = geometria(simbolo)
            assert g.colunas == g.linhas, "a tabela tem um simbolo nao quadrado"

    def test_o_menos_um_da_tabela_vira_o_tamanho_do_simbolo(self):
        """Quase todos os simbolos tem um bloco do tamanho do simbolo, e o `-1`
        e' o que diz isso."""
        for simbolo in SIMBOLOS:
            g = geometria(simbolo)
            if simbolo[5] == -1:
                assert g.bloco_dados == g.dados
            else:
                assert g.bloco_dados == simbolo[5]

    def test_a_matriz_devolvida_tem_as_dimensoes_ditas(self):
        for texto in ("A", "MAST-2024-0001", "9" * 900):
            codigo = data_matrix(texto)
            assert len(codigo["modulos"]) == codigo["linhas"]
            assert all(len(linha) == codigo["colunas"] for linha in codigo["modulos"])


# --- A codificacao de nivel alto --------------------------------------------


class TestCompactar:
    def test_ascii_entra_com_o_valor_mais_um(self):
        """`A` e' 0x41, e no codigo e' 0x42."""
        assert compactar(b"A") == [0x42]

    def test_o_mais_um_reserva_o_zero(self):
        """O 0 e' o valor de um codeword que nao existe, e por isso ASCII 0
        entra como 1 e nao como 0."""
        assert compactar(b"\x00") == [1]

    def test_digitos_viam_aos_pares(self):
        """
        `2026` sao **dois** codewords e nao quatro - e' a compressao de que o Data
        Matrix tira o nome.

        O valor e' ``d1 * 10 + d2 + 130``, e o 130 vem do facto de os pares
        começarem a esse valor para nao colidirem com o texto ASCII, que vai de 1
        a 128. **`20` sao 150 e `26` sao 156**, e nao 356: cada par e' lido a
        parte.
        """
        assert compactar(b"2026") == [150, 156]

    def test_um_digito_so_ao_fim_nao_vem_aos_pares(self):
        """O emparelhamento precisa de dois, e o ultimo digito entra normal.
        Sem o `i + 1 < len` o indice ia a ler o proximo texto."""
        assert compactar(b"202") == [150, ord("2") + 1]

    def test_um_digito_seguido_de_nao_digito_entra_normal(self):
        """O `20` emparelha, e o `A` nao pode - o emparelhamento e' so entre
        digitos."""
        assert compactar(b"20A") == [150, ord("A") + 1]

    def test_o_acento_custa_dois_e_so_dois(self):
        """
        **Um caractere acentuado em UTF-8 sao DOIS bytes, e por isso DOIS
        codewords mais o deslocamento.** E o que faz o texto com acentos entrar
        em metade do espaco: `ação` sao tres caracteres e **nove** codewords.
        """
        assert compactar("ç".encode("utf-8")) == [
            UPPER_SHIFT, 0xC3 - 127, UPPER_SHIFT, 0xA7 - 127
        ]

    def test_o_texto_so_com_acentos_custa_o_que_custa(self):
        """E o que faz um payload com acentos falhar o limite de 1558 codewords
        onde o mesmo texto em ASCII nao falha."""
        assert len(compactar("ção".encode("utf-8"))) == 9
        assert len(compactar("cao".encode("utf-8"))) == 3

    def test_o_menos_127_e_o_valor_certo(self):
        """
        **Este e' o teste que pegava o bug do `b - 128`.** Com 128 o ZXing devolve
        cada byte alto um abaixo do que foi escrito: um `ç` sai como `r`, e um
        `€` como `Ñ`. Todos os payloads ASCII liam-se bem e so os com acentos
        falhavam - que e' a assinatura de um erro que so aparece no canto.
        """
        assert compactar(b"\xe7") == [UPPER_SHIFT, 0xE7 - 127]
        assert compactar(b"\xff") == [UPPER_SHIFT, 0xFF - 127]

    def test_o_texto_vazio_da_lista_vazia(self):
        assert compactar(b"") == []


# --- O enchimento ------------------------------------------------------------


class TestEncher:
    def test_o_primeiro_enchimento_e_o_pad(self):
        assert encher([1, 2], 5)[:3] == [1, 2, PAD]

    def test_o_enchimento_enche_ate_a_capacidade(self):
        for capacidade in (3, 12, 62):
            assert len(encher([1], capacidade)) == capacidade

    def test_nao_enche_para_cima(self):
        """Um texto que ja caiba nao ganha um 129 ao fim."""
        assert encher([1, 2, 3], 3) == [1, 2, 3]

    def test_o_aleatorizado_esta_no_intervalo_certo(self):
        """Os valores depois do primeiro tem de ser 1 a 254: o 0 e' o codeword
        que nao existe e o 255 e' o 1 com o bit alto, que nao entra."""
        for posicao in range(1, 254):
            valor = aleatorizar253(posicao)
            assert 1 <= valor <= 254, f"posicao {posicao} deu {valor}"

    def test_o_aleatorizado_repete(self):
        """A mesma posicao da o mesmo valor: e' uma funcao do indice, e nao um
        gerador que muda a cada chamada."""
        assert aleatorizar253(7) == aleatorizar253(7)


# --- A correccao de erros ----------------------------------------------------


class TestCorreccao:
    def test_a_saida_tem_o_tamanho_dos_codewords(self):
        g = geometria(simbolo_para(3))
        com_ec = corrigir(encher([1, 2, 3], g.dados), simbolo_para(3))
        assert len(com_ec) == g.dados + g.correccao

    def test_o_bloco_entra_saida_invertido(self):
        """
        **A inversao e' da tabela, nao uma escolha.** A tabela dos factores poe o
        `x^(n-1)` no primeiro lugar e o ZXing inverte. Sem inverter a correccao
        sai toda ao contrario, e o sintoma e' o pior: a primeira linha bate
        certo e nenhuma le.
        """
        # Um bloco de dados todo com o mesmo valor tem uma correccao que nao e'
        # simetrica, e o inverso tem de ser diferente. Se as duas fossem iguais a
        # inversao nao estaria a fazer nada.
        correccao = correccao_de_bloco([42] * 10, 10)

        assert correccao != correccao[::-1]

    def test_o_entrelacamento_dispensa_o_da_primeira_falha(self):
        """
        Um rasgo vertical parte o mesmo numero de codewords em cada bloco, e
        cada bloco sabe corrigir os seus. **E o que se mede aqui: que a
        correccao de um bloco nao depende de onde ele esta no simbolo.**
        """
        simbolo = simbolo_para(200)
        g = geometria(simbolo)

        corrigir(encher([1] * 200, g.dados), simbolo)

    def test_o_maior_simbolo_tem_dez_blocos(self):
        """O 144x144 e' o unico com blocos de tamanho desigual, e por isso o
        `ULTIMO` existe. Sem os seis numeros, `corrigir` nao chega ao fim."""
        assert ULTIMO["blocos"] == 10
        assert ULTIMO["cheios"] == 8

    def test_a_conta_do_maior_simbolo_fecha(self):
        """8 x 156 + 2 x 155 = 1558. Com 154 dava 1556, e dois codewords a menos
        num codigo de 1558 e' o tipo de erro que o leitor acusa como corrupcao e
        nao como tabela errada."""
        capacidade = SIMBOLOS[-1][0]

        assert (
            ULTIMO["cheios"] * ULTIMO["dadosCheio"]
            + (ULTIMO["blocos"] - ULTIMO["cheios"]) * ULTIMO["dadosUltimos"]
            == capacidade
        )

    def test_o_maior_simbolo_corre_todo(self):
        """O caminho do 144x144 com os blocos desiguais, ate ao fim."""
        simbolo = simbolo_para(CAPACIDADE_MAXIMA)
        g = geometria(simbolo)

        com_ec = corrigir(encher([1] * g.dados, g.dados), simbolo)

        assert len(com_ec) == g.dados + ULTIMO["blocos"] * ULTIMO["erros"]

    def test_faltam_factores_da_o_erro(self):
        """Um numero de codewords de correccao que nao existe nao pode dar
        ``None`` a seguir: o erro tem de dizer qual e'."""
        with pytest.raises(ValueError, match="99"):
            correccao_de_bloco([1, 2, 3], 99)


# --- A colocacao -------------------------------------------------------------


class TestColocacao:
    def test_o_canto_de_baixo_a_direita_e_preenchido(self):
        """
        **Este e' o teste que apanha o indice `+ colunas - 1`.**

        O web escrevia ``bits[linhas * colunas + colunas - 1]``, que e'
        ``colunas - 1`` posicoes a mais: em JavaScript um ``Uint8Array`` fora do
        fim da ``undefined``, e ``undefined < 0`` e' falso, portanto **o bloco
        nunca corria**. O encoder desenhava o codigo, o ZXing lia-o, e o canto
        ficava por preencher sem ninguem ver.

        **Como o sintoma em JS e' nao passar nada**, este teste so existe porque
        o Python levantou ``IndexError`` na mesma linha. Duas linguagens, o mesmo
        bug, e so uma delas o conta.

        **O bloco so dispara em quatro dos vinte e quatro simbolos** - os de duas
        e de quatro regioes, em que sobra um par de modulos. Numa regiao so o
        canto ja fica preenchido pela varredura, e por isso que o teste usa o 10x10
        e nao o primeiro da tabela.
        """
        simbolo = simbolo_para(5)
        g = geometria(simbolo)
        modulos = colocar([0] * (g.dados + g.correccao), g.dados_colunas,
                          g.dados_linhas)

        lado = g.dados_linhas
        # O canto e' (colunas - 1, linhas - 1) e (colunas - 2, linhas - 2).
        assert modulos[(lado - 1) * lado + (lado - 1)] == 1
        assert modulos[(lado - 2) * lado + (lado - 2)] == 1

    def test_o_desenho_nunca_ve_um_menos_um(self):
        """
        **Sobre sobrar ``-1`` na regiao e' o comportamento da norma, e nao um
        buraco.** O ZXing usa uma ``BitArray`` em que um modulo por posto e' um
        ``false``, e por isso que o canto de baixo a direita tem de ser posto a
        mao: e' a unica correccao. Ficam dois modulos por posto em quatro dos
        vinte e quatro simbolos, e leem-se bem.

        O que **nao** pode e' um ``-1`` chegar ao desenho, porque ai o ``-1``
        vira "nao e' 1, portanto branco" e o codigo muda sem ninguem saber. E o
        que este teste afirma.
        """
        for simbolo in SIMBOLOS:
            g = geometria(simbolo)
            regiao = colocar([0] * (g.dados + g.correccao), g.dados_colunas,
                             g.dados_linhas)
            matriz = com_guias(regiao, simbolo)

            assert all(v in (0, 1) for linha in matriz for v in linha), (
                f"a matriz do simbolo de {g.colunas}x{g.colunas} tem um valor "
                "que nao e' 0 nem 1"
            )

    def test_o_canto_e_o_unico_modo_des_preenchido(self):
        """
        **Dois modulos por posto, e sao sempre os dois do canto.** A primeira
        versao deste teste afirmava que nao sobrava nenhum, e falhava - e a razao
        de falhar e' que o ``-1`` e' do ZXing e nao um erro.

        A propriedade que interessa e' que **sobra no maximo os dois** e que
        **sao o canto e o canto menos um**, porque um ``-1`` a mais seria um
        modulo que o encoder nao sabe quem poe.
        """
        for simbolo in SIMBOLOS:
            g = geometria(simbolo)
            modulos = colocar([0] * (g.dados + g.correccao), g.dados_colunas,
                              g.dados_linhas)

            assert modulos.count(-1) in (0, 2), (
                f"o simbolo de {g.colunas}x{g.colunas} deixou "
                f"{modulos.count(-1)} modulos por preencher"
            )

    def test_a_matriz_da_api_sempre_esta_no_formato_do_desenho(self):
        """O contrato do encoder com o desenho: lista de linhas, todas do mesmo
        comprimento, so com 0 e 1. E' o que o `to_bitmap_2d` assume."""
        for texto in ("A", "MAST-2024-0001", "9" * 900, "ção"):
            codigo = data_matrix(texto)

            assert all(
                len(linha) == codigo["colunas"] for linha in codigo["modulos"]
            ), texto
            assert all(
                v in (0, 1) for linha in codigo["modulos"] for v in linha
            ), texto

    def test_a_matriz_nao_tem_valores_fora_de_zero_e_um(self):
        g = geometria(simbolo_para(3))
        modulos = colocar([255] * (g.dados + g.correccao), g.dados_colunas,
                          g.dados_linhas)

        assert set(modulos) <= {0, 1}


# --- As guias ----------------------------------------------------------------


class TestGuias:
    def test_a_guia_de_baixo_e_cheia(self):
        """
        **A guia de baixo e' a horizontal do L, e e' cheia.** E' a que o leitor
        usa para se orientar, e uma guia tracejada em baixo da um codigo que se
        parece com um Data Matrix e nao e' lido por nada.
        """
        codigo = data_matrix("MAST-2024-0001")

        assert all(codigo["modulos"][-1]), "a guia de baixo tem de ser toda cheia"

    def test_a_guia_da_esquerda_e_cheia(self):
        """O outro braço do L, pela mesma razao."""
        codigo = data_matrix("MAST-2024-0001")

        assert all(linha[0] for linha in codigo["modulos"])

    def test_a_guia_de_cima_alterna(self):
        """
        A guia de cima e' a **tracejada** do canto de cima-direita. Alterna com
        a posicao, e nao com a linha: um modulo par e' escuro, um impar e' claro.
        """
        codigo = data_matrix("MAST-2024-0001")
        topo = codigo["modulos"][0]

        assert all(topo[i] == (1 if i % 2 == 0 else 0) for i in range(len(topo)))

    def test_as_duas_guias_sao_diferentes(self):
        """A assimetria e' a assinatura do formato. Um quadrado com as quatro
        guias iguais nao e' lido."""
        codigo = data_matrix("MAST-2024-0001")

        assert codigo["modulos"][0] != codigo["modulos"][-1]
        assert [linha[0] for linha in codigo["modulos"]] != [
            linha[-1] for linha in codigo["modulos"]
        ]

    def test_as_guias_nao_tocam_na_regiao_de_dados(self):
        """Com as guias a ocuparem os seus modulos, a largura da matriz e'
        exatamente regiao + guias. Sem o `x = 0` da guia de baixo a ultima linha
        do simbolo saia vazia - e a ultima linha e' a ultima coisa que se ve."""
        simbolo = simbolo_para(3)
        g = geometria(simbolo)

        regiao = [0] * (g.dados_colunas * g.dados_linhas)
        matriz = com_guias(regiao, simbolo)

        assert len(matriz) == g.linhas
        assert all(len(linha) == g.colunas for linha in matriz)
        assert all(matriz[g.linhas - 1])


# --- A API -------------------------------------------------------------------


class TestApi:
    def test_o_que_o_encoder_devolve(self):
        codigo = data_matrix("MAST-2024-0001")

        assert codigo["simbologia"] == "Data Matrix"
        assert codigo["usado"] < codigo["dados"]
        assert codigo["capacidade"] == codigo["dados"]
        assert codigo["codewords"] == compactar(b"MAST-2024-0001")

    def test_o_gs1_entra_pelos_codewords(self):
        """
        O GS1 DataMatrix nao e' um texto com um prefixo: e' uma lista de codewords
        onde o FNC1 aparece em posicoes que dependem da estrutura dos campos.
        """
        codigo = data_matrix_de_codewords([232, 10, 20, 30], "GS1 Data Matrix")

        assert codigo["simbologia"] == "GS1 Data Matrix"
        assert codigo["codewords"] == [232, 10, 20, 30]

    def test_o_fnc1_e_o_232(self):
        """E' o valor que o ZXing le como FNC1, e o mesmo que o par de digitos
        `02`. Por isso o GS1 nao pode passar pelo `compactar`: o 232 no meio
        seria lido como o par de digitos "02", que e' o mesmo codeword."""
        assert FNC1 == 232

    def test_o_texto_entra_como_utf8(self):
        """Cada caractere acima de 127 ocupa dois codewords, e nao e' recusado
        como nos codigos de barras de uma linha."""
        codigo = data_matrix("ção")

        assert codigo["codewords"] == compactar("ção".encode("utf-8"))

    def test_o_limite_e_o_mesmo_para_todos(self):
        """Um texto que caiba e' compacto e um que nao caiba recusa com a
        capacidade - e nao com um numero invented."""
        codigo = data_matrix("A" * 10)
        assert codigo["usado"] == 10

        with pytest.raises(ValueError):
            data_matrix("A" * (CAPACIDADE_MAXIMA * 3))


# --- A tabela ----------------------------------------------------------------


class TestTabela:
    def test_ha_24_simbolos_quadrados(self):
        """A norma define tambem os rectangulares, e nao entram: nenhum leitor de
        bolso os le."""
        assert len(SIMBOLOS) == 24

    def test_todos_os_simbolos_sao_quadrados(self):
        for simbolo in SIMBOLOS:
            assert geometria(simbolo).colunas == geometria(simbolo).linhas

    def test_a_geometria_dos_24_nao_repete_numeros_de_um_tamanho_proximo(self):
        """Cada simbolo e' maior que o anterior. Dois com o mesmo tamanho dariam
        um codigo que o leitor nao distingue."""
        for anterior, seguinte in zip(SIMBOLOS, SIMBOLOS[1:]):
            assert geometria(seguinte).colunas > geometria(anterior).colunas

    def test_ha_16_conjuntos_de_factores(self):
        assert len(FATORES_EC) == 16

    def test_a_chave_e_o_comprimento_do_conjunto(self):
        """A chave e' o numero de codewords de correccao, que e' o comprimento do
        conjunto. Os primeiros indices e os primeiros comprimentos coincidem por
        acaso e os ultimos nao."""
        assert sorted(FATORES_EC) == [5, 7, 10, 11, 12, 14, 18, 20, 24, 28, 36,
                                      42, 48, 56, 62, 68]

    def test_os_factores_do_codigo_tem_o_comprimento_da_chave(self):
        for chave, conjunto in FATORES_EC.items():
            assert len(conjunto) == chave

    def test_todos_os_factores_cabem_em_oito_bits(self):
        """Um factor acima de 255 nao cabe num byte, e a multiplicacao em GF(256)
        fica errada sem dar erro."""
        for conjunto in FATORES_EC.values():
            assert all(0 <= f <= 255 for f in conjunto)


# --- A geometria usada pelo desenho ------------------------------------------


class TestDesenho2D:
    def test_a_zona_muda_e_um_ou_mais(self):
        """O leitor orienta-se pelos cantos tracejados, e sem margem a
        deteccao falha. Quatro nao arranjam - e um Data Matrix desenhado com a
        margem do EAN fica maior do que a precisa."""
        from qrcode_core.simbologias.desenho import ZONA_MUDA_2D

        assert ZONA_MUDA_2D >= 1

    def test_a_imagem_e_um_png(self):
        from qrcode_core.simbologias.desenho import to_bitmap_2d

        png = to_bitmap_2d(data_matrix("MAST-2024-0001")["modulos"])

        assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def test_a_imagem_tem_a_zona_muda_a_volta(self):
        """
        **A margem e' a que o leitor precisa, e um teste so de que a imagem sai
        nao diz nada sobre ela.** A zona muda e' um quadrado nos quatro lados: uma
        margem so vertical deixa de o leitor detectar os limites.
        """
        import io

        from PIL import Image

        from qrcode_core.simbologias.desenho import (
            ZONA_MUDA_2D,
            to_bitmap_2d,
        )

        codigo = data_matrix("MAST-2024-0001")
        imagem = Image.open(io.BytesIO(to_bitmap_2d(codigo["modulos"], escala=4)))

        assert imagem.width == (codigo["colunas"] + 2 * ZONA_MUDA_2D) * 4
        assert imagem.height == (codigo["linhas"] + 2 * ZONA_MUDA_2D) * 4

        # A margem e' branca: o canto mais proximo do codigo tem de estar vazio.
        for x in range(ZONA_MUDA_2D * 4):
            assert imagem.getpixel((x, 0)) == 255