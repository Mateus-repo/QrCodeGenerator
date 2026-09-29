"""qrcode_core — payloads e geração de QR codes.

    from qrcode_core import build, build_pix, validate, to_png, PixPayload

    build("link", {"url": "exemplo.pt"})        # -> "https://exemplo.pt"
    build_pix(PixPayload(key="...", name="..."))  # -> "00020126..."

## Os dois `build`, e porque são dois

**`build(categoria, campos)` é o ponto de entrada, e é o mesmo que o do
navegador** — `web/payloads/types.js` tem exactamente esta assinatura, e a
paridade entre as stacks começa aqui. Quem chama não sabe nem precisa de saber
que o PIX é o único que tem validação própria e os outros dez que são uma
cadeia de texto.

**`build_pix(payload)` é só o PIX**, porque o `PixPayload` é um `dataclass` com
validação no `__post_init__` e é o que o `parse` devolve. É o mesmo que
`pix.build`, e o nome de topo é o que o `AGENTS.md` pede: duas coisas com
nomes diferentes não podem ter o mesmo nome, porque o que se lê num
`TypeError` tem de dizer qual delas está errada.

**O `render.build` disappeared do topo.** Era o nome do encoder de QR dentro
de `render.py` e nunca chegou a `__all__`; quem o usava importava de lá. Um
`build` que constrói um QR e um `build` que constrói um payload na mesma
importação é um `AttributeError` à espera de acontecer.
"""

from .pix import (
    PixError,
    PixKeyError,
    PixPayload,
    PixValidationError,
)
from .pix import build as build_pix
from .pix import (
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
from .tipos import (
    BUILDERS,
    CATEGORY_IDS,
    UrlError,
    build,
    clean,
    digits_only,
    escape_ical,
    escape_wifi,
    phone,
    phone_prefix,
    to_ascii,
    url_encode,
)
from .validacao import VALIDATORS, validate

__all__ = [
    # O ponto de entrada, igual ao do navegador.
    "build",
    "build_pix",
    "CATEGORY_IDS",
    "BUILDERS",
    "VALIDATORS",
    "validate",
    "UrlError",
    # O PIX.
    "PixError",
    "PixKeyError",
    "PixPayload",
    "PixValidationError",
    "crc16",
    "crc16_hex",
    "fix_crc",
    "key_type",
    "normalize_key",
    "parse",
    "validate_key",
    # O desenho.
    "MAX_BYTES",
    "CapacityError",
    "EccLevel",
    "check_capacity",
    "to_matrix",
    "to_png",
    "to_svg",
    # A normalização, que é partilhada com o `render`.
    "clean",
    "digits_only",
    "escape_ical",
    "escape_wifi",
    "phone",
    "phone_prefix",
    "to_ascii",
    "url_encode",
]
