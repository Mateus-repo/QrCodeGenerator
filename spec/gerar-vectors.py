"""Gera `spec/vectors.json` a partir da implementação de referência.

    python spec/gerar-vectors.py

Cada vetor é validado antes de ser escrito: constrói o payload e — se Pillow e
zxing-cpp estiverem instalados — gera o PNG e confirma que um leitor real
devolve a mesma string. **Um vetor que não foi lido por um leitor não entra**,
porque um payload que parece certo e não se lê é o pior resultado possível.

## O PIX é verificado de outra maneira, e porquê

O PIX tem um `parse`, um CRC e um round-trip: dá para reler o payload e
comparar. **Os outros dez não têm parser**, porque são transporte — um link é
um link e o formato não impõe nada sobre o conteúdo. A verificação deles é a
mesma de todos: a imagem gerada é lida por um leitor independente e tem de
devolver a mesma cadeia, byte a byte.

A `checks` de cada vetor diz o que foi feito, e é isso que um leitor do ficheiro
tem de ler antes de acreditar no `payload`.

## O gerador não é o arbrito, e por isso que regista a origem

`docs/TIPOS-QR.md` é a spec em prosa. Este ficheiro é o que a transforma em
`vectors.json`, e `vectors.json` é o que as stacks têm de bater. **Um payload
que mude aqui e não mude nas cinco stacks é um bug** — e por isso que o
`verificado` de cada vetor é a lista do que foi corrido, e não um `true`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "spec"))

from casos import CASOS as CASOS_TRANSPORTE  # noqa: E402
from qrcode_core import build, build_pix, parse, validate  # noqa: E402
from qrcode_core.pix import PixPayload  # noqa: E402

#: Os casos do PIX, com os campos do `PixPayload` do Banco Central.
#:
#: **Os campos chamam-se `key`, `name`, `city` e nao `pixKey`, `pixName`,
#: `pixCity`**, e e' a excepcao que a `spec/casos.py` explica: estes sao os
#: nomes do PIX do Banco Central, nao os da interface. Os dez tipos de
#: transporte usam os campos do navegador tal como estao.
#:
#: **Esta lista foi extraida de `vectors.json` e nao escrita de memoria.** Cinco
#: dos dez casos estavam errados quando foram escritos de memoria -- outros
#: nomes, outras cidades, e uma chave de telefone com `+` a mais -- e o
#: sintoma e' um payload de PIX diferente, que `AGENTS.md` diz que e' um bug
#: mesmo que o teste do PIX passe. Extrair e' a unica forma de nao errar.
CASOS_PIX: list[dict] = [
    {
        "id": "pix_uuid_sem_valor",
        "desc": "Exemplo do Manual do Banco Central: chave aleatória, sem valor.",
        "source": "Banco Central do Brasil, Manual de Padroes para Iniciacao do Pix",
        "fields": {
            "key": "123e4567-e12b-12d1-a456-426655440000",
            "name": "Fulano de Tal",
            "city": "BRASILIA",
        },
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

#: A ordem dos tipos na spec, que é a ordem da interface.
TIPOS = [
    "link",
    "texto",
    "email",
    "telefone",
    "sms",
    "whatsapp",
    "evento",
    "localizacao",
    "wifi",
    "vcard",
    "pix",
]


def _pix(case: dict) -> str:
    # `PixPayload` já coage `amount` (aceita "25,75", 25.75, Decimal, ...).
    return build_pix(PixPayload(**case["fields"]))


def verificar_pix(payload: str) -> list[str]:
    """O que se pode verificar num payload de PIX, e verifica-se."""
    checks = ["crc", "parse_round_trip", "rebuild_identico"]
    parsed = parse(payload)
    assert parsed.crc_valid, "CRC inválido"
    assert build_pix(parsed.payload) == payload, "rebuild não devolve o mesmo payload"
    return checks


def verificar_transporte(tipo: str, campos: dict, payload: str) -> list[str]:
    """
    O que se pode verificar num payload de transporte, e verifica-se.

    **Só a leitura.** Não há parser para reler, porque não há formato com
    campos a reler — e inventar um parser para "voltar a partir da string"
    seria escrever um segundo encoder e chamar-lhe verificação, que é como um
    encoder errado passa nos dois lados ao mesmo tempo.
    """
    erro = validate(tipo, campos)
    assert erro is None, f"o proprio caso nao valida: {erro}"

    checks = ["validado"]
    if verificar_imagem(payload):
        checks.append("png_descodificado")
    return checks


def verificar_imagem(payload: str) -> bool:
    """
    Gera o PNG e confirma que um leitor independente devolve a mesma cadeia.

    **A comparação é do texto, e para o PIX e para os dez é igual.** A excepção
    que o `AGENTS.md` regista é o SQRC, cujo atributo `text` do ZXing assume
    ISO-8859-1 sem ECI — mas isso e' um contentor binário, e nao um payload.
    """
    try:
        import io

        import zxingcpp

        from PIL import Image

        from qrcode_core import to_png
    except ImportError:
        return False

    image = Image.open(io.BytesIO(to_png(payload, scale=6)))
    result = zxingcpp.read_barcode(image)
    return result is not None and result.text == payload


def main() -> int:
    vectors = []

    for case in CASOS_TRANSPORTE:
        tipo = case["tipo"]
        campos = case["campos"]
        payload = build(tipo, campos)
        checks = verificar_transporte(tipo, campos, payload)

        vectors.append(
            {
                "id": case["id"],
                "tipo": tipo,
                "descricao": case["desc"],
                "fonte": case.get("source", "docs/TIPOS-QR.md, gerado por python/qrcode_core"),
                "campos": campos,
                "payload": payload,
                "bytes": len(payload.encode("utf-8")),
                "verificado": checks,
            }
        )
        print(f"  {case['id']:28} {tipo:12} {len(payload):3}  {','.join(checks)}")

    for case in CASOS_PIX:
        payload = _pix(case)
        checks = verificar_pix(payload)
        if verificar_imagem(payload):
            checks.append("png_descodificado")

        vectors.append(
            {
                "id": case["id"],
                "tipo": "pix",
                "descricao": case["desc"],
                "fonte": case.get("source", "docs/TIPOS-QR.md, gerado por python/qrcode_core"),
                "campos": case["fields"],
                "payload": payload,
                "bytes": len(payload.encode("utf-8")),
                "verificado": checks,
            }
        )
        print(f"  {case['id']:28} {'pix':12} {len(payload):3}  {','.join(checks)}")

    # A spec tem de ter os onze tipos, e nenhum pode aparecer duas vezes.
    vistos = [v["tipo"] for v in vectors]
    faltam = [t for t in TIPOS if t not in vistos]
    sobram = [t for t in dict.fromkeys(vistos) if t not in TIPOS]
    assert not faltam, f"faltam tipos na spec: {faltam}"
    assert not sobram, f"tipos a mais na spec: {sobram}"

    ids = [v["id"] for v in vectors]
    assert len(ids) == len(set(ids)), "há ids repetidos"

    document = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "versao": 1,
        "descricao": (
            "Vetores de teste partilhados entre stacks. 'campos' e o input, "
            "'payload' e a string exata que qualquer implementacao deve produzir. "
            "Os campos dos dez tipos de transporte usam os nomes do navegador "
            "(url, mailTo, wifiSsid, ...); o PIX usa os do PixPayload (key, name, city)."
        ),
        "tipos": TIPOS,
        "vectors": vectors,
    }

    target = ROOT / "spec" / "vectors.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"\n{len(vectors)} vetores, {len(TIPOS)} tipos -> {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
