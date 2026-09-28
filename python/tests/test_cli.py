"""Testes da linha de comandos."""

import io
import json
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import pytest

from cli.qrcli import main

SPEC = json.loads((Path(__file__).resolve().parents[2] / "spec" / "vectors.json").read_text("utf-8"))


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = main(list(argv))
    return code, out.getvalue(), err.getvalue()


def test_pix_imprime_o_payload_da_spec():
    vector = next(v for v in SPEC["vectors"] if v["id"] == "pix_cpf_com_valor")
    fields = vector["campos"]
    code, out, _ = run(
        "pix",
        "--key", fields["key"],
        "--name", fields["name"],
        "--city", fields["city"],
        "--amount", fields["amount"],
    )
    assert code == 0
    assert out.strip() == vector["payload"]


def test_pix_escreve_png(tmp_path):
    target = tmp_path / "out.png"
    code, _, _ = run(
        "pix", "--key", "529.982.247-25", "--name", "Ana", "--city", "Recife",
        "-o", str(target),
    )
    assert code == 0
    assert target.read_bytes().startswith(b"\x89PNG")


def test_pix_escreve_svg(tmp_path):
    target = tmp_path / "out.svg"
    code, _, _ = run(
        "pix", "--key", "529.982.247-25", "--name", "Ana", "--city", "Recife",
        "--format", "svg", "-o", str(target),
    )
    assert code == 0
    assert b"<svg" in target.read_bytes()[:400]


def test_pix_leer_descreve_os_campos():
    vector = next(v for v in SPEC["vectors"] if v["id"] == "pix_telefone_com_txid")
    code, out, _ = run("pix-leer", vector["payload"])
    assert code == 0
    assert "CRC válido: sim" in out
    assert "+5511966666666" in out
    assert "phone" in out
    assert "pedido123" in out


def test_pix_leer_com_crc_errado_sai_com_codigo_2():
    vector = next(v for v in SPEC["vectors"] if v["id"] == "pix_cnpj")
    broken = vector["payload"][:-4] + "0000"
    code, out, _ = run("pix-leer", broken)
    assert code == 2
    assert "NÃO" in out


def test_fix_crc(capsys):
    vector = next(v for v in SPEC["vectors"] if v["id"] == "pix_cnpj")
    broken = vector["payload"][:-4] + "0000"
    code, out, _ = run("fix-crc", broken)
    assert code == 0
    assert out.strip() == vector["payload"]


def test_erro_de_chave_sai_com_codigo_1():
    code, _, err = run("pix", "--key", "nao-e-chave", "--name", "Ana", "--city", "Recife")
    assert code == 1
    assert "Chave PIX inválida" in err
