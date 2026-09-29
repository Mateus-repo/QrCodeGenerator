"""Os dez tipos de transporte na linha de comandos.

    python -m pytest tests/test_cli_tipos.py -q

## O que estes testes apanham e o que nao apanham

Estes sao sobre a **linha de comandos**: as opcoes, a saida e os codigos de
saida. O payload em si e' verificado pelo `paridade-python.mjs`, que o compara
com o navegador byte a byte, e pela spec.

**O que fica por aqui e' o que nao se vê num payload.** Um `--ssid` que
escrevesse `ssid` em vez de `wifiSsid` produz um `WIFI:S:` vazio e responde com
codigo 0 — o ficheiro escreve-se e nao ha erro. Um `--oculta` que nao fosse
caixa de selecao escrevia `H:false;` a uma rede que esta oculta. Um erro de
validacao que saisse com codigo 0 faria um script nao parar.

E a razao de `test_cli_tipos.py` ser um ficheiro a parte: sao testes de uma
superficie diferente, com um ficheiro de especificacao diferente, e um
`test_cli.py` que cresce ate ficar impossivel de ler.
"""

from __future__ import annotations

import io
from contextlib import redirect_stderr, redirect_stdout

import pytest

from cli.qrcli import TIPOS, main
from qrcode_core import CATEGORY_IDS

#: O que cada tipo tem de dar, e o que o comando tem de escrever.
#:
#: **O valor esperado esta aqui e nao num vector da spec**, porque a spec so
#: tem PIX. E a razao de este ficheiro existir: quando `gerar-vectors.py` passar
#: a escrever os dez tipos, estes casos passam a ser vetores e este ficheiro
#: pode ser apagado. Ate la, sao a unica verificacao de que o CLI produz o
#: payload certo.
ESPERADO = {
    "link": ("payload", "link", ["--url", "exemplo.pt"], "https://exemplo.pt"),
    "texto": ("payload", "texto", ["--texto", "Peca 4471"], "Peca 4471"),
    "telefone": (
        "payload",
        "telefone",
        ["--numero", "912 345 678", "--indicativo", "+351"],
        "tel:+351912345678",
    ),
    "localizacao": (
        "payload",
        "localizacao",
        ["--lat", "38.7223", "--lng", "-9.1393"],
        "geo:38.7223,-9.1393",
    ),
}


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = main(list(argv))
    return code, out.getvalue(), err.getvalue()


# --- O comando `tipos` -------------------------------------------------------


def test_tipos_lista_as_onze_categorias():
    """
    **Onze, e nao dez**: o PIX tambem, mesmo tendo comandos proprios.

    A razao de o `tipos` o listar e' que `qrcli tipos` e' a resposta a "o que e'
    que isto faz?", e um `tipo` que o comando nao explica e' um tipo que parece
    nao existir. A linha do PIX diz isso mesmo — que tem comandos proprios — em
    vez de fingir que e' um `--tipo` como os outros.
    """
    code, out, _ = run("tipos")

    assert code == 0
    for categoria in CATEGORY_IDS:
        assert categoria in out, f"o `{categoria}` nao aparece em `qrcli tipos`"


def test_tipos_diz_as_opcoes_de_cada_tipo():
    """
    **A lista de opcoes vem da tabela, nao esta escrita no texto.**

    A primeira versao escrevia a lista a mao dentro do `print` e o `--ssid`
    desaparecia a primeira vez que um campo se juntou ao WiFi. A linha e' a
    mesma em todos os tipos porque a tabela e' a mesma.
    """
    _, out, _ = run("tipos")

    for tipo in TIPOS:
        for campo in TIPOS[tipo]["campos"]:
            assert campo[0] in out, f"a opcao {campo[0]} de {tipo} nao aparece em `tipos`"


# --- O comando `payload` -----------------------------------------------------


@pytest.mark.parametrize("tipo", list(ESPERADO))
def test_payload_da_o_texto_certo(tipo):
    _, _, opcoes, esperado = ESPERADO[tipo]
    code, out, _ = run("payload", tipo, *opcoes)

    assert code == 0, f"`payload {tipo}` devolveu {code}"
    assert out.strip() == esperado


def test_payload_sms_escreve_o_corpo_no_fim():
    """
    **O corpo vai depois dos dois pontos, e os dois pontos do numero vem primeiro.**

    Um corpo com `:` parte a mensagem nos leitores que tratam o primeiro `:` como
    separador, e por isso que a validacao recusa os caracteres que fariam isso.
    """
    code, out, _ = run(
        "payload", "sms",
        "--numero", "912345678", "--indicativo", "+351", "--mensagem", "Chego as 18h",
    )

    assert code == 0
    assert out.strip() == "SMSTO:+351912345678:Chego as 18h"


def test_payload_whatsapp_tira_o_espaco_do_numero():
    """
    **O `wa.me` so aceita digitos**, e um `+351 912` dava um link que nao abre.
    """
    code, out, _ = run(
        "payload", "whatsapp", "--numero", "912 345 678", "--indicativo", "+351",
    )

    assert code == 0
    assert out.strip() == "https://wa.me/351912345678"


def test_payload_wifi_escreve_a_palavra_secreta_e_o_terminador():
    code, out, _ = run("payload", "wifi", "--ssid", "Rede Casa", "--senha", "segredo123")

    assert code == 0
    assert out.strip() == "WIFI:T:WPA;S:Rede Casa;P:segredo123;;"


def test_payload_wifi_oculta_e_uma_caixa_de_selecao():
    """
    **A caixa de selecao vale o que o `--oculta` traz, e nao o texto.**

    `--oculta sim` nao e' o que se escreve: o `argparse` com
    `action="store_true"` liga a flag com o valor `True` e nao sabe o que fazer
    com um argumento a seguir — e da `--oculta` como opcao obrigatoria. A
    primeira versao da tabela escrevia `H:` com o valor em texto e a rede ficava
    sempre visivel.
    """
    code, out, _ = run("payload", "wifi", "--ssid", "Rede", "--senha", "p", "--oculta")

    assert code == 0
    assert "H:true;" in out

    # E sem a flag nao ha `H:` — a rede e' visivel.
    _, sem, _ = run("payload", "wifi", "--ssid", "Rede", "--senha", "p")
    assert "H:" not in sem


def test_payload_wifi_aberta_nao_lem_a_password():
    """
    **Uma rede aberta nao tem `P:`, e o `--senha` nem chega a ser lido** — a
    validacao recusa antes, e quem automate o CLI ve a mesma coisa que quem usa
    a interface.
    """
    code, out, _ = run("payload", "wifi", "--ssid", "Rede", "--seguranca", "Aberto")

    assert code == 0
    assert out.strip() == "WIFI:T:nopass;S:Rede;;"
    assert "P:" not in out


def test_payload_wifi_sem_password_da_o_erro_da_validacao():
    """**Uma rede fechada sem `--senha` e' um erro, e nao um `P:` vazio.**"""
    code, out, err = run("payload", "wifi", "--ssid", "Rede")

    assert code == 1
    assert out == ""
    assert "Indica a password da rede." in err


def test_payload_vcard_tem_a_familia_primeiro():
    """
    **O `N` e' `familia;nome;...`, e um `N` ao contrario dava um telefone que
    mostra "Silva, Ana" como "Ana Silva".** So se nota quando se usa, e por isso
    que este teste existe.
    """
    code, out, _ = run("payload", "vcard", "--nome", "Ana", "--apelido", "Silva")

    assert code == 0
    assert "N:Silva;Ana;;;" in out
    assert "FN:Ana Silva" in out


def test_payload_vcard_escapa_a_organizacao():
    """
    **Uma `ORG` com `;` a mais parte em dois campos**, e o telefone mostra so o
    primeiro — que e' a razao de o escape existir.
    """
    code, out, _ = run(
        "payload", "vcard", "--nome", "Ana", "--empresa", "Empresa; Com, Separadores",
    )

    assert code == 0
    assert "ORG:Empresa" + chr(92) + "; Com" + chr(92) + ", Separadores" in out


def test_payload_escreve_png(tmp_path):
    destino = tmp_path / "link.png"
    code, _, _ = run("payload", "link", "--url", "exemplo.pt", "-o", str(destino))

    assert code == 0
    assert destino.read_bytes().startswith(b"\x89PNG")


def test_payload_escreve_svg(tmp_path):
    destino = tmp_path / "link.svg"
    code, _, _ = run(
        "payload", "link", "--url", "exemplo.pt", "--format", "svg", "-o", str(destino),
    )

    assert code == 0
    assert b"<svg" in destino.read_bytes()[:400]


# --- A saida a errar ----------------------------------------------------------


def test_erro_de_validacao_sai_com_codigo_1_e_a_mensagem_certa():
    """
    **A mensagem e' a mesma que a interface mostra.**

    E a razao de o CLI chamar `validate` e nao construir o payload e apanhar a
    excepcao: sao dois sítios com mensagens escritas duas vezes, e a segunda
    escrita divergiria sem dar conta. O codigo 1 e' o que faz um script parar.
    """
    code, out, err = run("payload", "link")

    assert code == 1
    assert out == ""
    assert "Indica um link." in err


def test_esquema_perigoso_diz_nao_permitido_e_nao_nao_suportado():
    """
    **A ordem das mensagens importa, e o CLI tem de a respeitar.**

    `javascript:` tem de dar "nao e' permitido", e nao "nao suportado" — que e'
    mais Complicado e menos util, porque a segunda parece um bug e a primeira e'
    uma decisao.
    """
    code, _, err = run("payload", "link", "--url", "javascript:alert(1)")

    assert code == 1
    assert "nao e' permitido" in err
    assert "nao suportado" not in err


def test_esquema_nao_suportado_diz_o_que_usar():
    code, _, err = run("payload", "link", "--url", "ftp://exemplo.pt")

    assert code == 1
    assert "nao suportado" in err
    # A mensagem diz o que usar, e nao so o que nao da para usar.
    assert "https:" in err


def test_o_erro_do_link_nao_diz_que_e_um_erro_de_pix():
    """
    **Um `UrlError` apanhado pelo `except` do PIX dava "erro de PIX" a quem so
    escreveu um link.** O `except` do `PixError` vem primeiro na lista, e sem o
    `except` do `UrlError` era esse que apanhava.
    """
    code, _, err = run("payload", "link", "--url", "")

    assert code == 1
    assert "PIX" not in err
