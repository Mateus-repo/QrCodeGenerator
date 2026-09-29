"""Os 10 tipos de payload, e o que cada um tem de ser.

    python -m pytest tests -q

Estes testes **nao substituem** o `paridade-python.mjs`, que compara o Python com
o web byte a byte. Estes sao sobre o que cada tipo **tem de ser**, e o outro e'
sobre a igualdade.

E os escapes de barras, de `;` e de `,` estao em `test_escapes.py`: eles
dependem de tres contas ao mesmo tempo — quantas barras o Python le de um
literal, quantas o `escape_ical` escreve e quantas um leitor de iCalendar
interpreta — e a conta e' facil de errar de tres maneiras.

A distincao importa porque apanham coisas diferentes:

  - estes apanham um payload **que esta errado nos dois** — o vCard sem `N`, o
    iCal com LF em vez de CRLF;
  - o outro apanha um payload **que esta certo num e errado no outro**, que e'
    o que a `AGENTS.md` chama de bug de paridade, e que nenhum teste de
    estrutura apanha.

E' a razao de os testes de escaping serem de **casos com o separador dentro** e
nao de um caso limpo: um `;` a mais num vCard produz um payload que continua a
ser um vCard, e so um telefone diz que o nome do contacto truncou.

A regra do `AGENTS.md` que isto cumpre
--------------------------------------

**Um payload que sai diferente num cliente e um bug, mesmo que o teste desse
cliente passe.** E o sim: os testes deste ficheiro passariam se os dois lados
tivessem o mesmo escape errado. Por isso o `paridade-python.mjs` existe, e por
isso que a correccao de um `;` para `,` se viu la e nao aqui.
"""

from __future__ import annotations

import pytest

from qrcode_core.tipos import (
    ALLOWED_SCHEMES,
    DANGEROUS_SCHEMES,
    ICAL_NEWLINE,
    UrlError,
    build,
    clean,
    digits_only,
    escape_ical,
    escape_wifi,
    is_sms_safe,
    normalize_url,
    parse_coord,
    phone,
    phone_prefix,
    to_ascii,
    url_encode,
)
from qrcode_core.validacao import validate

# --- Normalizacao de texto --------------------------------------------------


def test_to_ascii_tira_acentos_e_mantem_as_letras():
    """
    **O NFD separa a letra base do acento, e a letra fica.**

    E' a razao de o `unicodedata.normalize("NFD")` vir **antes** da remocao dos
    caracteres nao-ASCII: sem o NFD, o `ç` ja vem decomposto e da para tirar o
    acento; com o NFD primeiro, o que fica e' a letra base, que e' o que se
    quer.
    """
    assert to_ascii("Peça-francesa") == "Peca-francesa"
    assert to_ascii("cœur") == "coeur"
    assert to_ascii("São Paulo") == "Sao Paulo"
    assert to_ascii("áéíóúâê") == "aeiouae"


def test_to_ascii_sem_collapse_preserva_os_espacos():
    """
    **O PIX precisa dos espacos tal como estao**, porque mexer neles muda o
    comprimento declarado e o leitor recusa. E' o unico sitio onde a opcao
    `collapse=False` e' usada, e por isso que a opcao existe.
    """
    assert to_ascii("  Ana   Silva  ", collapse=False) == "  Ana   Silva  "
    assert to_ascii("  Ana   Silva  ") == "Ana Silva"
    assert to_ascii(None) == ""


def test_clean_corta_ao_limite_sem_deixar_espaco_no_fim():
    """
    **Cortar pela metade uma palavra e' o que a norma permite**, e cortar e
    deixar um espaco no fim e' o que a faz o leitor recusar.
    """
    assert clean("Ana Maria Silva", 25) == "Ana Maria Silva"
    # 25 caracteres, e o 26 e' um espaco.
    assert clean("Ana Maria Silva e mais", 14) == "Ana Maria Silv"
    assert not clean("Ana Maria Silva e mais", 14).endswith(" ")


def test_escape_ical_escapa_os_quatro_separadores():
    """
    **A ordem das substituicoes conta**, e por isso que isto e' uma funcao e nao
    tres linhas soltas. Escapar a barra antes do ponto-e-virgula punha duas barras
    em cada separador, e o telefone lia o campo inteiro como um so.
    """
    assert escape_ical("a;b") == "a\\;b"
    assert escape_ical("a,b") == "a\\,b"
    assert escape_ical("a\\b") == "a\\\\b"
    assert escape_ical("a\nb") == "a\\nb"
    assert escape_ical("a\r\nb") == "a\\nb"
    assert escape_ical("") == ""

    # **O `:` nao se escapa, e isso e' correcto.** No iCalendar so `;`, `,`, a
    # barra e a quebra de linha separam; o `:` e' o separador entre o nome da
    # propriedade e o valor, e escapar-lo punha uma barra a mais num campo cujo
    # nome ja tem dois pontos. A primeira versao deste teste esperava
    # `Aula\: guionizacao` e deu `Aula: guionizacao`, que e' a resposta certa.
    assert escape_ical("Aula: guionização") == "Aula: guionização"


def test_escape_wifi_escapa_os_cinco_caracteres_do_formato():
    """O formato WiFi separa por `\\`, `;`, `,`, `:` e `"`."""
    assert escape_wifi('a;b,c:d"e\\f') == "a\\;b\\,c\\:d\\\"e\\\\f"
    assert escape_wifi("") == ""


def test_url_encode_da_espaco_por_pretendido_e_nao_mais():
    """
    **O `+` e' espaco em `x-www-form-urlencoded` mas nao num QR.**

    E o que o `encodeURIComponent` do navegador da, e o que o `quote` do Python
    tambem da com `safe=""`. Um assunto com um espaco que chegue ao telefone com
    `+` mostra o `+` no assunto.
    """
    assert url_encode("olá mundo") == "ol%C3%A1%20mundo"
    assert "+" not in url_encode("olá mundo")
    assert url_encode("") == ""


def test_digits_only_tira_tudo_o_que_nao_e_digito():
    assert digits_only("912 345 678") == "912345678"
    assert digits_only("+351-912") == "351912"
    assert digits_only("") == ""


# --- Telefone e URL ---------------------------------------------------------


def test_phone_prefix_normaliza_o_00():
    """
    **O `00` e' reconhecido em qualquer posicao**, e nao so no inicio. Sem isso
    o mesmo numero dava resultados diferentes conforme a maneira como era
    colado.
    """
    assert phone_prefix("00 351") == "+351"
    assert phone_prefix("00351") == "+351"
    assert phone_prefix("+351") == "+351"
    assert phone_prefix("351") == "+351"
    assert phone_prefix("") == ""


def test_phone_prefix_ignora_o_que_nao_e_digito():
    assert phone_prefix("+35 (1) 2") == "+3512"
    assert phone_prefix("abc") == ""


def test_phone_junta_o_indicativo_ao_numeros():
    assert phone("+351", "912 345 678") == "+351912345678"


def test_normalize_url_acrescenta_o_https():
    assert normalize_url("exemplo.pt") == "https://exemplo.pt"
    assert normalize_url("  exemplo.pt  ") == "https://exemplo.pt"
    assert normalize_url("https://exemplo.pt") == "https://exemplo.pt"


def test_normalize_url_recusa_os_esquemas_perigosos():
    """
    **Os perigosos sao recusados ANTES dos nao suportados**, e a ordem importa: um
    `javascript:` tem de dar a mensagem de "nao permitido" e nao a de "nao
    suportado", que e' mais Compos e menos uti.
    """
    for esquema in DANGEROUS_SCHEMES:
        with pytest.raises(UrlError) as erro:
            normalize_url(f"{esquema}:payload")
        assert "nao e' permitido" in str(erro.value)


def test_normalize_url_recusa_o_que_nao_suporta():
    with pytest.raises(UrlError) as erro:
        normalize_url("ftp://exemplo.pt")
    assert "nao suportado" in str(erro.value)


def test_normalize_url_aceita_os_permitidos():
    for esquema in ALLOWED_SCHEMES:
        assert normalize_url(f"{esquema}:algo") == f"{esquema}:algo"


def test_normalize_url_da_link_vazio():
    with pytest.raises(UrlError):
        normalize_url("")
    with pytest.raises(UrlError):
        normalize_url(None)


# --- SMS --------------------------------------------------------------------


def test_parse_coord_aceita_virgula_ou_ponto():
    assert parse_coord("38.7223") == pytest.approx(38.7223)
    assert parse_coord("38,7223") == pytest.approx(38.7223)
    assert parse_coord("") is None
    assert parse_coord("abc") is None
    assert parse_coord(None) is None


# --- Os payloads ------------------------------------------------------------


def test_link_sem_esquema_ganha_https():
    assert build("link", {"url": "exemplo.pt"}) == "https://exemplo.pt"


def test_texto_apara_os_espacos():
    assert build("texto", {"texto": "  Peca 4471  "}) == "Peca 4471"


def test_email_sem_assunto_nao_tem_interrogacao():
    """
    **Um `mailto:` com um `?` e nada depois abre um cliente de email com uma
    pergunta malformada**, e por isso que a interrogacao so aparece com campos.
    """
    assert build("email", {"mailTo": "ana@exemplo.pt"}) == "mailto:ana@exemplo.pt"


def test_email_com_assunto_usa_porcentagem_e_nao_mais():
    payload = build(
        "email",
        {"mailTo": "ana@exemplo.pt", "mailSubject": "olá mundo"},
    )
    assert payload == "mailto:ana@exemplo.pt?subject=ol%C3%A1%20mundo"
    assert "+" not in payload


def test_telefone_tem_o_indicativo():
    assert build("telefone", {"phonePrefix": "+351", "phoneNumber": "912 345 678"}) == "tel:+351912345678"


def test_sms_tem_os_dois_pontos_e_o_corpo_no_fim():
    """
    **O corpo do SMSTO vai ate ao fim da cadeia**, e por isso que um `:` no
    corpo parte a mensagem em readers que tratam o primeiro `:` como separador
    do corpo — e a validacao recusa caracteres que fariam isso.
    """
    payload = build(
        "sms",
        {"phonePrefix": "+351", "phoneNumber": "912345678", "smsMessage": "Chego 18h"},
    )
    assert payload == "SMSTO:+351912345678:Chego 18h"


def test_whatsapp_so_com_numeros_e_nao_com_mais():
    """
    **O `wa.me` so aceita digitos**, e um `+351 912` dava um link que nao abre.
    """
    payload = build("whatsapp", {"phonePrefix": "+351", "phoneNumber": "912 345 678"})
    assert payload == "https://wa.me/351912345678"
    assert " " not in payload


def test_evento_usa_crlf_e_nao_lf():
    """
    **O fim de linha do iCalendar tem de ser CRLF**, a pedir da RFC 5545.

    Um LF simples e' aceite pela maioria dos leitores e recusado por alguns, e o
    sintoma e' um evento que nao aparece no calendario de uma pessoa e aparece no
    de outra.
    """
    payload = build(
        "evento",
        {"eventTitle": "Aula", "eventStart": "2026-09-29T18:30", "eventEnd": "2026-09-29T20:30"},
    )
    assert "\\r\\n" in payload.replace("\r", "\\r").replace("\n", "\\n")
    assert "\r\n" in payload
    assert payload.startswith("BEGIN:VCALENDAR\r\n")
    assert payload.endswith("END:VCALENDAR\r\n")


def test_evento_saida_com_a_hora_que_estava_no_campo():
    """
    **A hora sai como estava no campo, sem fuso.**

    O `datetime-local` da interface nao tem fuso, e quem escreve 18:30 esta a
    dizer "as 18h30 aqui". Uma versao anterior passava por `datetime` — que
    assume hora local — e lia os campos em UTC, o que dava **uma hora de
    diferenca** com um `Z` a dizer que nao.
    """
    payload = build(
        "evento",
        {"eventTitle": "Aula", "eventStart": "2026-09-29T18:30", "eventEnd": "2026-09-29T20:30"},
    )
    assert "DTSTART:20260929T183000" in payload
    assert "DTEND:20260929T203000" in payload
    # Sem fuso: um horario flutuante e' o que o calendario de cada pessoa le na
    # hora de cada pessoa.
    assert "DTSTART:20260929T183000Z" not in payload


def test_evento_escapa_o_titulo():
    """
    **Um `;` no titulo sem escape acaba o SUMMARY no sitio errado** e o evento
    fica sem titulo no calendario — e o payload continua a ser um iCalendar valido
    para qualquer validador.
    """
    payload = build(
        "evento",
        {"eventTitle": "Aula: guionização, nível 2", "eventStart": "2026-01-01T09:00"},
    )
    # A virgula escapa-se; o `:` nao, porque so `;`, `,`, barra e quebra de
    # linha separam no iCalendar.
    assert "SUMMARY:Aula: guionização\\, nível 2" in payload


def test_localizacao_arredonda_e_tira_o_zero_final():
    """
    **O arredondamento e' a sete casas**, a pedir do que um mapa le, e o zero a
    final do `toFixed` sai porque `geo:38.7223000,` e' ruido.
    """
    assert build("localizacao", {"geoLat": "38.7223", "geoLng": "-9.1393"}) == "geo:38.7223,-9.1393"
    assert (
        build("localizacao", {"geoLat": "38.722312345678", "geoLng": "-9.139312345678"})
        == "geo:38.7223123,-9.1393123"
    )


def test_localizacao_aceita_virgula_decimal():
    assert build("localizacao", {"geoLat": "38,7223", "geoLng": "-9,1393"}) == "geo:38.7223,-9.1393"


def test_wifi_terminador_vazio_e_obrigatorio():
    """
    **O terminador `;;` final e' obrigatorio** e um leitor que o exija recusa o
    codigo sem ele. E' a razao de o `build` acrescentar um `;` a mais no fim.
    """
    payload = build("wifi", {"wifiSsid": "Rede", "wifiSec": "WPA/WPA2", "wifiPass": "p"})
    assert payload == "WIFI:T:WPA;S:Rede;P:p;;"


def test_wifi_aberta_nao_tem_password():
    """Uma rede aberta nao tem `P:`, e um `P:;` vazio e' pior do que nao ter."""
    payload = build("wifi", {"wifiSsid": "Rede", "wifiSec": "Aberto"})
    assert payload == "WIFI:T:nopass;S:Rede;;"
    assert "P:" not in payload


def test_wifi_oculta_leva_o_H():
    """`H:true` e' a rede oculta, e so aparece quando a caixa esta marcada."""
    payload = build("wifi", {"wifiSsid": "Rede", "wifiSec": "Aberto", "wifiHidden": True})
    assert "H:true;" in payload


def test_wifi_escapa_o_ssid():
    """
    **Um `;` no SSID sem escape faz o `P:` seguinte ser lido como parte do
    nome da rede** — e o telefone liga a uma rede que nao existe.
    """
    payload = build(
        "wifi",
        {"wifiSsid": "Rede; Com, Separadores", "wifiSec": "WPA/WPA2", "wifiPass": "p"},
    )
    assert "S:Rede\\; Com\\, Separadores;" in payload


def test_vcard_tem_a_familia_primeiro_no_N():
    """
    **O `N` e' `familia;nome;extra;prefixo;sufixo`**, a pedir da RFC 6350, e um
    `N` com o nome primeiro da um telefone que mostra "Silva, Ana" como
    "Ana Silva". A diferenca so se nota quando se usa.
    """
    payload = build("vcard", {"vcFirstName": "Ana", "vcLastName": "Silva"})
    assert "N:Silva;Ana;;;" in payload
    assert "FN:Ana Silva" in payload


def test_vcard_escapa_a_organizacao():
    """Uma `ORG` com `;` a mais parte em dois campos, e o telefone mostra so o primeiro."""
    payload = build("vcard", {"vcFirstName": "Ana", "vcOrg": "Empresa; Com, Separadores"})
    assert "ORG:Empresa\\; Com\\, Separadores" in payload


# --- Validacao --------------------------------------------------------------


def test_validar_mensagens_para_o_que_falta():
    """
    **A mensagem e' o que a pessoa ve no ecra**, e por isso que cada uma das
    palavras de "indica" importa: um "o campo esta vazio" nao diz o que fazer.
    """
    assert validate("link", {}) == "Indica um link."
    assert validate("texto", {}) == "Escreve algum texto."
    assert validate("email", {}) == "Indica o destinatario do email."
    assert validate("telefone", {"phoneNumber": ""}) == "Indica o numero de telefone."
    assert validate("evento", {}) == "Indica o titulo do evento."
    assert validate("localizacao", {}) == "Indica uma latitude valida (ex.: 38.7223)."
    assert validate("wifi", {}) == "Indica o nome da rede (SSID)."
    assert validate("vcard", {}) == "Preenche pelo menos um campo do contacto."


def test_validar_da_none_quando_tudo_bem():
    assert validate("link", {"url": "exemplo.pt"}) is None
    assert validate("texto", {"texto": "olá"}) is None
    assert validate("email", {"mailTo": "ana@exemplo.pt"}) is None
    assert validate("telefone", {"phonePrefix": "+351", "phoneNumber": "912345678"}) is None
    assert validate("vcard", {"vcFirstName": "Ana"}) is None
    assert validate("localizacao", {"geoLat": "38.7", "geoLng": "-9.1"}) is None
    assert validate("wifi", {"wifiSsid": "Rede", "wifiSec": "WPA/WPA2", "wifiPass": "p"}) is None


def test_validar_localizacao_distingue_texto_de_intervalo():
    """
    **Um valor que nao e' um numero nao tem intervalo**, e a mensagem tem de
    dizer isso. A primeira versao validava o intervalo primeiro e dava "a
    latitude tem de estar entre -90 e 90" para o texto `abc` — que e' uma
    mensagem **falsa**, porque o problema nao e' o intervalo.
    """
    assert validate("localizacao", {"geoLat": "abc", "geoLng": "-9.1"}) == (
        "Indica uma latitude valida (ex.: 38.7223)."
    )
    assert validate("localizacao", {"geoLat": "91", "geoLng": "-9.1"}) == (
        "A latitude tem de estar entre -90 e 90."
    )
    assert validate("localizacao", {"geoLat": "38.7", "geoLng": "181"}) == (
        "A longitude tem de estar entre -180 e 180."
    )


def test_validar_recusa_a_password_de_wifi_em_rede_aberta_nao_a_exige():
    """Uma rede aberta nao tem password, e pedir uma seria absurdo."""
    assert validate("wifi", {"wifiSsid": "Rede", "wifiSec": "Aberto"}) is None
    assert validate("wifi", {"wifiSsid": "Rede", "wifiSec": "WPA/WPA2"}) == "Indica a password da rede."


def test_validar_evento_recusa_o_fim_antes_do_inicio():
    assert validate(
        "evento",
        {"eventTitle": "A", "eventStart": "2026-09-29T20:00", "eventEnd": "2026-09-29T18:00"},
    ) == "A data de fim nao pode ser anterior a de inicio."


def test_categoria_desconhecida_da_mensagem_e_nao_uma_excepcao():
    """
    **Um `KeyError` da parte de quem chama nao ajuda ninguem.** A interface
    mostra a mensagem, e por isso que a funcao devolve texto e nao levanta.
    """
    assert validate("categoria-que-nao-existe", {}) == "Categoria desconhecida."
    with pytest.raises(ValueError):
        build("categoria-que-nao-existe", {})
