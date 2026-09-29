"""
Le com o ZXing o Data Matrix e o GS1 DataMatrix que o **browser** exportou.

Este e' o nivel 3: o ficheiro que o utilizador recebe, e nao a matriz que o
encoder produziu. E' o que apanha o que o encoder e o desenho discordam.

Para o Data Matrix o que se verifica sao tres coisas, e as tres importam:

  - **O PNG le-se.** A escala que o browser escolheu tem de ser suficiente. Um
    Data Matrix e' uma grelha densa e as guias tracejadas sao as primeiras a
    falhar quando a escala e' pequena.
  - **O SVG le-se, e le o mesmo.** O SVG tem o seu proprio sistema de coordenadas,
    em modulos, e converter a escala de pixeis para modulos a mao e' o caminho
    mais curto para os dois ficheiros deixarem de ser o mesmo codigo. A regra do
    repositorio e' passar a mesma matriz aos dois.
  - **O GS1 DataMatrix e' reconhecido como GS1**, com ``]d2`` e os separadores
    ``0x1D`` nos bytes. Um Data Matrix normal da ``]d1``, e a diferenca entre os
    dois e' o FNC1 - que e' a unica coisa que o GS1 acrescenta.

    python web/tests/ver-datamatrix-nivel3.py <ficheiro.png> <formato> <payload>

``formato`` e' ``datamatrix`` ou ``gs1-datamatrix``. O ``payload`` e' o que o
utilizador escreveu, e o que o leitor devolve tem de bater com ele.

O SVG e' reconstruido a partir dos seus ``<rect>``, e nao renderizado - nao ha
motor de SVG aqui. Um Data Matrix e' um ``<rect>`` por modulo escuro, entao a
reconstrucao e' exacta, com a escala que o SVG declara no ``viewBox``.
"""

from __future__ import annotations

import re
import sys

import zxingcpp
from PIL import Image, ImageDraw

# Quantos pixeis por modulo na reconstrucao do SVG. O ZXing le um Data Matrix a
# esta escala sem dificuldade, e a 2 ja falha nas guias tracejadas.
ESCALA_SVG = 6

ZONA = 2


def png(caminho: str):
    """Le o PNG e devolve (texto, bytes, identificador, tipo)."""
    imagem = Image.open(caminho).convert("L")
    lidos = zxingcpp.read_barcodes(imagem)
    if not lidos:
        return None
    c = lidos[0]
    return (
        c.text,
        bytes(c.bytes) if getattr(c, "bytes", None) else b"",
        c.symbology_identifier,
        str(c.content_type).replace("ContentType.", ""),
    )


def svg(caminho: str):
    """Reconstroi a imagem a partir dos rects do SVG, e le-a."""
    texto = open(caminho, encoding="utf-8").read()

    viewbox = re.search(r'viewBox="([\d\. ]+)"', texto)
    if not viewbox:
        return None, "o SVG nao tem viewBox"
    lado = float(viewbox.group(1).split()[2])

    img = Image.new("L", (int(lado * ESCALA_SVG), int(lado * ESCALA_SVG)), 255)
    desenho = ImageDraw.Draw(img)

    rects = re.findall(r'<rect x="([\d\.]+)" y="([\d\.]+)" width="1" height="1"/>', texto)
    if not rects:
        return None, "o SVG nao tem nenhum rect de modulo"

    for x, y in rects:
        x0 = float(x) * ESCALA_SVG
        y0 = float(y) * ESCALA_SVG
        desenho.rectangle([x0, y0, x0 + ESCALA_SVG - 1, y0 + ESCALA_SVG - 1], fill=0)

    return img, f"{len(rects)} modulos escuros"


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2

    caminho_png, formato, esperado = sys.argv[1], sys.argv[2], sys.argv[3]
    caminho_svg = caminho_png[:-4] + ".svg"

    gs1 = formato == "gs1-datamatrix"
    identificador_esperado = "]d2" if gs1 else "]d1"
    tipo_esperado = "GS1" if gs1 else "Text"

    problemas = []

    # --- O PNG ---
    lido = png(caminho_png)
    if lido is None:
        problemas.append("o ZXing nao leu o PNG exportado")
    else:
        texto, bytes_lidos, identificador, tipo = lido
        print(f"  PNG  texto={texto!r}")
        print(f"       {identificador} {tipo} bytes={bytes_lidos!r}")
        if identificador != identificador_esperado:
            problemas.append(f"identificador {identificador!r} em vez de {identificador_esperado!r}")
        if tipo != tipo_esperado:
            problemas.append(f"content_type {tipo!r} em vez de {tipo_esperado!r}")
        if texto != esperado:
            problemas.append(f"texto {texto!r} em vez de {esperado!r}")

    # --- O SVG ---
    imagem, info = svg(caminho_svg)
    if imagem is None:
        problemas.append(f"o SVG: {info}")
    else:
        lidos = zxingcpp.read_barcodes(imagem)
        if not lidos:
            problemas.append(f"o ZXing nao leu o SVG ({info})")
        else:
            c = lidos[0]
            print(f"  SVG  texto={c.text!r}  ({info})")
            if c.symbology_identifier != identificador_esperado:
                problemas.append(
                    f"o SVG da {c.symbology_identifier!r} em vez de {identificador_esperado!r}"
                )
            if c.text != esperado:
                problemas.append(f"o SVG leu {c.text!r} em vez de {esperado!r}")

    print()
    if problemas:
        for p in problemas:
            print("  -", p)
        return 1

    print("  O PNG e o SVG exportados pelo browser leem-se, e sao o mesmo codigo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
