"""qrcli — interface de linha de comandos.

    python -m cli.qrcli pix --key 529.982.247-25 --name "Ana Silva" \
        --city "Belo Horizonte" --amount 25,75 -o pix.png
    python -m cli.qrcli pix-leer "00020126...63041D3D"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qrcode_core import EccLevel, PixError, build, parse, to_png, to_svg  # noqa: E402
from qrcode_core.pix import PixPayload, key_type  # noqa: E402


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

    brcode = build(payload)
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

    print(f"CRC válido: {'sim' if parsed.crc_valid else 'NÃO — use `pix --fix-crc`'}")
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


if __name__ == "__main__":
    raise SystemExit(main())
