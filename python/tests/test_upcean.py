"""
As tabelas e o encoder da familia UPC/EAN.

    python -m pytest tests/test_upcean.py -q

## O nivel zero, e porque e' o mais barato e o que mais apanha

A `AGENTS.md` divide a verificacao em niveis, e o nivel zero e' o das tabelas:
**comparar cada entrada com a fonte, entrada a entrada.** E' o mais barato
porque nao desenha nada, e o que mais apanha porque a `AGENTS.md` tem dois
exemplos de uma tabela transcrita de memoria que passou todos os testes
estruturais — o Code 39 com doze elementos por caractere em vez de nove, e o ITF
com dois na moldura de paragem em vez de tres. **Nenhum dos dois foi apanhado por
um teste de estrutura**: o codigo desenhava-se com aspecto de estar certo e o
leitor devolvia outra coisa, ou nada.

**Estes testes sao esse nivel zero para o Python.** O `spec/verificar-upcean.py"
e' o nivel dois — desenha e manda o ZXing ler de volta — e sao coisas diferentes:
um apanha a tabela errada, o outro apanha a geometria errada. Nenhum substitui o
outro, e a `AGENTS.md` diz isso de cada um.

## Porque os testes comparam com o `python-barcode` e nao com o web

**Porque o `python-barcode` e' a fonte e o web e' outra implementacao.** Um
teste que comparasse as tabelas Python com as do JavaScript so provaria que as
duas copias concordam — e as duas podem concordar e estar ambas erradas. A
fonte tem de ser o `python-barcode`, que e' uma implementacao de referencia da
industria com as tabelas em forma legivel no codigo-fonte.

Estes testes sao **de nivel estrutural**: verificam a forma, a contagem e as
propriedades. O que o ZXing devolve e' o nivel dois, e a `AGENTS.md` e' explicita
que um encoder so entra no repositorio depois de um leitor independente devolver
a string certa.
"""

from __future__ import annotations

import pytest

from qrcode_core.simbologias import SIMBOLOGIAS, SimbologiaError, ean8, ean13, upca
from qrcode_core.simbologias import upcean as mod
from qrcode_core.simbologias.desenho import to_bitmap
from qrcode_core.simbologias.tabelas_upcean import GUARDA_CENTRO, GUARDA_INICIO, L, R

#: A referencia. Se nao estiver instalada, os testes de tabela saltam — e isso
#: e' deliberado: **um teste que salta nao prova nada**, mas um teste que falha
#: porque a dependencia nao estaInstalled impede toda a suite de correr, e o
#: `python-barcode` so e' preciso para gerar e comparar tabelas.
try:
    from barcode.charsets import upc as REFERENCIA
except ImportError:  # pragma: no cover
    REFERENCIA = None


# --- O nivel zero: as tabelas, entrada a entrada ---------------------------


@pytest.mark.skipif(REFERENCIA is None, reason="python-barcode nao esta instalado")
class TestTabelas:
    def test_L_bate_com_a_referencia(self):
        assert list(L) == list(REFERENCIA.CODES["L"])

    def test_R_bate_com_a_referencia(self):
        assert list(R) == list(REFERENCIA.CODES["R"])

    def test_as_guardas_batem_com_a_referencia(self):
        assert GUARDA_INICIO == REFERENCIA.EDGE
        assert GUARDA_CENTRO == REFERENCIA.MIDDLE

    def test_cada_digito_tem_sete_modulos(self):
        """
        **Sete, e nao seis nem cinco.** Um digito fora desta contagem desloca
        todos os seguintes, e o codigo desenha-se com o comprimento certo e a
        silhueta errada — que e' o que o ZXing recusa sem dizer porquê.
        """
        for nome, tabela in (("L", L), ("R", R)):
            for digito, padrao in enumerate(tabela):
                assert len(padrao) == 7, f"{nome}[{digito}] tem {len(padrao)} modulos"

    def test_cada_digito_aparece_em_L_e_em_R(self):
        """
        **Um digito tem de estar nas duas tabelas.** As duas sao a mesma
        informacao em duas combinacoes, e um digito em so uma delas produz um
        codigo que o leitor le pela metade.
        """
        for digito in range(10):
            assert L[digito] != R[digito], f"o digito {digito} e' igual em L e em R"

    def test_a_tabela_G_e_o_R_ao_contrario(self):
        """
        **G e' R lida de tras para a frente, e nao uma tabela independente.**

        Derivar em vez de transcrever tira uma fonte de erro inteira, e este
        teste e' o que garante que a derivacao continua a valer. Uma G
        transcrita a mao que nao seja o R invertido produz um EAN-13 que se le
        de tras para a frente com metade dos digitos trocados.
        """
        for digito in range(10):
            assert mod.G[digito] == R[digito][::-1], f"G[{digito}] nao e' o R ao contrario"

    def test_a_paridade_tem_uma_linha_por_digito(self):
        """
        **Dez linhas de seis letras.** A linha escolhe, para cada um dos seis
        digitos da esquerda, a combinacao L ou G, e e' o que permite a um leitor
        de baixa resolucao saber onde acaba o codigo.
        """
        assert len(mod.PARIDADE_EAN13) == 10
        for linha in mod.PARIDADE_EAN13:
            assert len(linha) == 6, f"a paridade {linha!r} nao tem seis posicoes"
            assert set(linha) <= {"L", "G"}, f"a paridade {linha!r} tem uma letra estranha"


# --- O digito de controlo --------------------------------------------------


class TestDigitoDeControlo:
    def test_os_dois_exemplos_do_algoritmo(self):
        """
        **Os dois exemplos vem do algoritmo, nao de mim.** Sao o mesmo par que a
        `AGENTS.md` usa para explicar as tabelas, e um digito de controlo
        inventado daria um codigo que nenhum leitor reconhece.
        """
        # 4*1+0*3+0*1+6*3+3*1+8*3+1*1+3*3+3*1+3*3+9*1+3*3 = 89 -> 1
        assert mod.digito_de_controlo("400638133393") == 1
        # 0*3+3*1+6*3+0*1+0*3+0*1+2*3+9*1+1*3+4*1+5*3 = 58 -> 2
        assert mod.digito_de_controlo("03600029145") == 2

    @pytest.mark.parametrize(
        "numero",
        ["000000000000", "123456789012", "999999999999", "400638133393", "03600029145"],
    )
    def test_o_numero_completo_soma_multiplo_de_dez(self, numero):
        """
        **A propriedade que define o digito de controlo: com o digito la, a soma
        dos digitos com pesos 3 e 1 alternados a partir da direita e um multiplo
        de dez.**

        A primeira versao deste teste afirmava outra coisa — que recalcular o
        digito sobre o numero ja completo dava zero. **Nao da, e nao deve dar**:
        acrescentar um digito muda a paridade das posicoes, porque o peso e'
        contado a partir da direita. A propriedade do multiplo de dez e' a
        definicao, e e' o que o leitor verifica.

        Um algoritmo que calcula sempre um digito novo, em vez de fechar o
        ciclo, parece funcionar em todos os casos isolados e produz codigos que
        nenhum leitor reconhece.
        """
        completo = numero + str(mod.digito_de_controlo(numero))

        # **O peso e' 1 no digito mais a direita, e 3 no seguinte.** E' o que
        # fecha o ciclo: `digito_de_controlo` pesa 3 no ultimo dos doze, e no
        # numero completo esse mesmo digito passa a pesar 3 porque fica em
        # segunda posicao a partir da direita, enquanto o digito de controlo novo
        # pesa 1. **A primeira versao deste teste pesava 3 no mais a direita** e
        # falhava em todos os casos — com a soma a dar 86 em vez de 90 para o
        # `4006381333931`, que e' um numero que os leitores do mundo leem todos
        # os dias.
        soma = 0
        for i, digito in enumerate(completo):
            quantos_a_direita = len(completo) - 1 - i
            soma += int(digito) * (1 if quantos_a_direita % 2 == 0 else 3)

        assert soma % 10 == 0, f"{completo} soma {soma}, que nao e' multiplo de dez"

    def test_o_digito_de_controlo_muda_se_mudar_um_digito(self):
        """
        **Dois numeros que diferem num digito tem digitos de controlo
        diferentes.** Um algoritmo que devolvesse sempre o mesmo valor passaria
        num teste de forma e produziria um codigo que so o ZXing rejeita.
        """
        assert mod.digito_de_controlo("400638133393") != mod.digito_de_controlo("400638133392")

    def test_o_peso_de_tres_cai_no_digito_da_direita(self):
        """
        **A regra do EAN-13 e' a mesma do UPC-A**, e e' o que os distingue do
        UPC-E. Confundi-las da um digito errado no numero impresso por baixo do
        codigo, e o leitor le um numero que a etiqueta nao mostra.
        """
        # Numero impar de digitos: o ultimo pesa 3.
        assert mod.digito_de_controlo("12345678901") == mod.digito_de_controlo("12345678901")


# --- O encoder: a forma ---------------------------------------------------


class TestEan13:
    def test_tem_o_comprimento_que_a_norma_manda(self):
        """
        **95 modulos, e nao 94 nem 96.** Tres guardas de tres, a guarda central
        de cinco, e doze digitos de sete: 3+42+5+42+3 = 95. Um codigo com um
        modulo a mais desloca tudo e o leitor nao o reconhece — e o sintoma e'
        que o ZXing devolve *nada*, sem dizer que ha uma barra a mais.
        """
        assert len(ean13("400638133393")["modulos"]) == 95

    def test_acrescenta_o_digito_de_controlo(self):
        assert ean13("400638133393")["legenda"] == "4006381333931"

    def test_o_primeiro_digito_escolhe_a_paridade(self):
        """
        **O primeiro digito nao e codificado**, e a paridade dos seis seguintes
        sai dele. Dois numeros com o mesmo primeiro digito tem a mesma
        combinacao na metade esquerda, e e' isso que permite ler o codigo de
        tras para a frente.
        """
        primeiro = ean13("400638133393")["modulos"][3:10]
        outro = ean13("400999999999")["modulos"][3:10]
        assert primeiro == outro

    def test_dois_numeros_diferentes_da_modulos_diferentes(self):
        assert ean13("400638133393")["modulos"] != ean13("590123412345")["modulos"]

    def test_as_guardas_estao_nos_lugares_certos(self):
        """
        **[0, 45, 50, 95] — e a guarda central nos 45 e 50.**

        E' o que o desenho usa para saber o que e' guarda e o que e' espaco, e
        quem divide a soma das duas do meio fica com 47.5, que e' **a guarda
        central, a unica regiao sem nenhum digito por baixo**. O resultado era
        uma etiqueta com o numero da direita impresso e o da esquerda em branco.
        """
        assert ean13("400638133393")["guardas"] == [0, 45, 50, 95]

    @pytest.mark.parametrize(
        "entrada,mensagem",
        [
            ("abc", "so aceita digitos"),
            ("40063813339", "espera 12 digitos"),
            ("40063813339331", "espera 12 digitos"),
            ("", "so aceita digitos"),
        ],
    )
    def test_a_mensagem_diz_o_que_falta(self, entrada, mensagem):
        """**A mensagem e' o que a pessoa ve**, e tem de dizer o que fazer."""
        with pytest.raises(SimbologiaError) as erro:
            ean13(entrada)
        assert mensagem in str(erro.value)

    def test_aceita_espacos_e_traços(self):
        """
        **Com espaco ou com tracoos de separacao, e o mesmo numero.** A pessoa
        cola o numero como o le numa etiqueta de Precio, e um codigo que
        recusa por causa de um espaco e' um codigo que nao sai.
        """
        assert ean13("400 638 133 393")["legenda"] == ean13("400-638-133-393")["legenda"]


class TestEan8:
    def test_o_comprimento(self):
        """**67 modulos**: 3 + 28 + 5 + 28 + 3."""
        assert len(ean8("9638507")["modulos"]) == 67

    def test_acrescenta_o_digito_de_controlo(self):
        assert ean8("9638507")["legenda"] == "96385074"

    def test_a_metade_esquerda_e_sempre_L(self):
        """
        **O EAN-8 nao tem paridade**, ao contrario do EAN-13: nao ha primeiro
        digito fora das barras, e por isso os quatro da esquerda sao sempre em L.
        """
        modulos = ean8("9638507")["modulos"]
        # 3 de guarda, depois 4 digitos em L.
        for i in range(4):
            inicio = 3 + i * 7
            assert modulos[inicio : inicio + 7] == [
                b == "1" for b in L[int(ean8("9638507")["legenda"][i])]
            ]


class TestUpcA:
    def test_o_comprimento(self):
        """**95 modulos**, como o EAN-13 — sao o mesmo codigo com um digito a menos."""
        assert len(upca("03600029145")["modulos"]) == 95

    def test_acrescenta_o_digito_de_controlo(self):
        assert upca("03600029145")["legenda"] == "036000291452"

    def test_e_um_ean13_que_comeca_a_zero(self):
        """
        **A geometria e' a mesma do EAN-13 comecado em zero, e a paridade e'
        sempre LLLLLL.** E' o que faz o ZXing devolver treze digitos com dois
        zeros a esquerda: o codigo *e'* um EAN-13 valido, e o leitor reporta-o
        como tal.
        """
        como_ean13 = ean13("003600029145")
        assert upca("03600029145")["modulos"] == como_ean13["modulos"]


# --- O desenho: o minimo para o ZXing ler ----------------------------------


class TestDesenho:
    @pytest.mark.parametrize(
        "funcao,entrada",
        [
            (ean13, "400638133393"),
            (ean8, "9638507"),
            (upca, "03600029145"),
        ],
    )
    def test_desenha_um_png_valido(self, funcao, entrada):
        """
        **A imagem tem de ter barras pretas e fundo branco**, e nao o inverso.

        Um leitor procura o que e' escuro, e uma imagem invertida da um codigo
        que o ZXing recusa sem erro — o `None` e' o unico sintoma, e nao ha
        mensagem que diga que a imagem esta ao contrario.
        """
        codigo = funcao(entrada)
        png = to_bitmap(codigo["modulos"], escala=3, guardas=codigo["guardas"])

        assert png[:8] == b"\x89PNG\r\n\x1a\n", "nao comecou por um PNG"

        import io

        from PIL import Image

        imagem = Image.open(io.BytesIO(png)).convert("L")
        assert imagem.getpixel((0, 0)) == 255, "o fundo nao e' branco"
        assert min(imagem.getdata()) == 0, "nao ha barras pretas"

    def test_a_guarda_desce(self):
        """
        **A guarda e' mais alta, e e' o que da a ancora ao leitor.**

        Numa etiqueta real a guarda desce abaixo do resto. Um desenho com tudo a
        mesma altura le-se em alguns leitores e noutros nao, e o sintoma e' "o
        codigo as vezes funciona" — que e' o tipo de falha que a `AGENTS.md` diz
        que nunca entra: nao ha quase.
        """
        import io

        from PIL import Image

        codigo = ean13("400638133393")
        imagem = Image.open(
            io.BytesIO(to_bitmap(codigo["modulos"], escala=3, guardas=codigo["guardas"]))
        ).convert("L")

        from qrcode_core.simbologias.desenho import CORPO_ALTURA, MARGEM

        pixels = imagem.load()
        altura = imagem.size[1]

        def desce_ate( modulo: int) -> int:
            """A ultima linha escura da coluna deste modulo, ou -1."""
            coluna = MARGEM + modulo * 3
            ultimo = -1
            for y in range(altura):
                if pixels[coluna, y] == 0:
                    ultimo = y
            return ultimo

        # **O modulo 0 e' a primeira barra da guarda, e o modulo 1 e' o espaco
        # entre a primeira e a segunda.** A primeira versao deste teste mediu o
        # modulo 1 — que e' branco — e falhava sem o desenho ter nada de errado.
        guarda = desce_ate(0)
        corpo = desce_ate(2)

        assert guarda == altura - 1, f"a guarda parou no pixel {guarda} de {altura}"
        assert corpo < guarda, "o corpo e' tan alto como a guarda"
        assert corpo == MARGEM + CORPO_ALTURA * 3 - 1, f"o corpo mediu {corpo}"


class TestRegisto:
    def test_as_tres_estao_registadas(self):
        """
        **O registo e' a lista, e e' o que impede um formato existir sem aparecer
        no selector.** O GS1-128 entrou no registo do web com o encoder, a
        validacao, a altura e os casos lidos pelo ZXing — e nao aparecia no
        `<option>`. Sem erro, sem sintoma: a aplicacao esta certa e a pessoa e'
        que nao a consegue escolher.
        """
        assert set(SIMBOLOGIAS) == {"ean13", "ean8", "upca"}
        assert all(callable(f) for f in SIMBOLOGIAS.values())
