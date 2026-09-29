"""
A validacao dos 10 tipos, espelhando `web/payloads/types.js`.

    from qrcode_core.tipos import validate
    validate("link", {"url": "exemplo.pt"})   # -> None
    validate("link", {})                      # -> "Indica um link."

Cada funcao devolve a mensagem, ou ``None`` quando esta tudo bem. **E o mesmo
contrato do JavaScript**, e a razao e' a mesma: a mensagem e' o que a pessoa ve
no ecra, e as duas stacks tem de dar a mesma para o payload ser o mesmo.

Um aviso sobre a ordem das validacoes
--------------------------------------

**A ordem dentro de cada bloco e' a do JavaScript, e trocar as mensagens nao e'
"dar outra mensagem qualquer".** Em ``localizacao``, a mensagem de "latitude
invalida" vem antes da de "fora do intervalo", porque um valor que nao e' um
numero nao tem intervalo. E a primeira versao deste ficheiro validava o
intervalo primeiro e dava "a latitude tem de estar entre -90 e 90" para o texto
``"abc"``, que e' uma mensagem **falsa** — o problema nao e' o intervalo, e' o
texto nao ser um numero.
"""

from __future__ import annotations

from .tipos import (
    is_sms_safe,
    normalize_url,
    parse_coord,
    phone_prefix,
    digits_only,
    UrlError,
)


def validate_link(f: dict) -> str | None:
    try:
        normalize_url(f.get("url"))
        return None
    except UrlError as e:
        return str(e)


def validate_texto(f: dict) -> str | None:
    texto = f.get("texto")
    return None if texto and texto.strip() else "Escreve algum texto."


def validate_email(f: dict) -> str | None:
    if not f.get("mailTo") or not f["mailTo"].strip():
        return "Indica o destinatario do email."

    to = f["mailTo"].strip()
    if "@" not in to or to.startswith("@") or to.endswith("@") or " " in to:
        return "O destinatario nao parece um email valido."

    return None


def _validate_telefone(f: dict, com_sms: bool) -> str | None:
    if not f.get("phoneNumber") or not f["phoneNumber"].strip():
        return "Indica o numero de telefone."

    if not phone_prefix(f.get("phonePrefix")):
        return "Indica o indicativo do pais (ex.: +351)."

    if len(digits_only(f["phoneNumber"])) < 4:
        return "O numero de telefone e' curto demais."

    if com_sms and f.get("smsMessage"):
        if not is_sms_safe(f["smsMessage"]):
            return "A mensagem tem caracteres que um SMS nao suporta (ex.: { } [ ] ~ ^ | EUR)."

    return None


def validate_telefone(f: dict) -> str | None:
    return _validate_telefone(f, com_sms=False)


def validate_sms(f: dict) -> str | None:
    return _validate_telefone(f, com_sms=True)


def validate_whatsapp(f: dict) -> str | None:
    return _validate_telefone(f, com_sms=False)


def validate_evento(f: dict) -> str | None:
    if not f.get("eventTitle") or not f["eventTitle"].strip():
        return "Indica o titulo do evento."

    # A comparacao e' de **cadeias**, e nao de datas. O `datetime-local` da
    # interface tem o formato `AAAA-MM-DDTHH:MM`, e as cadeias comecam pelo ano,
    # portanto a ordem lexica e' a ordem cronologica. Passar por `datetime`
    # introduziria o fuso, e a mesma hora daria datas diferentes.
    fim = f.get("eventEnd")
    inicio = f.get("eventStart")
    if fim and inicio and str(fim) < str(inicio):
        return "A data de fim nao pode ser anterior a de inicio."

    return None


def validate_localizacao(f: dict) -> str | None:
    lat = parse_coord(f.get("geoLat"))
    lng = parse_coord(f.get("geoLng"))

    if lat is None:
        return "Indica uma latitude valida (ex.: 38.7223)."
    if lng is None:
        return "Indica uma longitude valida (ex.: -9.1393)."

    # Sem isto qualquer numero passava e produzia um `geo:` que nenhum mapa
    # conseguia abrir — que e' o pior resultado, porque parece funcionar.
    if lat < -90 or lat > 90:
        return "A latitude tem de estar entre -90 e 90."
    if lng < -180 or lng > 180:
        return "A longitude tem de estar entre -180 e 180."

    return None


def validate_wifi(f: dict) -> str | None:
    if not f.get("wifiSsid") or not f["wifiSsid"].strip():
        return "Indica o nome da rede (SSID)."

    ssid = f["wifiSsid"].strip()
    if len(ssid) > 32:
        return "O SSID tem mais de 32 caracteres."

    aberto = str(f.get("wifiSec", "")).lower() == "aberto"
    if not aberto and not f.get("wifiPass"):
        return "Indica a password da rede."
    if not aberto and len(f.get("wifiPass") or "") > 63:
        return "A password tem mais de 63 caracteres."

    return None


def validate_vcard(f: dict) -> str | None:
    vazios = ["vcFirstName", "vcLastName", "vcPhone", "vcPhone2", "vcEmail"]
    if all(not f.get(k) or not str(f[k]).strip() for k in vazios):
        return "Preenche pelo menos um campo do contacto."

    if f.get("vcEmail") and f["vcEmail"].strip():
        email = f["vcEmail"].strip()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            return "O email nao parece valido."

    return None


def validate_pix(f: dict) -> str | None:
    """O PIX valida-se a si proprio, e devolve a primeira mensagem que aparecer."""
    try:
        from . import build

        build("pix", f)
        return None
    except Exception as e:  # noqa: BLE001 — a mensagem e' o que interessa
        return str(e)


VALIDATORS = {
    "link": validate_link,
    "texto": validate_texto,
    "email": validate_email,
    "telefone": validate_telefone,
    "sms": validate_sms,
    "whatsapp": validate_whatsapp,
    "evento": validate_evento,
    "localizacao": validate_localizacao,
    "wifi": validate_wifi,
    "vcard": validate_vcard,
    "pix": validate_pix,
}


def validate(category_id: str, fields: dict) -> str | None:
    """A mensagem de erro, ou ``None`` se estiver tudo bem."""
    funcao = VALIDATORS.get(category_id)
    if funcao is None:
        return "Categoria desconhecida."
    return funcao(fields)
