"""PIX / BR Code (EMV-QRCPS-MPM).

Implementação de referência do tipo PIX. Todas as outras stacks do repositorio
devem reproduzir exatamente estes payloads — ver `docs/TIPOS-QR.md`.

Referência normativa: Banco Central do Brasil, "Manual de Padrões para
Iniciação do Pix".
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation

# --- Constantes do padrão -------------------------------------------------

GUI = "br.gov.bcb.pix"
COUNTRY_CODE = "BR"
CURRENCY_BRL = "986"
MCC_UNSPECIFIED = "0000"
PAYLOAD_FORMAT_INDICATOR = "01"
PLACEHOLDER_TXID = "***"
POINT_OF_INITIATION_ONCE = "12"

MAX_NAME = 25
MAX_CITY = 15
MAX_TXID = 25
MAX_POSTCODE = 9
MAX_EMAIL = 77
MAX_TEMPLATE_26 = 99  # teto do template "26" (chave + descrição)
GUID_LENGTH = len(GUI)  # 14

_CRC_TAG = "6304"


class PixError(ValueError):
    """Erro genérico de PIX."""


class PixKeyError(PixError):
    """A chave PIX é inválida."""


class PixValidationError(PixError):
    """Um campo obrigatório está ausente ou malformado."""


# --- CRC-16/CCITT-FALSE ---------------------------------------------------


def crc16(data: str) -> int:
    """CRC-16/CCITT-FALSE: polinómio 0x1021, init 0xFFFF, sem reflexão.

    Vetor de validação canónico: ``crc16("123456789") == 0x29B1``.
    """
    try:
        raw = data.encode("latin-1")
    except UnicodeEncodeError as exc:  # pragma: no cover - charset nunca falha
        raise PixError("Payload tem caracteres fora de latin-1.") from exc

    crc = 0xFFFF
    for byte in raw:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def crc16_hex(data: str) -> str:
    """CRC-16 em 4 caracteres hexadecimais maiúsculos."""
    return f"{crc16(data):04X}"


# --- Normalização de texto -------------------------------------------------


def to_ascii(text: str, collapse: bool = True) -> str:
    """Converte para ASCII sem acentos e sem caracteres de controlo.

    Várias apps do Banco Central corrompem ou recusam payloads com acento,
    por isso o comprimento é contado em ASCII: 1 caractere = 1 byte.

    Com ``collapse=False`` os espaços são preservados tal como estão — é o que
    o leitor precisa, para não mexer nos comprimentos declarados.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    ascii_only = stripped.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_only.split()) if collapse else ascii_only


def _clean_text(value: str | None, max_length: int) -> str:
    return to_ascii(value or "")[:max_length].strip()


# --- Chave PIX -------------------------------------------------------------


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _is_valid_cpf(value: str) -> bool:
    if len(value) != 11 or len(set(value)) == 1:
        return False
    for position in (9, 10):
        total = sum(int(value[i]) * (position + 1 - i) for i in range(position))
        check = (total * 10) % 11
        if check == 10:
            check = 0
        if check != int(value[position]):
            return False
    return True


def _is_valid_cnpj(value: str) -> bool:
    if len(value) != 14 or len(set(value)) == 1:
        return False
    first_weights = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
    second_weights = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
    for weights, position in ((first_weights, 12), (second_weights, 13)):
        total = sum(int(value[i]) * w for i, w in enumerate(weights))
        check = total % 11
        check = 0 if check < 2 else 11 - check
        if check != int(value[position]):
            return False
    return True


def _is_valid_phone(value: str) -> bool:
    if not value.startswith("+55"):
        return False
    digits = value[3:]
    if len(digits) not in (10, 11):
        return False
    ddd = digits[:2]
    if ddd[0] == "0" or ddd[1] == "0":
        return False
    return all(ch.isdigit() for ch in digits)


def _is_valid_email(value: str) -> bool:
    if len(value) > MAX_EMAIL or value.count("@") != 1:
        return False
    local, _, domain = value.partition("@")
    if not local or not domain or "." not in domain or domain.startswith("."):
        return False
    if domain.endswith(".") or " " in value:
        return False
    return re.fullmatch(r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+", local) is not None


_UUID_RE = re.compile(r"\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")


def _is_valid_random_key(value: str) -> bool:
    return _UUID_RE.match(value) is not None


def normalize_key(raw: str) -> str:
    """Limpa a chave introduzida pelo utilizador.

    Aceita CPF/CNPJ com máscara, telefone sem ``+55`` e email/UUID com
    maiúsculas/minúsculas desarrumadas.
    """
    key = to_ascii(raw or "").strip()
    if not key:
        raise PixKeyError("Indica a chave PIX.")

    if "@" in key:
        return key.lower()

    if key.replace("-", "").replace(" ", "").isalnum() and "-" in key:
        return key.lower()

    digits = _digits(key)
    if digits:
        # Telefone. O padrão exige o indicativo +55; aceitamos escrever sem os
        # "+" e sem o 55, desde que sobrem 10 ou 11 dígitos (DDD + número).
        candidate = None
        if len(digits) == 13 and digits.startswith("55"):
            candidate = "+55" + digits[2:]
        elif key.startswith("+55") and len(digits) in (12, 13):
            candidate = "+55" + digits[2:]
        elif key.startswith("+") and len(digits) in (12, 13, 14):
            candidate = "+" + digits
        if candidate and _is_valid_phone(candidate):
            return candidate

        # CPF (11) / CNPJ (14) escritos com ou sem máscara.
        if len(digits) in (11, 14) and re.fullmatch(r"[\d\s.\-/]+", key):
            return digits

    return key


def validate_key(raw: str) -> str:
    """Valida a chave PIX e devolve-a já normalizada.

    Aceita: CPF, CNPJ, telefone (+55), email e chave aleatória (UUID).
    """
    key = normalize_key(raw)

    if key.isdigit():
        if len(key) == 11 and _is_valid_cpf(key):
            return key
        if len(key) == 14 and _is_valid_cnpj(key):
            return key
        raise PixKeyError(
            "CPF/CNPJ inválido (os dígitos verificadores não conferem). "
            "Se esta chave for um telefone, escreve com o indicativo +55."
        )

    if key.startswith("+"):
        if _is_valid_phone(key):
            return key
        raise PixKeyError("Telefone inválido. Usa o formato +55 seguido de DDD e número.")

    if "@" in key:
        if _is_valid_email(key):
            return key
        raise PixKeyError("Email inválido como chave PIX.")

    if _is_valid_random_key(key):
        return key

    raise PixKeyError(
        "Chave PIX inválida. Use CPF, CNPJ, telefone com +55, email ou chave aleatória (UUID)."
    )


def key_type(raw: str) -> str:
    """Devolve o tipo de chave já validada: cpf | cnpj | phone | email | random."""
    key = validate_key(raw)
    if key.isdigit():
        return "cpf" if len(key) == 11 else "cnpj"
    if key.startswith("+"):
        return "phone"
    if "@" in key:
        return "email"
    return "random"


# --- Valor -----------------------------------------------------------------


def parse_amount(raw: str | float | int | Decimal | None) -> Decimal | None:
    """Aceita ``25,75`` (pt-BR) e ``25.75``/``25,7`` e devolve Decimal.

    O ponto só é separador de milhar quando seguido de exatamente 3 dígitos
    e não no fim do valor, ex.: ``1.234,56`` -> 1234.56.
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float, Decimal)):
        value = Decimal(str(raw))
    else:
        text = to_ascii(str(raw)).strip().replace("R$", "").replace(" ", "")
        if not text:
            return None
        if "," in text:
            text = text.replace(".", "").replace(",", ".")
        elif re.search(r"\.\d{3}(?!\d)", text):
            text = text.replace(".", "")
        try:
            value = Decimal(text)
        except InvalidOperation as exc:
            raise PixValidationError(f"Valor inválido: {raw!r}") from exc
    if value < 0:
        raise PixValidationError("O valor não pode ser negativo.")
    return value.quantize(Decimal("0.01"))


# --- Payload ---------------------------------------------------------------


@dataclass(frozen=True)
class PixPayload:
    """Dados de um QR PIX estático."""

    key: str
    name: str
    city: str
    amount: Decimal | None = None
    txid: str = PLACEHOLDER_TXID
    description: str = ""
    postcode: str = ""
    single_use: bool = False

    def __post_init__(self) -> None:
        # Coage `amount` para Decimal: o utilizador escreve "25,75" ou 25.75.
        object.__setattr__(self, "amount", parse_amount(self.amount))

    def replace(self, **kwargs) -> "PixPayload":
        return replace(self, **kwargs)


def _clean_txid(raw: str | None) -> str:
    txid = re.sub(r"[^A-Za-z0-9]", "", to_ascii(raw or ""))
    return txid[:MAX_TXID] or PLACEHOLDER_TXID


def _merchant_account_template(key: str, description: str) -> str:
    """Monta o template 26, truncando a descrição para respeitar o teto de 99."""
    template = _tlv("00", GUI) + _tlv("01", key)
    if not description:
        return template
    room = MAX_TEMPLATE_26 - len(template) - 4  # -4 = tag+length do campo "02"
    if room <= 0:
        return template
    text = _clean_text(description, room)
    return template + _tlv("02", text) if text else template


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def build(payload: PixPayload) -> str:
    """Gera a string BR Code (PIX copia e cola)."""
    key = validate_key(payload.key)

    name = _clean_text(payload.name, MAX_NAME)
    if not name:
        raise PixValidationError("Indica o nome do recebedor (max. 25 caracteres).")

    city = _clean_text(payload.city, MAX_CITY)
    if not city:
        raise PixValidationError("Indica a cidade do recebedor (max. 15 caracteres).")

    postcode = _digits(payload.postcode)[:MAX_POSTCODE]

    parts = [_tlv("00", PAYLOAD_FORMAT_INDICATOR)]
    if payload.single_use:
        parts.append(_tlv("01", POINT_OF_INITIATION_ONCE))
    parts += [
        _tlv("26", _merchant_account_template(key, payload.description)),
        _tlv("52", MCC_UNSPECIFIED),
        _tlv("53", CURRENCY_BRL),
    ]
    if payload.amount is not None:
        parts.append(_tlv("54", f"{payload.amount:.2f}"))
    parts += [
        _tlv("58", COUNTRY_CODE),
        _tlv("59", name),
        _tlv("60", city),
    ]
    if postcode:
        parts.append(_tlv("61", postcode))
    parts.append(_tlv("62", _tlv("05", _clean_txid(payload.txid))))

    body = "".join(parts) + _CRC_TAG
    return body + crc16_hex(body)


def fix_crc(brcode: str) -> str:
    """Recalcula o CRC de um payload (útil para recuperar códigos colados)."""
    cleaned = _strip_wrapping(brcode)
    if _CRC_TAG not in cleaned:
        raise PixValidationError("O payload não tem o campo 63 (CRC16).")
    body = cleaned[: cleaned.rindex(_CRC_TAG) + 4]
    return body + crc16_hex(body)


# --- Parsing ---------------------------------------------------------------

#: Caracteres que a app do banco usa quando quebra o código em várias linhas.
_WRAPPING = str.maketrans("", "", "\r\n\t")


def _strip_wrapping(brcode: str) -> str:
    """Remove quebras de linha e tabulações — **nunca** os espaços.

    Um `replace("\\s", "")` générico destrói o espaço dentro de "Fulano de Tal"
    e desalinha todos os comprimentos declarados a partir daí, produzindo um
    payload que parece válido e é recusado pelo banco.
    """
    return to_ascii(brcode, collapse=False).translate(_WRAPPING).strip()


def _parse_tlv(data: str) -> list[tuple[str, str]]:
    fields: list[tuple[str, str]] = []
    index = 0
    while index < len(data):
        if index + 4 > len(data):
            raise PixValidationError("Payload truncado (TLV incompleto).")
        tag = data[index : index + 2]
        if not tag.isdigit():
            raise PixValidationError(f"Tag inválida: {tag!r}")
        raw_length = data[index + 2 : index + 4]
        if not raw_length.isdigit():
            raise PixValidationError(
                f"Campo {tag} tem comprimento inválido: {raw_length!r}."
            )
        length = int(raw_length)
        value = data[index + 4 : index + 4 + length]
        if len(value) != length:
            raise PixValidationError(
                f"Campo {tag} tem comprimento declarado {length} mas contém "
                f"{len(value)} caracteres — payload truncado ou corrompido."
            )
        fields.append((tag, value))
        index += 4 + length
    return fields


@dataclass(frozen=True)
class ParsedPix:
    """Resultado da leitura de um BR Code."""

    payload: PixPayload
    crc_valid: bool
    raw: str
    point_of_initiation: str | None = None
    url: str | None = None


def parse(brcode: str) -> ParsedPix:
    """Lê um BR Code e valida o CRC.

    Não levanta em caso de CRC inválido — devolve ``crc_valid=False``, para
    que a UI possa explicar o que está errado.
    """
    cleaned = _strip_wrapping(brcode)
    if not cleaned.startswith("0002"):
        raise PixValidationError("Isto não parece um PIX copia e cola (falta o campo 00).")
    if not cleaned.endswith(_CRC_TAG) and len(cleaned) < 8:
        raise PixValidationError("Payload demasiado curto.")

    fields = _parse_tlv(cleaned)
    found = dict(fields)

    crc_field = found.get("63")
    if crc_field is None:
        raise PixValidationError("O payload não tem o campo 63 (CRC16).")
    body = cleaned[: cleaned.rindex(_CRC_TAG)]
    crc_valid = crc_field == crc16_hex(body + _CRC_TAG)

    template_26 = dict(_parse_tlv(found["26"])) if "26" in found else {}
    key = template_26.get("01", "")
    if template_26.get("00") != GUI:
        raise PixValidationError(f"GUI inválido: {template_26.get('00')!r} (esperado {GUI}).")

    template_62 = dict(_parse_tlv(found["62"])) if "62" in found else {}
    txid = template_62.get("05") or PLACEHOLDER_TXID

    amount = Decimal(found["54"]) if "54" in found else None
    postcode = found.get("61", "")

    payload = PixPayload(
        key=key,
        name=found.get("59", ""),
        city=found.get("60", ""),
        amount=amount,
        txid=txid,
        description=template_26.get("02", ""),
        postcode=postcode,
        single_use=found.get("01") == POINT_OF_INITIATION_ONCE,
    )
    return ParsedPix(
        payload=payload,
        crc_valid=crc_valid,
        raw=cleaned,
        point_of_initiation=found.get("01"),
        url=template_26.get("25"),
    )
