"""Os seis testes que dependem de barras invertidas, reescritos com a verdade.

Este ficheiro substitui as versoes anteriores em `test_tipos.py`, que falhavam
por causa do **escape do proprio ficheiro de teste**: um `"a\\;b"` num ficheiro
Python e' a cadeia `a\;b`, com **uma** barra, e a que o teste esperava tinha
**duas**. Nove em cada dez destas falhas eram o teste a errar e nao o modulo.

**Por que um ficheiro a parte e nao mais uma correccao.** Porque estes seis
casos dependem de tres coisas ao mesmo tempo — quantas barras o Python le de um
literal, quantas o `escape_ical` escreve, e quantas o leitor de iCalendar
interpreta — e a conta e' facil de errar de tres maneiras. O modulo foi
verificado com `chr(92)` e com a representacao de `%r`, que sao as duas unicas
formas de ver quantas barras existem de facto.
"""

from __future__ import annotations

from qrcode_core.tipos import build, escape_ical, is_sms_safe

#: A barra invertida, construida sem a escrever no literal.
#:
#: **Um `"\\"` num ficheiro Python e' uma barra, nao duas** — o `\\` e' o escape
#: do proprio Python. Escrever barras para testar barras e' a origem de metade
#: dos testes que falham sem o modulo ter nada de errado.
BARRA = chr(92)

#: O fim de linha do iCalendar.
CRLF = chr(13) + chr(10)


def test_escape_ical_escapa_o_ponto_e_virgula():
    """
    **Um `;` sem escape acaba o campo no sitio errado**, e o telefone mostra o
    titulo do evento cortado — ou o nome do contacto truncado.
    """
    assert escape_ical("a;b") == "a" + BARRA + ";b"
    assert escape_ical("a,b") == "a" + BARRA + ",b"


def test_escape_ical_duplica_a_barra():
    """
    **A barra invertida e' escapada, porque e' o proprio caractere de escape do
    iCalendar.** Uma barra a mais no fim de um nome de ficheiro a seguir mostra
    uma barra a mais no documento.
    """
    assert escape_ical("a" + BARRA + "b") == "a" + BARRA * 2 + "b"


def test_escape_ical_escapa_a_barra_antes_do_separador():
    """
    **A barra vem antes do `;` na substitucao, e por isso que sao tres barras.**

    O original tem `\\;`. A primeira substituicao escapa a barra: `\\\\`. A
    segunda escapa o `;`: `\;`. Juntas dão **tres** barras seguidas.

    **A ordem e' o que faz funcionar.** Se o `;` fosse escapado antes da barra, a
    barra nova do escape do `;` seria escapada a seguir, e o resultado eram
    **quatro** barras — que um leitor le como uma barra a mais no texto.
    """
    assert escape_ical("a" + BARRA + ";b") == "a" + BARRA * 3 + ";b"
    assert escape_ical("a" + BARRA + ",b") == "a" + BARRA * 3 + ",b"


def test_escape_ical_escapa_a_quebra_de_linha():
    """
    **O `\\n` do iCalendar e' uma barra e um `n`, e nao uma quebra de linha** — e
    a razao de o escape existir: uma quebra a mais parte o `.ics` em duas
    linhas e o leitor so le a primeira.
    """
    # **O lado esquerdo usa `chr()` e o direito usa `BARRA + "n"`, e a razao e'
    # que um `"a\nb"` num literal Python seria uma quebra de linha outra vez.**
    # A primeira versao comparava a coisa com ela propria e falhava sem o
    # modulo ter nada de errado.
    assert escape_ical("a" + chr(10) + "b") == "a" + BARRA + "n" + "b"
    assert escape_ical("a" + CRLF + "b") == "a" + BARRA + "n" + "b"
    assert escape_ical("a" + chr(13) + "b") == "a" + BARRA + "n" + "b"


def test_escape_ical_nao_escapa_o_dois_pontos():
    """
    **O `:` nao se escapa, e isso e' correcto.**

    No iCalendar so `;`, `,`, a barra e a quebra de linha separam. O `:` e' o
    separador entre o **nome** da propriedade e o **valor** — e escapar-o punha
    uma barra a mais num campo cujo nome ja tem dois pontos, que o leitor
    mostrava no texto.
    """
    assert escape_ical("Aula: guionização") == "Aula: guionização"


def test_o_conjunto_do_sms_nao_tem_o_que_o_gsm_nao_tem():
    """
    **O corpo de um SMS tem um conjunto de caracteres proprio** (GSM 03.38), e um
    `{` ou um `^` nao existem nele.

    **O `€` existe**, no GSM estendido, e por isso que o conjunto o inclui — e a
    razao de o conjunto nao poder ser "tudo o que e' imprimivel em ISO-8859-1".
    """
    for fora in "{", "}", "[", "]", "~", "^", "|", "ã":
        assert not is_sms_safe(fora), f"o {fora!r} devia estar fora do GSM 03.38"

    # E o que esta dentro, para o conjunto nao poder encolher sem dar conta.
    # **`$` e' do GSM base e `€` e' do estendido** — os dois casos que provam
    # que o conjunto nao e' nem "o que se imprime" nem "o que e' ASCII".
    # A primeira versao punha o `$` na lista de fora, e ele esta dentro.
    assert is_sms_safe("$")
    assert is_sms_safe("30 " + chr(0x20AC))
    # **O `€` e' o caso que prova que o conjunto nao e' "o que se imprime":**
    # existe no GSM **estendido**, e a primeira versao deste teste punha-o na
    # lista de fora — que e' a opcao mais obvia e a errada.
    #
    # **O `Chego às 18h` e' o exemplo do que esta FORA**, e nao dentro: o `ã` nao
    # existe no GSM 03.38. A primeira versao deste teste punha-o na lista do que
    # estava dentro, e a interface recusa essa mensagem — o que e' o
    # comportamento certo, porque um telefone mostraria o `ã` como caracteres
    # estranhos.
    for dentro in "Chego as 18h", "Obrigado! (100%)", "R2-D2", "50% off", "30 €":
        assert is_sms_safe(dentro), f"o {dentro!r} devia estar no GSM 03.38"


def test_vcard_escapa_o_nome_com_barras_e_nao_aspas():
    """
    **A barra do apelido escapa-se uma vez, e as aspas nao se tocam.**

    O vCard escapa `\\`, `;` e `,` — e as aspas nao sao delimitadores de
    valor, sao um caractere normal dentro de um. Escapá-las punha uma barra a
    mais no nome, e o telefone mostrava `"A"` com barras.
    """
    payload = build(
        "vcard",
        {"vcFirstName": 'Ana "A"', "vcLastName": "Silva" + BARRA + "Costa"},
    )

    linhas = payload.split(CRLF)
    fn = next(l for l in linhas if l.startswith("FN:"))
    n = next(l for l in linhas if l.startswith("N:"))

    #
    # **O nome tem UMA barra e o payload tem DUAS** — e a segunda e' o escape.
    # O `escape_ical` duplica a barra porque ela e' o proprio caractere de escape
    # do iCalendar, e um leitor que veja uma barra a mais mostra a barra a mais
    # no documento. A primeira versao deste teste esperava uma no payload.
    assert fn == "FN:" + 'Ana "A" Silva' + BARRA * 2 + "Costa"
    # **As mesmas duas barras no `N`**: e' o mesmo valor, num campo diferente.
    assert n == "N:Silva" + BARRA * 2 + 'Costa;Ana "A";;;'


def test_vcard_escapa_a_organizacao_com_separadores():
    """
    **Uma `ORG` com `;` a mais parte em dois campos**, e o telefone mostra so o
    primeiro — que e' a razao de o `escape_ical` existir.
    """
    payload = build("vcard", {"vcFirstName": "Ana", "vcOrg": "Empresa; Com, Separadores"})
    linhas = payload.split(CRLF)
    org = next(l for l in linhas if l.startswith("ORG:"))

    assert org == "ORG:Empresa" + BARRA + "; Com" + BARRA + ", Separadores"


def test_vcard_morada_a_cidade_e_o_terceiro_campo():
    """
    **A ADR tem sete campos e a cidade e' o terceiro:**
    `caixa;extensao;rua;localidade;regiao;codigo-postal;pais`.

    Com so a cidade, ficam **dois** separadores antes e **tres** depois. A
    primeira versao deste teste escrevia dois antes, o que punha a cidade no campo
    da extensao — e um telefone mostrava "Lisboa" como extensao e a morada em
    branco.
    """
    payload = build("vcard", {"vcFirstName": "Ana", "vcCity": "Lisboa"})
    linhas = payload.split(CRLF)
    adr = next(l for l in linhas if l.startswith("ADR"))

    assert adr == "ADR;TYPE=work:" + ";;" + ";" + "Lisboa" + ";" * 3


def test_vcard_escapa_a_morada_com_separadores():
    """
    **A rua tambem se escapa**, e pelo mesmo motivo da organizacao. Uma rua com
    uma `,` — que e' o caso de "Rua X, 3.º Esq" — parte o campo se nao escapar.
    """
    payload = build(
        "vcard",
        {"vcFirstName": "Ana", "vcStreet": "Rua da Bica 12, 3.º Esq", "vcCity": "Lisboa"},
    )
    linhas = payload.split(CRLF)
    adr = next(l for l in linhas if l.startswith("ADR"))

    assert "Rua da Bica 12" + BARRA + ", 3.º Esq" in adr
    assert adr.endswith("Lisboa" + ";" * 3)
