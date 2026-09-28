"""
Le a varredura e diz ate onde o logotipo pode chegar.

    node web/tests/varredura-frameqr.mjs
    python web/tests/analisar-frameqr.py

O que sai daqui e a unica base para a tabela de percentagens de `frameqr.js`.
A tabela estava escrita com os valores teoricos da correccao de erros (4/8/14/24
por cento) e a medicao mostra que sao optimistic demais para QR pequeno: um QR de
25x25 a nivel M aguentava 2,7% e nao 8%.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import defaultdict
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
        ["node", str(RAIZ / "web" / "tests" / "varredura-frameqr.mjs")],
        capture_output=True,
        check=True,
    )


def renderizar(caso: dict) -> Image.Image:
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

    # O que interessa medir: para cada nivel, o maior logotipo que le, e o
    # limite em percentagem que esse tamanho corresponde no QR mais pequeno.
    # E o mais pequeno que manda, porque e o pior caso de quem vai imprimir.
   #
    # Guarda-se tambem o melhor caso, para se ver a dispersao. A diferenca
    # entre os dois e que nao ha um unico numero: a leitura depende de onde
    # os modulos caem.
    #
    # O caminho critico e sempre o QR **mais pequeno** de cada nivel, porque e
    # nele que a correccao de erros tem menos codewords para trabalhar.

    por_nivel: dict[str, list[dict]] = defaultdict(list)
    for caso in casos:
        por_nivel[caso["ecl"]].append(caso)

    print()
    print("  nivel  pior caso (QR mais pequeno)      melhor caso     teorico")
    print("  " + "-" * 68)

    worst: dict[str, float] = {}
    best: dict[str, float] = {}

    teoricos = {"L": 4, "M": 8, "Q": 14, "H": 24}

    for nivel in ["L", "M", "Q", "H"]:
        do_nivel = por_nivel.get(nivel)
        if not do_nivel:
            continue

        # O QR mais pequeno, por payload: cada payload escolhe a sua versao.
        menor = min(do_nivel, key=lambda c: c["size"])
        do_menor = [c for c in do_nivel if c["size"] == menor["size"]]

        maior_logo = -1
        maior_pct = 0.0
        for caso in sorted(do_menor, key=lambda c: c["modulosPedidos"]):
            lidos = zxingcpp.read_barcodes(renderizar(caso))
            if lidos and lidos[0].text == caso["payload"]:
                maior_logo = caso["modulosPedidos"]
                maior_pct = caso["percentagem"]

        # O melhor caso, em qualquer QR, so para ver a dispersao.
        pct_max = 0.0
        for caso in sorted(do_nivel, key=lambda c: c["modulosPedidos"]):
            lidos = zxingcpp.read_barcodes(renderizar(caso))
            if lidos and lidos[0].text == caso["payload"]:
                pct_max = max(pct_max, caso["percentagem"])

        worst[nivel] = maior_pct
        best[nivel] = pct_max

        print(
            f"  {nivel:<6} {maior_pct:>6.2f}%  logo {maior_logo:>2} mod "
            f"(v{menor['version']}, {menor['size']}x{menor['size']})   "
            f"{pct_max:>6.2f}%   {teoricos[nivel]}%"
        )

    print()
    print("  A tabela de frameqr.js deve usar o pior caso, arredondado para baixo:")
    for nivel in ["L", "M", "Q", "H"]:
        if nivel in worst:
            print(f"    {nivel}: {worst[nivel]:.2f}%  ->  {int(worst[nivel])}%")

    JSON.unlink(missing_ok=True)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
