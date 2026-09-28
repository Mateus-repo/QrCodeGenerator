"""Interoperabilidade: o que o encoder JS produz é lido por leitores reais.

    node web/tests/cross-check.mjs
    python web/tests/descodificar.py

Porquê não comparar módulo a módulo com outra biblioteca: a escolha da máscara
e o enchimento dos bytes finais são decisões da implementação, não da norma.
Duas bibliotecas podem gerar matrizes diferentes para o mesmo conteúdo e ambas
serem corretas. O que tem de ser igual é o **texto lido**.

Este é o teste que apanha bugs reais — foi ele que encontrou a máscara 4 com x
e y trocados, que produzia um QR que nenhum leitor conseguia decodificar.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # web/
CROSSCHECK = ROOT / ".crosscheck"
SCALE = 4
BORDER = 4


def render(modules: list[list[int]]):
    """Matriz de módulos -> imagem, com a zona silenciosa de 4 módulos."""
    from PIL import Image

    size = len(modules)
    dimension = (size + BORDER * 2) * SCALE
    image = Image.new("L", (dimension, dimension), 255)
    pixels = image.load()

    for y, row in enumerate(modules):
        for x, dark in enumerate(row):
            if not dark:
                continue
            for dy in range(SCALE):
                for dx in range(SCALE):
                    pixels[(x + BORDER) * SCALE + dx, (y + BORDER) * SCALE + dy] = 0

    return image


def main() -> int:
    import zxingcpp

    manifest_path = CROSSCHECK / "manifest.json"
    if not manifest_path.exists():
        print("manifest.json não encontrado. Corre primeiro: node web/tests/cross-check.mjs")
        return 1

    cases = json.loads(manifest_path.read_text("utf-8"))
    failures = []

    for case in cases:
        image = render(case["modulos"])

        # Plain, não HRI: o HRI reescreve caracteres de controlo como <NUL>,
        # o que faria o texto parecer diferente quando está certo.
        result = zxingcpp.read_barcode(
            image,
            formats=zxingcpp.BarcodeFormat.QRCode,
            text_mode=zxingcpp.TextMode.Plain,
        )

        if result is None:
            # Um payload vazio produz um QR sem texto; o leitor pode devolver
            # None em vez de um resultado com string vazia.
            if case["texto"] == "":
                print(f"  ok     {case['nome']:<34} v{case['versao']:>2} (vazio, lido sem texto)")
                continue
            failures.append((case["nome"], "o ZXing não leu a imagem"))
            print(f"  FALHA  {case['nome']:<34} não legível (v{case['versao']}, máscara {case['mascara']})")
            continue

        if result.text != case["texto"]:
            failures.append(
                (
                    case["nome"],
                    f"texto diferente\n       esperado: {case['texto'][:70]!r}\n       obtido:   {result.text[:70]!r}",
                )
            )
            print(f"  FALHA  {case['nome']:<34} texto diferente")
            continue

        print(
            f"  ok     {case['nome']:<34} v{case['versao']:>2} "
            f"máscara {case['mascara']} · {len(case['texto']):>4} chars"
        )

    print()
    if failures:
        print(f"{len(failures)} de {len(cases)} falharam:")
        for name, reason in failures:
            print(f"  - {name}: {reason}")
        return 1

    print(f"Todas as {len(cases)} matrizes geradas pelo encoder JS são legíveis pelo ZXing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
