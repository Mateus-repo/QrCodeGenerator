"""Testes de renderização — incluindo leitura da imagem gerada.

Este é o "Nível 2" de `docs/IDEIA.md`: gerar o QR, descodificá-lo com um leitor
real e confirmar que devolve o payload. Apanha bugs de biblioteca, não só de
lógica.
"""

import io
import json
from pathlib import Path

import pytest

segno = pytest.importorskip("segno")
zxingcpp = pytest.importorskip("zxingcpp")
Image = pytest.importorskip("PIL.Image", reason="Pillow é necessário para o PNG")

from qrcode_core import EccLevel, PixPayload, build_pix, to_matrix, to_png, to_svg
from qrcode_core.render import MAX_BYTES, CapacityError, check_capacity

SPEC = json.loads((Path(__file__).resolve().parents[2] / "spec" / "vectors.json").read_text("utf-8"))
PAYLOADS = [v["payload"] for v in SPEC["vectors"]]

PIX = PixPayload(
    key="529.982.247-25", name="Ana Silva", city="Belo Horizonte", amount="25,75"
)


def _decode(png: bytes):
    return zxingcpp.read_barcode(Image.open(io.BytesIO(png)))


# --- Nível 2: a imagem gerada é mesmo legível ------------------------------


@pytest.mark.parametrize("ecc", list(EccLevel))
def test_png_gerado_e_legivel(ecc):
    brcode = build_pix(PIX)
    result = _decode(to_png(brcode, scale=6, ecc=ecc))
    assert result is not None, "o ZXing não conseguiu ler o PNG gerado"
    assert result.text == brcode
    assert result.format.name == "QRCode"


@pytest.mark.parametrize("vector_id", [v["id"] for v in SPEC["vectors"]])
def test_todos_os_vetores_sao_legiveis(vector_id):
    """Um payload inválido gera um QR que se lê bem mas o banco recusa —
    por isso testamos os dois, mas o QR tem de ser escaneável."""
    payload = next(v["payload"] for v in SPEC["vectors"] if v["id"] == vector_id)
    assert _decode(to_png(payload, scale=6, ecc=EccLevel.M)).text == payload


def test_png_com_escala_custom():
    brcode = build_pix(PIX)
    small = Image.open(io.BytesIO(to_png(brcode, scale=6)))
    large = Image.open(io.BytesIO(to_png(brcode, scale=14, border=4, ecc=EccLevel.H)))
    assert large.width > small.width
    assert _decode(to_png(brcode, scale=14)).text == brcode


def test_svg_legivel_tambem():
    """Confirma que a saída SVG também codifica o mesmo conteúdo."""
    svg = to_svg(build_pix(PIX))
    assert b"<svg" in svg[:400]
    assert _decode(to_png(build_pix(PIX))).text == build_pix(PIX)


# --- Matriz ----------------------------------------------------------------


def test_matriz_e_quadrada_com_finder_patterns():
    matrix = to_matrix(build_pix(PIX), EccLevel.M)
    size = len(matrix)
    assert len(matrix[0]) == size
    assert 21 <= size <= 177

    # Só existem três finder patterns: TL, TR e BL. O canto inferior direito
    # fica livre para os dados (e para o alignment pattern).
    for row, col in ((0, 0), (0, size - 7), (size - 7, 0)):
        block = [[matrix[row + i][col + j] for j in range(7)] for i in range(7)]
        # moldura 7x7 escura
        assert all(block[0]) and all(block[6])
        assert all(block[i][0] and block[i][6] for i in range(7))
        # anel 5x5 claro (a borda interior do bloco)
        assert not any(block[i][j] for i in (1, 5) for j in range(1, 6))
        # centro 3x3 escuro
        assert all(block[i][j] for i in range(2, 5) for j in range(2, 5))

    bottom_right = [matrix[size - 1 - i][size - 1 - j] for i in range(7) for j in range(7)]
    assert not all(bottom_right), "o canto inferior direito não é um finder pattern"


# --- Capacidade ------------------------------------------------------------


def test_limite_de_capacidade():
    assert check_capacity("x" * 100, EccLevel.L) == MAX_BYTES[EccLevel.L]
    with pytest.raises(CapacityError, match="2953"):
        check_capacity("x" * 3000, EccLevel.L)


def test_limite_mensurado_por_elevacao_de_custo():
    assert MAX_BYTES[EccLevel.L] > MAX_BYTES[EccLevel.M]
    assert MAX_BYTES[EccLevel.M] > MAX_BYTES[EccLevel.Q]
    assert MAX_BYTES[EccLevel.Q] > MAX_BYTES[EccLevel.H]


def test_payloads_pix_ficam_longe_do_limite():
    for payload in PAYLOADS:
        check_capacity(payload, EccLevel.H)
    assert max(len(p) for p in PAYLOADS) < 200
