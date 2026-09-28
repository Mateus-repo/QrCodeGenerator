"""Gera `spec/vectors.json` a partir da implementação de referência.

Uso:
    python spec/gerar-vectors.py

Cada vetor é validado antes de ser escrito: constrói o payload, relê com o
parser, confirma o CRC e — se Pillow e zxing-cpp estiverem instalados — gera o
PNG e confirma que um leitor real devolve a mesma string.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from qrcode_core import build, parse  # noqa: E402
from qrcode_core.pix import PixPayload  # noqa: E402

CASES: list[dict] = [
    {
        "id": "pix_uuid_sem_valor",
        "desc": "Exemplo do Manual do Banco Central: chave aleatória, sem valor.",
        "fields": {
            "key": "123e4567-e12b-12d1-a456-426655440000",
            "name": "Fulano de Tal",
            "city": "BRASILIA",
        },
        "source": "Banco Central do Brasil, Manual de Padroes para Iniciacao do Pix",
    },
    {
        "id": "pix_email_com_valor",
        "desc": "Chave email com valor fixo.",
        "fields": {
            "key": "Fulano2019@example.com",
            "name": "Fulano de Tal",
            "city": "BRASILIA",
            "amount": "25,75",
        },
    },
    {
        "id": "pix_cpf_com_valor",
        "desc": "Chave CPF escrita com mascara.",
        "fields": {
            "key": "529.982.247-25",
            "name": "Ana Silva",
            "city": "Belo Horizonte",
            "amount": "0.01",
        },
    },
    {
        "id": "pix_cnpj",
        "desc": "Chave CNPJ de empresa.",
        "fields": {
            "key": "11.222.333/0001-81",
            "name": "Empresa Exemplo SA",
            "city": "Curitiba",
        },
    },
    {
        "id": "pix_telefone_com_txid",
        "desc": "Telefone sem +55, com txid personalizado.",
        "fields": {
            "key": "5511966666666",
            "name": "Loja Doce",
            "city": "Sao Paulo",
            "txid": "pedido123",
        },
    },
    {
        "id": "pix_nome_truncado",
        "desc": "Nome com mais de 25 caracteres e truncado.",
        "fields": {
            "key": "fulano@example.com",
            "name": "Jose Carlos dos Santos Silva Jr",
            "city": "Sao Paulo",
        },
    },
    {
        "id": "pix_nome_com_acento",
        "desc": "Acentos normalizados para ASCII antes de contar o comprimento.",
        "fields": {
            "key": "fulano@example.com",
            "name": "José Antônio Café",
            "city": "São Paulo",
        },
    },
    {
        "id": "pix_descricao_26_02",
        "desc": "Campo opcional 26.02 (descricao).",
        "fields": {
            "key": "fulano@example.com",
            "name": "Jose Antonio Cafe LTDA",
            "city": "Sao Paulo",
            "description": "Obrigado!",
        },
    },
    {
        "id": "pix_uso_unico_com_cep",
        "desc": "QR de uso unico (campo 01) com codigo postal (campo 61).",
        "fields": {
            "key": "fulano@example.com",
            "name": "Fulano",
            "city": "Recife",
            "postcode": "52010-100",
            "single_use": True,
        },
    },
    {
        "id": "pix_valor_milhar",
        "desc": "Valor com separador de milhar (1.234,56).",
        "fields": {
            "key": "fulano@example.com",
            "name": "Fulano",
            "city": "Recife",
            "amount": "1.234,56",
        },
    },
]


def _to_payload(fields: dict) -> PixPayload:
    # `PixPayload` já coage `amount` (aceita "25,75", 25.75, Decimal, ...).
    return PixPayload(**fields)


def verify(brcode: str) -> list[str]:
    """Devolve a lista de verificações que passaram."""
    checks = ["crc", "parse_round_trip", "rebuild_identico"]
    parsed = parse(brcode)
    assert parsed.crc_valid, "CRC inválido"
    assert build(parsed.payload) == brcode, "rebuild não devolve o mesmo payload"
    return checks


def verify_image(brcode: str) -> bool:
    try:
        import io

        import zxingcpp

        from qrcode_core import to_png
    except ImportError:
        return False
    from PIL import Image

    image = Image.open(io.BytesIO(to_png(brcode, scale=6)))
    result = zxingcpp.read_barcode(image)
    return result is not None and result.text == brcode


def main() -> int:
    vectors = []
    for case in CASES:
        brcode = build(_to_payload(case["fields"]))
        checks = verify(brcode)
        if verify_image(brcode):
            checks.append("png_descodificado")

        vectors.append(
            {
                "id": case["id"],
                "tipo": "pix",
                "descricao": case["desc"],
                "fonte": case.get("source", "gerado por python/qrcode_core"),
                "campos": case["fields"],
                "payload": brcode,
                "bytes": len(brcode.encode("utf-8")),
                "verificado": checks,
            }
        )
        print(f"  {case['id']:26} {len(brcode):3} bytes  {','.join(checks)}")

    document = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "versao": 1,
        "descricao": (
            "Vetores de teste partilhados entre stacks. 'campos' e o input, "
            "'payload' e a string exata que qualquer implementacao deve produzir."
        ),
        "tipos": ["pix"],
        "vectors": vectors,
    }

    target = ROOT / "spec" / "vectors.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"\n{len(vectors)} vetores -> {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
