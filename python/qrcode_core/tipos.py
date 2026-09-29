"""
Os 10 tipos de payload que nao sao PIX.

Espelha `web/payloads/types.js` e `web/payloads/normalize.js` linha a linha, e
o `AGENTS.md` e' claro sobre a razao: **a spec e' o arbrito, e nao qualquer
uma das implementacoes.** Quando estas duas divergirem, o que esta errado e' o
que nao bate com a spec — e `spec/vectors.json` e' o que diz qual e' a spec.

## O que estes tipos NAO sao

**Nao sao conformidade, sao transporte.** Um link e' um link, um contacto e' um
contacto: o formato nao impoe nada sobre o conteudo, e qualquer leitor abre o
que o payload mandar. A diferenca entre esta implementacao e a do navegador esta
no que o **leitor** faz, e por isso que o unico teste que importa e' o ZXing
ler a imagem e devolver a mesma string.

## Porque Python e' a implementacao de referencia

Porque e' a que a spec e' gerada: `spec/gerar-vectors.py` importa este modulo e
escreve os vectores que as outras stacks tem de bater. Uma divergencia aqui
aparece no `vectors.json`, e uma divergencia la aparece em tres stacks de uma
vez. **Por isso a ordem de escrever e' Python primeiro e a spec depois**, e nao
ao contrario.

## A parte que nao se deduz

O `escapeICal` e' o que distingue um vCard que um telefone abre de um vCard que
nao abre. Um `;` a mais ou a menos e' a diferenca entre "o contacto tem um
cargo" e "o telefone mostra o contacto inteiro como um campo so". E a mesma
regra de iCalendar, e **nao ha teste estrutural que apanhe um escape trocado** —
o payload continua a parecer um vCard.

E a **ordem dos campos** do vCard, que segue a RFC 6350: `FN` antes de `N`, e
`N` com a familia primeiro. Um `N` com o nome primeiro da um telefone que mostra
"Silva, Ana" como "Ana Silva", e so se nota quando se usa.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

# --- Normalizacao (espelha `web/payloads/text.js`) ---------------------------

#: Caracteres nao-espacadores, os que o NFD separa da letra base.
#:
#: O intervalo e' o `Mn` do Unicode, e nao `M` todo: um `Mc` (a haste de um acento
#: circunflexo numa letra hebraica) **desaparece** se for retirado, e o
#: circunflexo vai com a letra. Em portugues nao ha Mc, e o intervalo e' o certo
#: para o caso.
NON_SPACING_MARK = re.compile(r"[̀-ͯ]")

#: As ligaduras que nao tem decomposicao de compatibilidade.
#:
#: **`œ` e `Œ` sao o caso, e o NFD nao os decompoe** — ao contrario do `ç`, que
#: ja vem `c` + cedilha. O NFD do `cœur` da `c`, `0x153` e `r`, e o `0x153` e' o
#: *modifier letter small oe*: nao e' uma marca nao-espacadora, por isso que o
#: `NON_SPACING_MARK` nao o apanha e ele sobrevive a remocao dos nao-ASCII.
#:
#: O resultado era `cur` em vez de `coeur`, e `manur` em vez de `manoeuvre`.
#: **Um nome com ligadura e' courant em frances e esta em Portugal**, e um QR que
#: le `cur` mostra o nome errado na etiqueta — e o nome errado e' o que a pessoa
#: vai ler no documento.
#:
#: A ligadura e' um caracter **unico** e nao dois, por isso que a substituicao
#: tem de ser por texto e nao por remocao: `NFKD` resolveria, mas tambem
#: decompunha coisas que nao queremos (o `№` viraria `No`).
LIGADURAS = {
    "œ": "oe",  # oe com ligadura
    "Œ": "OE",  # OE com ligadura
    "æ": "ae",  # ae com ligadura
    "Æ": "AE",  # AE com ligadura
    "ĳ": "ij",  # ij com ligadura
    "Ĳ": "IJ",  # IJ com ligadura
    "ǳ": "dz",  # dz com ligadura
    "ǲ": "Dz",  # Dz com ligadura
    "Ǳ": "DZ",  # DZ com ligadura
    "ǉ": "lj",  # lj com ligadura
    "ǈ": "Lj",  # Lj com ligadura
    "Ǌ": "LJ",  # LJ com ligadura
    "ǌ": "nj",  # nj com ligadura
    "ǋ": "Nj",  # Nj com ligadura
    "Ǎ": "Nj",  # Nj com ligadura
    "ŉ": "ʼn",  # n com apostrofoModifier
    "ſ": "s",  # s longo
}

#: Qualquer coisa fora do Latin-1 imprimivel.
FORA_ASCII = re.compile(r"[^\x00-\x7F]")


def to_ascii(value: str | None, collapse: bool = True) -> str:
    """Para ASCII, sem acentos, sem caracteres de controlo e sem espacos a mais.

    ``collapse=False`` preserva os espacos tal como estao — e' o que o leitor de
    PIX precisa, para nao mexer nos comprimentos declarados.
    """
    if value is None:
        return ""

    normalizado = unicodedata.normalize("NFD", str(value))
    # O NFD separa a letra base do acento combinante; tira o combinante.
    normalizado = NON_SPACING_MARK.sub("", normalizado)

    # **As ligaduras antes da remocao dos nao-ASCII.** Ao contrario do `ç`, o `œ`
    # nao e' um acento — e' um caracter unico, e por isso que a remocao de
    # nao-ASCII o apagaria em vez de o decompor. Trocar antes de o deitar fora
    # e' a unica ordem que da `coeur` em vez de `cur`.
    for ligadura, letras in LIGADURAS.items():
        normalizado = normalizado.replace(ligadura, letras)

    ascii_ = FORA_ASCII.sub("", normalizado)

    if not collapse:
        return ascii_

    return re.sub(r"\s+", " ", ascii_.strip())


def clean(value: str | None, max_length: int) -> str:
    """Normaliza, colapsa espacos e corta ao limite indicado."""
    ascii_ = to_ascii(value)
    return ascii_ if len(ascii_) <= max_length else ascii_[:max_length].strip()


def escape_ical(value: str | None) -> str:
    """Escapa texto de iCalendar / vCard: ``\\``, ``;``, ``,`` e quebras de linha.

    **A ordem das substituições conta, e por isso que e' uma funcao e nao tres
    linhas soltas.** Escapar o ``;`` antes do ``\\`` punha duas barras em cada
    separador, e o telefone lia o campo inteiro como um so.
    """
    if not value:
        return ""

    texto = str(value)
    texto = texto.replace("\\", "\\\\")
    texto = texto.replace(";", "\\;")
    texto = texto.replace(",", "\\,")

    #
    # **A quebra de linha vira `\\n` de duas partes, e a substituicao e' uma
    # FUNCAO.**
    #
    # `re.sub` processa escapes na **cadeia de substituicao** como processa na
    # expressao — e `chr(92) + "n"` nao engana: o `re.sub` ve a barra e
    # transforma-a. O resultado era `a<LF>b` em vez de `a\nb`, e um `.ics` com
    # uma quebra a mais parte-se em duas linhas, e o telefone le so a primeira.
    #
    # **Passar uma funcao desliga as substituicoes todas**: o valor devolvido
    # entra literal. E a mesma correccao do `bundle.mjs`, onde um `$` numa
    # cadeia de substituicao do `String.replace` punha o `</body>` do HTML no
    # meio do JavaScript — o mesmo mecanismo, em dois sitios.
    #
    # E **nao** se usa `str.replace`, que da o mesmo resultado errado: o metodo
    # da `str` **tambem** processa escapes na substituicao, e so o `re.sub` com
    # funcao e o `replace` com funcao sao literais.
    return re.sub(r"\r\n|\r|\n", lambda _m: chr(92) + "n", texto)


def escape_wifi(value: str | None) -> str:
    """Escapa um valor WiFi: ``\\``, ``;``, ``,``, ``:`` e ``"``."""
    if not value:
        return ""
    return re.sub(r'([\\;,:"])', r"\\\1", str(value))


def url_encode(value: str | None) -> str:
    """Percent-encoding para query strings.

    **Da ``%20`` e nunca ``+``**, como o `encodeURIComponent` do navegador. O
    ``+`` e' espaco em ``application/x-www-form-urlencoded`` mas nao num QR, e um
    leitor que decodifique com a regra errada transforma os espacos do assunto de
    um email em ``+``.
    """
    if not value:
        return ""
    return quote(str(value), safe="")


def digits_only(value: str | None) -> str:
    """So digitos."""
    return re.sub(r"\D", "", str(value or ""))


# --- Normalizacao de telefone e URL (espelha `normalize.js`) -----------------

SCHEME_AT_START = re.compile(r"^([A-Za-z][A-Za-z0-9+.-]*):")

ALLOWED_SCHEMES = ["http", "https", "mailto", "tel", "sms", "geo", "wifi"]
DANGEROUS_SCHEMES = ["javascript", "data", "file", "vbscript", "about", "blob"]


def phone_prefix(raw: str | None) -> str:
    """Normaliza o indicativo de pais: ``00`` ou ``351`` -> ``+351``.

    **O ``00`` e' reconhecido em qualquer posicao,** e nao so no inicio. A
    primeira versao so o convertia no inicio, e o mesmo numero dava resultados
    diferentes conforme a maneira como era colado — que e' a razao de o `t`
    stripado ser reescrito.
    """
    p = to_ascii(raw).strip()
    if not p:
        return ""

    if p.startswith("00"):
        p = "+" + p[2:]
    elif not p.startswith("+"):
        p = "+" + p

    depois_do_mais = p[p.index("+") + 1 :]
    so_digitos = digits_only(depois_do_mais)
    if not so_digitos:
        return ""

    return "+" + so_digitos if "+" in p else so_digitos


def phone(prefix: str | None, number: str | None) -> str:
    """Numero de telefone so com digitos, ja com o indicativo."""
    return phone_prefix(prefix) + digits_only(number)


class UrlError(ValueError):
    """O link nao pode ir para um QR code."""


def normalize_url(raw: str | None) -> str:
    """Acrescenta o esquema em falta e recusa os que possam executar codigo.

    **Os esquemas perigosos sao recusados antes dos nao suportados**, e a ordem
    importa: um ``javascript:`` tem de dar a mensagem de "nao permitido" e nao
    a de "nao suportado". A segunda e' mais Compos e menos uti.
    """
    url = str(raw or "").strip()

    if not url:
        raise UrlError("Indica um link.")

    achado = SCHEME_AT_START.match(url)
    if not achado:
        return "https://" + url

    scheme = achado.group(1).lower()

    if scheme in DANGEROUS_SCHEMES:
        raise UrlError(f"O esquema '{scheme}:' nao e' permitido num QR code.")

    if scheme not in ALLOWED_SCHEMES:
        lista = ", ".join(s + ":" for s in ALLOWED_SCHEMES)
        raise UrlError(f"Esquema '{scheme}:' nao suportado. Usa {lista}.")

    return url


# --- Construcao --------------------------------------------------------------

#: O fim de linha do iCalendar, que **tem de ser CRLF**.
#:
#: Um LF simples e' aceite pela maioria dos leitores e recusado por alguns, e o
#: sintoma e' um evento que nao aparece no calendario de uma pessoa e aparece no
#: de outra. A RFC 5545 e' explicita.
ICAL_NEWLINE = "\r\n"

#: Os caracteres que o corpo de um SMS aceita (GSM 03.38 e extensoes).
SMS_SAFE = set(
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    " -.,!?()'*+/:&%£$€¥=#@\"_<>;"
)


def is_sms_safe(message: str | None) -> bool:
    """O corpo aceita o conjunto de caracteres de um SMS?"""
    return all(ch in SMS_SAFE for ch in str(message or ""))


def parse_coord(value: str | float | None) -> float | None:
    """Coordenada do formulario, com virgula ou ponto decimal."""
    s = str(value if value is not None else "").strip().replace(",", ".")
    if not s:
        return None
    try:
        n = float(s)
    except ValueError:
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


def _round7(value: float) -> str:
    """Sete casas, e sem notacao cientifica."""
    return f"{value:.7f}".rstrip("0").rstrip(".") or "0"


def _stamp_ical(value: str | None) -> str:
    """A hora de um campo ``datetime-local``, **sem conversao**.

    **A razao de nao passar por ``datetime``:** o ``datetime-local`` da interface
    nao tem fuso, e quem escreve 18:30 esta a dizer "as 18h30 **aqui**". A
    versao em JavaScript fazia ``new Date(valor)`` — que assume hora local — e
    depois lia os campos em UTC, o que dava **uma hora de diferenca em Portugal**
    com um ``Z`` a dizer que nao.

    E a razao de o ``DTSTART`` ser **sem fuso**: e' um horario flutuante, que o
    calendario interpreta na hora de quem abre. Um encontro marcado numa
    biblioteca e' exactamente esse caso. Com ``TZID`` marcava a hora num sitio e
    quem estivesse noutro via-o a hora errada.

    O ``DTSTAMP`` sem data continua em UTC, porque diz **quando o evento foi
    criado** e nao quando acontece.
    """
    if not value:
        agora = datetime.now(timezone.utc)
        return agora.strftime("%Y%m%dT%H%M%SZ")

    data, _, hora = str(value).partition("T")
    ano, mes, dia = data.split("-")
    h, _, m = hora.partition(":")
    return f"{ano}{mes}{dia}T{h[:2]}{m[:2] or '00'}00"


def build_link(f: dict) -> str:
    return normalize_url(f.get("url"))


def build_texto(f: dict) -> str:
    return str(f.get("texto") or "").strip()


def build_email(f: dict) -> str:
    to = str(f.get("mailTo") or "").strip()
    partes = []
    if f.get("mailSubject") and f["mailSubject"].strip():
        partes.append("subject=" + url_encode(f["mailSubject"].strip()))
    if f.get("mailBody") and f["mailBody"].strip():
        partes.append("body=" + url_encode(f["mailBody"].strip()))
    return "mailto:" + to if not partes else "mailto:" + to + "?" + "&".join(partes)


def build_telefone(f: dict) -> str:
    return "tel:" + phone(f.get("phonePrefix"), f.get("phoneNumber"))


def build_sms(f: dict) -> str:
    # O corpo do SMSTO vai ate ao fim da string: um ':' ou uma quebra de linha
    # fariam os leitores interpretarem mal (validados acima).
    return (
        "SMSTO:"
        + phone(f.get("phonePrefix"), f.get("phoneNumber"))
        + ":"
        + str(f.get("smsMessage") or "")
    )


def build_whatsapp(f: dict) -> str:
    number = digits_only(phone(f.get("phonePrefix"), f.get("phoneNumber")))
    mensagem = str(f.get("waMessage") or "")
    if not mensagem:
        return f"https://wa.me/{number}"
    return f"https://wa.me/{number}?text={url_encode(mensagem)}"


def build_evento(f: dict) -> str:
    linha = lambda nome, valor: nome + ":" + valor + ICAL_NEWLINE  # noqa: E731

    out = "BEGIN:VCALENDAR" + ICAL_NEWLINE
    out += linha("VERSION", "2.0")
    out += linha("PRODID", "-//QrCodeGenerator//PT")
    out += linha("CALSCALE", "GREGORIAN")
    out += "BEGIN:VEVENT" + ICAL_NEWLINE
    out += linha("DTSTAMP", _stamp_ical(f.get("eventStart")))
    out += linha("DTSTART", _stamp_ical(f.get("eventStart")))
    out += linha("DTEND", _stamp_ical(f.get("eventEnd")))
    out += linha("SUMMARY", escape_ical(str(f.get("eventTitle") or "").strip()))
    out += linha("LOCATION", escape_ical(str(f.get("eventLocation") or "").strip()))
    out += linha("DESCRIPTION", escape_ical(str(f.get("eventDescription") or "").strip()))
    out += "END:VEVENT" + ICAL_NEWLINE
    out += "END:VCALENDAR" + ICAL_NEWLINE
    return out


def build_localizacao(f: dict) -> str:
    return f"geo:{_round7(parse_coord(f.get('geoLat')))},{_round7(parse_coord(f.get('geoLng')))}"


def build_wifi(f: dict) -> str:
    sec = f.get("wifiSec")
    auth = "WEP" if sec == "WEP" else ("nopass" if sec == "Aberto" else "WPA")

    out = "WIFI:"
    out += "T:" + auth + ";"
    out += "S:" + escape_wifi(str(f.get("wifiSsid") or "").strip()) + ";"
    if auth != "nopass":
        out += "P:" + escape_wifi(f.get("wifiPass") or "") + ";"
    if f.get("wifiHidden"):
        out += "H:true;"
    out += ";"  # terminador vazio obrigatorio
    return out


def build_vcard(f: dict) -> str:
    """
    O vCard na **RFC 6350**, que e' a versao 4.0.

    **A ordem dos campos importa, e um `N` com o nome primeiro da um telefone
    que mostra "Silva, Ana" como "Ana Silva".** A RFC poe a familia primeiro,
    e por isso que o campo e' `familia;nome;extra;prefixo;sufixo` — com tres
    separadores a mais no fim, porque sao cinco campos e so dois com valor.
    """
    primeiro = str(f.get("vcFirstName") or "").strip()
    ultimo = str(f.get("vcLastName") or "").strip()
    linha = lambda valor: valor + ICAL_NEWLINE  # noqa: E731

    out = "BEGIN:VCARD" + ICAL_NEWLINE
    out += linha("VERSION:4.0")
    out += linha("FN:" + escape_ical(f"{primeiro} {ultimo}".strip()))
    out += linha("N:" + escape_ical(ultimo) + ";" + escape_ical(primeiro) + ";;;")
    out += linha("PRODID:-//QrCodeGenerator//PT")

    if f.get("vcOrg") and f["vcOrg"].strip():
        out += linha("ORG:" + escape_ical(f["vcOrg"].strip()))
    if f.get("vcRole") and f["vcRole"].strip():
        out += linha("TITLE:" + escape_ical(f["vcRole"].strip()))

    if f.get("vcPhone") and f["vcPhone"].strip():
        out += linha("TEL;TYPE=cell:" + f["vcPhone"].strip())
    if f.get("vcPhone2") and f["vcPhone2"].strip():
        out += linha("TEL;TYPE=work:" + f["vcPhone2"].strip())
    if f.get("vcEmail") and f["vcEmail"].strip():
        out += linha("EMAIL:" + f["vcEmail"].strip())

    # ADR;TYPE=work:;;rua;localidade;regiao;codigo postal;pais
    rua = str(f.get("vcStreet") or "").strip()
    cidade = str(f.get("vcCity") or "").strip()
    codigo = str(f.get("vcZip") or "").strip()
    pais = str(f.get("vcCountry") or "").strip()

    if rua or cidade or codigo or pais:
        out += linha(
            "ADR;TYPE=work:;;"
            + escape_ical(rua) + ";"
            + escape_ical(cidade) + ";;"
            + escape_ical(codigo) + ";"
            + escape_ical(pais)
        )

    out += linha("END:VCARD")
    return out


#: As categorias que nao sao PIX, e a funcao que constroi cada uma.
BUILDERS = {
    "link": build_link,
    "texto": build_texto,
    "email": build_email,
    "telefone": build_telefone,
    "sms": build_sms,
    "whatsapp": build_whatsapp,
    "evento": build_evento,
    "localizacao": build_localizacao,
    "wifi": build_wifi,
    "vcard": build_vcard,
}

#: Os ids de todas as categorias, com o PIX no fim porque e' o mais complido e o
#: unico que o `qrcode_core` ja tinha.
CATEGORY_IDS = list(BUILDERS) + ["pix"]


def build(category_id: str, fields: dict) -> str:
    """Constroi o payload de uma categoria. Levanta se algo estiver errado."""
    if category_id == "pix":
        from .pix import build as build_pix

        return build_pix(
            key=fields.get("pixKey"),
            name=fields.get("pixName"),
            city=fields.get("pixCity"),
            amount=fields.get("pixAmount"),
            txid=fields.get("pixTxid") or "***",
            description=fields.get("pixDescription"),
            postcode=fields.get("pixPostcode") or "",
            single_use=bool(fields.get("pixSingleUse")),
        )

    construtor = BUILDERS.get(category_id)
    if construtor is None:
        raise ValueError("Categoria desconhecida: " + category_id)

    return construtor(fields)
