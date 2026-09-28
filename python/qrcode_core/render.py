"""Geração de imagem a partir de um payload.

Deliberadamente minimalista: uma função que recebe uma string e devolve PNG ou
SVG. As outras stacks implementam o mesmo contrato (`docs/TIPOS-QR.md`).
"""

from __future__ import annotations

import io
from enum import Enum

import segno


class EccLevel(str, Enum):
    """Nível de correção de erro. L = mais capacidade, H = mais robustez."""

    L = "L"
    M = "M"
    Q = "Q"
    H = "H"


#: Capacidade máxima em modo byte, por nível de correção (ISO/IEC 18004).
MAX_BYTES = {
    EccLevel.L: 2953,
    EccLevel.M: 2331,
    EccLevel.Q: 1663,
    EccLevel.H: 1273,
}


class CapacityError(ValueError):
    """O payload não cabe num QR code com as opções escolhidas."""


def check_capacity(payload: str, ecc: EccLevel = EccLevel.M) -> int:
    """Valida o tamanho do payload e devolve a capacidade máxima.

    O QR tem mais de 40 versões; o limite real depende do modo de codificação.
    Usamos o modo byte (UTF-8), que é o pior caso para texto com acentos.
    """
    used = len(payload.encode("utf-8"))
    limit = MAX_BYTES[ecc]
    if used > limit:
        raise CapacityError(
            f"O conteúdo ocupa {used} bytes e o limite com ECC {ecc.value} é {limit}."
        )
    return limit


def _make(payload: str, ecc: EccLevel):
    check_capacity(payload, ecc)
    return segno.make(payload, error=ecc.value, micro=False)


def to_png(
    payload: str,
    scale: int = 8,
    border: int = 4,
    ecc: EccLevel = EccLevel.M,
    dark: str = "black",
    light: str = "white",
) -> bytes:
    """Devolve o QR em PNG (requer Pillow)."""
    qr = _make(payload, ecc)
    buffer = io.BytesIO()
    qr.save(buffer, kind="png", scale=scale, border=border, dark=dark, light=light)
    return buffer.getvalue()


def to_svg(
    payload: str,
    scale: int = 8,
    border: int = 4,
    ecc: EccLevel = EccLevel.M,
    dark: str = "black",
    light: str = "white",
) -> bytes:
    """Devolve o QR em SVG (não requer Pillow)."""
    qr = _make(payload, ecc)
    buffer = io.BytesIO()
    qr.save(buffer, kind="svg", scale=scale, border=border, dark=dark, light=light)
    return buffer.getvalue()


def to_matrix(payload: str, ecc: EccLevel = EccLevel.M) -> list[list[bool]]:
    """Matriz de módulos (True = escuro). Útil para testes e render manual."""
    qr = _make(payload, ecc)
    return [list(row) for row in qr.matrix]
