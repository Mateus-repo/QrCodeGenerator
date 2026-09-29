"""qrcli — interface de linha de comandos.

    python -m cli.qrcli tipos
    python -m cli.qrcli payload link --url exemplo.pt -o site.png
    python -m cli.qrcli payload wifi --ssid "Rede Casa" --senha segredo123
    python -m cli.qrcli pix --key 529.982.247-25 --name "Ana Silva" \
        --city "Belo Horizonte" --amount 25,75 -o pix.png
    python -m cli.qrcli pix-leer "00020126...63041D3D"

## Os dois comandos, e porque o PIX não é um `--tipo`

O PIX tem validação própria, um `parse` que o relê, e um CRC que se pode
recalcular. **`pix`, `pix-leer` e `fix-crc` existem para isso**, e um
`payload --tipo pix --chave ...` seria uma segunda porta para a mesma coisa com
metade das capacidades.

Os outros dez são transporte — o formato não impõe nada sobre o conteúdo — e por
isso que `payload` chega. **A validação é a mesma de sempre**, a de
`qrcode_core.validacao`, e a mensagem que sai é a mesma que a interface web
mostra: uma pessoa que use os dois não pode ver duas palavras diferentes para o
mesmo erro.

## A tabela dos campos, e por que ela está aqui

`TIPOS` é a **terceira** escrita do mesmo conjunto de campos — a primeira é
`web/payloads/types.js` e a segunda são os `defaultValue` da interface. Duas
listas do mesmo conjunto divergem em silêncio, e o `formatos.test.mjs` do
navegador já é o que apanha esse caso; o `paridade-python.mjs` compara agora
esta tabela com a do navegador e falha se aparecer uma chave que o web não
conhece, ou uma categoria que o web tem e esta não.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qrcode_core import (  # noqa: E402
    CATEGORY_IDS,
    EccLevel,
    PixError,
    UrlError,
    build,
    build_pix,
    parse,
    to_png,
    to_svg,
    validate,
)
from qrcode_core.pix import PixPayload, key_type  # noqa: E402

#: Os dez tipos de transporte: opção, ajuda, e os campos.
#:
#: **A chave do dicionário é a categoria do navegador** e o segundo elemento de
#: cada campo é **a chave do campo no navegador**. É essa correspondência que o
#: teste de paridade verifica, e é a razão de os campos estarem por extenso em
#: vez de derivarem do rótulo: uma opção `--ssid` que escrevesse `ssid` em vez
#: de `wifiSsid` produzia um `WIFI:S:` vazio sem erro nenhum.
#:
#: O terceiro elemento diz se o campo é uma caixa de selecção, e o quarto o
#: valor por omissão — que é o mesmo de `emptyFields` no navegador.
TIPOS: dict[str, dict] = {
    "link": {
        "ajuda": "abre um site",
        "campos": [("--url", "url", "endereço; o https é acrescentado se faltar")],
    },
    "texto": {
        "ajuda": "texto simples",
        "campos": [("--texto", "texto", "o que quiser")],
    },
    "email": {
        "ajuda": "abre um rascunho de email",
        "campos": [
            ("--para", "mailTo", "destinatário"),
            ("--assunto", "mailSubject", "assunto"),
            ("--corpo", "mailBody", "corpo da mensagem"),
        ],
    },
    "telefone": {
        "ajuda": "liga para um número",
        "campos": [
            ("--numero", "phoneNumber", "número"),
            ("--indicativo", "phonePrefix", "indicativo, ex.: +351"),
        ],
    },
    "sms": {
        "ajuda": "abre um rascunho de SMS",
        "campos": [
            ("--numero", "phoneNumber", "número"),
            ("--indicativo", "phonePrefix", "indicativo, ex.: +351"),
            ("--mensagem", "smsMessage", "texto; sem acentos nem caracteres fora do GSM 03.38"),
        ],
    },
    "whatsapp": {
        "ajuda": "abre uma conversa no WhatsApp",
        "campos": [
            ("--numero", "phoneNumber", "número"),
            ("--indicativo", "phonePrefix", "indicativo, ex.: +351"),
            ("--mensagem", "waMessage", "texto inicial (opcional)"),
        ],
    },
    "evento": {
        "ajuda": "convite para o calendário",
        "campos": [
            ("--titulo", "eventTitle", "o que é"),
            ("--inicio", "eventStart", "AAAA-MM-DDTHH:MM"),
            ("--fim", "eventEnd", "AAAA-MM-DDTHH:MM"),
            ("--local", "eventLocation", "onde"),
            ("--descricao", "eventDescription", "mais detalhe"),
        ],
    },
    "localizacao": {
        "ajuda": "abre um mapa num ponto",
        "campos": [
            ("--lat", "geoLat", "latitude, ex.: 38.7223"),
            ("--lng", "geoLng", "longitude, ex.: -9.1393"),
        ],
    },
    "wifi": {
        "ajuda": "liga-se a uma rede sem escrever a password",
        "campos": [
            ("--ssid", "wifiSsid", "nome da rede"),
            ("--seguranca", "wifiSec", "WPA/WPA2, WEP ou Aberto", "WPA/WPA2"),
            ("--senha", "wifiPass", "a password, se a rede não for aberta"),
            ("--oculta", "wifiHidden", "a rede não aparece na lista", False, "caixa"),
        ],
    },
    "vcard": {
        "ajuda": "contacto que se pode importar",
        "campos": [
            ("--nome", "vcFirstName", "nome próprio"),
            ("--apelido", "vcLastName", "apelido"),
            ("--empresa", "vcOrg", "organização"),
            ("--cargo", "vcRole", "cargo"),
            ("--telefone", "vcPhone", "telemóvel"),
            ("--telefone2", "vcPhone2", "fixo"),
            ("--email", "vcEmail", "email"),
            ("--rua", "vcStreet", "morada"),
            ("--cidade", "vcCity", "localidade"),
            ("--codigo", "vcZip", "código postal"),
            ("--pais", "vcCountry", "país"),
        ],
    },
}


def _campos_de(tipo: str) -> list[dict]:
    """Os campos do tipo, normalizados, para construir o `argparse`."""
    saida = []
    for campo in TIPOS[tipo]["campos"]:
        opcao, chave, ajuda = campo[0], campo[1], campo[2]
        omissao = campo[3] if len(campo) > 3 else None
        e_caixa = len(campo) > 4 and campo[4] == "caixa"
        saida.append(
            {
                "opcao": opcao,
                "chave": chave,
                "ajuda": ajuda,
                "omissao": omissao,
                "caixa": e_caixa,
            }
        )
    return saida


def _cmd_tipos(args: argparse.Namespace) -> int:
    print("tipos de payload:")
    for tipo in CATEGORY_IDS:
        if tipo == "pix":
            print("  pix          o comando `pix`, com validação própria")
            continue
        campos = ", ".join(c["opcao"] for c in _campos_de(tipo))
        print(f"  {tipo:12} {TIPOS[tipo]['ajuda']}")
        print(f"  {'':12}   {campos}")
    return 0


def _cmd_payload(args: argparse.Namespace) -> int:
    tipo = args.tipo
    campos: dict = {}

    for campo in _campos_de(tipo):
        if campo["caixa"]:
            campos[campo["chave"]] = bool(getattr(args, campo["chave"], False))
        else:
            campos[campo["chave"]] = getattr(args, campo["chave"], None) or ""

    erro = validate(tipo, campos)
    if erro is not None:
        print(f"erro: {erro}", file=sys.stderr)
        return 1

    payload = build(tipo, campos)
    ecc = EccLevel(args.ecc)

    print(payload)
    print(f"{tipo}: {len(payload)} caracteres | ECC {ecc.value}", file=sys.stderr)

    if args.out:
        if args.format == "svg":
            dados = to_svg(payload, scale=args.scale, ecc=ecc)
        else:
            dados = to_png(payload, scale=args.scale, ecc=ecc)
        Path(args.out).write_bytes(dados)
        print(f"-> {args.out}", file=sys.stderr)

    return 0


def _cmd_pix(args: argparse.Namespace) -> int:
    payload = PixPayload(
        key=args.key,
        name=args.name,
        city=args.city,
        amount=args.amount,  # PixPayload coage "25,75" -> Decimal
        txid=args.txid or "***",
        description=args.description or "",
        postcode=args.postcode or "",
        single_use=args.single_use,
    )

    brcode = build_pix(payload)
    ecc = EccLevel(args.ecc)
    print(brcode)
    print(f"chave: {key_type(args.key)} | {len(brcode)} bytes | ECC {ecc.value}", file=sys.stderr)

    if args.out:
        if args.format == "svg":
            data = to_svg(brcode, scale=args.scale, ecc=ecc)
        else:
            data = to_png(brcode, scale=args.scale, ecc=ecc)
        Path(args.out).write_bytes(data)
        print(f"-> {args.out}", file=sys.stderr)
    return 0


def _cmd_pix_ler(args: argparse.Namespace) -> int:
    parsed = parse(args.payload)
    p = parsed.payload

    print(f"CRC válido: {'sim' if parsed.crc_valid else 'NÃO — use `pix --fix-crc'}")
    print(f"chave:    {p.key}  ({key_type(p.key)})")
    print(f"nome:     {p.name}")
    print(f"cidade:   {p.city}")
    print(f"valor:    {p.amount if p.amount is not None else '(o pagador escolhe)'}")
    print(f"txid:     {p.txid}")
    if p.description:
        print(f"descrição: {p.description}")
    if p.postcode:
        print(f"CEP:      {p.postcode}")
    if p.single_use:
        print("uso:      único (campo 01 = 12)")
    if parsed.url:
        print(f"URL:      {parsed.url}  (PIX dinâmico — consulta no servidor)")
    return 0 if parsed.crc_valid else 2


def _cmd_fix_crc(args: argparse.Namespace) -> int:
    from qrcode_core import fix_crc

    print(fix_crc(args.payload))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="qrcli", description="Gerador de QR codes")
    sub = parser.add_subparsers(dest="command", required=True)

    tipos_cmd = sub.add_parser("tipos", help="lista os tipos de payload")
    tipos_cmd.set_defaults(func=_cmd_tipos)

    payload_cmd = sub.add_parser("payload", help="gera um QR de transporte")
    sub_tipos = payload_cmd.add_subparsers(dest="tipo", required=True)

    for tipo in TIPOS:
        t = sub_tipos.add_parser(tipo, help=TIPOS[tipo]["ajuda"])
        for campo in _campos_de(tipo):
            if campo["caixa"]:
                t.add_argument(campo["opcao"], dest=campo["chave"], action="store_true",
                               help=campo["ajuda"])
            else:
                t.add_argument(campo["opcao"], dest=campo["chave"],
                               default=campo["omissao"], help=campo["ajuda"])
        t.add_argument("-o", "--out", help="ficheiro de saída")
        t.add_argument("--format", choices=("png", "svg"), default="png")
        t.add_argument("--scale", type=int, default=8)
        t.add_argument("--ecc", choices=[e.value for e in EccLevel], default=EccLevel.M.value)
        t.set_defaults(func=_cmd_payload)

    pix_cmd = sub.add_parser("pix", help="gera um QR PIX estático")
    pix_cmd.add_argument("--key", required=True, help="CPF, CNPJ, +55, email ou UUID")
    pix_cmd.add_argument("--name", required=True, help="nome do recebedor (max. 25)")
    pix_cmd.add_argument("--city", required=True, help="cidade (max. 15)")
    pix_cmd.add_argument("--amount", help="valor, ex.: 25,75 (opcional)")
    pix_cmd.add_argument("--txid", help="identificador da transação (max. 25, A-Z0-9)")
    pix_cmd.add_argument("--description", help="campo opcional 26.02")
    pix_cmd.add_argument("--postcode", help="CEP (campo 61)")
    pix_cmd.add_argument("--single-use", action="store_true", help="QR de uso único")
    pix_cmd.add_argument("-o", "--out", help="ficheiro de saída")
    pix_cmd.add_argument("--format", choices=("png", "svg"), default="png")
    pix_cmd.add_argument("--scale", type=int, default=8)
    pix_cmd.add_argument("--ecc", choices=[e.value for e in EccLevel], default=EccLevel.M.value)
    pix_cmd.set_defaults(func=_cmd_pix)

    read_cmd = sub.add_parser("pix-leer", help="lê e valida um PIX copia e cola")
    read_cmd.add_argument("payload")
    read_cmd.set_defaults(func=_cmd_pix_ler)

    fix_cmd = sub.add_parser("fix-crc", help="recalcula o CRC de um payload")
    fix_cmd.add_argument("payload")
    fix_cmd.set_defaults(func=_cmd_fix_crc)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except PixError as exc:
        print(f"erro: {exc}", file=sys.stderr)
        return 1
    except UrlError as exc:
        # **O `UrlError` é um `ValueError` e o `PixError` também**, mas a
        # mensagem de um link é sobre esquemas e a de um PIX é sobre chaves. Deixá-la
        # apanhar no `except` de cima dava "erro de PIX" a quem só escreveu um
        # link, que é um erro que não ajuda ninguém.
        print(f"erro: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
