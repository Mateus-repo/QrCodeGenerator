"""
Le com o ZXing os FrameQR que o encoder gerou.

O FrameQR so funciona porque a correccao de erros reconstroi os modulos
apagados, e isso nao se deduce da estrutura: depende de quantos modulos caem e
onde. A razao importa tanto como a quantidade — dois modulos vizinhos na mesma
linha de codeword custam o dobro de dois espalhados.

Este script e o unico que responde a pergunta que interessa: **ate que tamanho
de logo e seguro?** Nao ha resposta teorica, ha resposta medida.

    node web/tests/gerar-frameqr.mjs
    python web/tests/descodificar-frameqr.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".frameqr.json"

ESCALA = 3
ZONA_MUDA = 4


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(RAIZ / "web" / "tests" / "gerar-frameqr.mjs")],
        capture_output=True,
        check=True,
    )


def renderizar(caso: dict) -> Image.Image:
    """
    Desenha a matriz como um quadrado de modulos.

    A imagem **tem** de ser quadrada, com a zona muda em volta. A primeira
    versao usava uma altura fixa de 40 modulos, que num QR de 25 esticava os
    modulos na vertical: a imagem saia 99x120, o leitor perdia a grelha, e o
    resultado era "nao leu nada" com um QR perfeitamente bom.
    """
    modulos = caso["modules"]
    lado = len(modulos)
    px = (lado + ZONA_MUDA * 2) * ESCALA

    img = Image.new("L", (px, px), 255)
    desenho = ImageDraw.Draw(img)

    for y, linha in enumerate(modulos):
        for x, modulo in enumerate(linha):
            if not modulo:
                continue
            x0 = (x + ZONA_MUDA) * ESCALA
            y0 = (y + ZONA_MUDA) * ESCALA
            desenho.rectangle([x0, y0, x0 + ESCALA - 1, y0 + ESCALA - 1], fill=0)

    return img


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))

    controlos: list[dict] = []
    recomendados: list[dict] = []
    falhados: list[dict] = []

    for caso in casos:
        lidos = zxingcpp.read_barcodes(renderizar(caso))
        ok = bool(lidos) and lidos[0].text == caso["payload"]

        if caso.get("controlo"):
            controlos.append(caso)
            if not ok:
                # Um QR sem zona apagada que nao le significa que o problema
                # esta no renderizador deste script, nao no FrameQR. Sem esta
                # separacao, a primeira versao deste ficheiro acusou o encoder
                # de uma falha que era do proprio teste.
                print("  O CONTROLO nao leu: o problema esta no renderizador, nao no FrameQR.")
                return 2
        elif not ok:
            falhados.append(caso)
        else:
            recomendados.append(caso)

    # O que interessa: o logótipo que a aplicação recomenda, lido por um leitor
    # independente. E a promessa que a interface faz ao utilizador.
    recomendados.sort(key=lambda c: (c["ecl"], len(c["payload"])))

    print()
    print("  nivel  QR          logo  apagados   area    leu")
    print("  " + "-" * 56)
    for caso in recomendados:
        print(
            f"  {caso['ecl']:<6} v{caso['version']:<3} {caso['size']:>3}x{caso['size']:<3} "
            f"{caso['modulosPedidos']:>4}  {caso['modulosApagados']:>8} "
            f"{caso['percentagem']:>6.2f}%   sim"
        )

    JSON.unlink(missing_ok=True)
    print()

    if falhados:
        print("  FALHARAM, e nao deviam:")
        for caso in falhados:
            print(
                f"    ECC {caso['ecl']}  {caso['modulosPedidos']} modulos pedidos, "
                f"{caso['modulosApagados']} apagados de {caso['size']}x{caso['size']} "
                f"(v{caso['version']}), payload de {len(caso['payload'])} caracteres"
            )
        print()
        print("  `modulosMaximos` esta optimistic. Medir com:")
        print("    node web/tests/varredura-frameqr.mjs")
        print("    python web/tests/analisar-frameqr.py")
        return 1

    print(
        f"{len(recomendados)} de {len(recomendados)} logotipos recomendados leem-se, "
        f"e os {len(controlos)} controlos tambem."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
