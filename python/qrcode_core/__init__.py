"""qrcode_core — payloads e geração de QR codes.

Por agora só o tipo PIX está implementado. Os restantes tipos entram aqui
seguindo a ordem de `docs/TODO.md`.
"""

from .pix import (
    PixError,
    PixKeyError,
    PixPayload,
    PixValidationError,
    build,
    crc16,
    crc16_hex,
    fix_crc,
    key_type,
    normalize_key,
    parse,
    validate_key,
)
from .render import (
    MAX_BYTES,
    CapacityError,
    EccLevel,
    check_capacity,
    to_matrix,
    to_png,
    to_svg,
)

__all__ = [
    "PixError",
    "PixKeyError",
    "PixPayload",
    "PixValidationError",
    "build",
    "crc16",
    "crc16_hex",
    "fix_crc",
    "key_type",
    "normalize_key",
    "parse",
    "validate_key",
    "MAX_BYTES",
    "CapacityError",
    "EccLevel",
    "check_capacity",
    "to_matrix",
    "to_png",
    "to_svg",
]
