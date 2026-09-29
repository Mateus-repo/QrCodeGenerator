"""
Le com o ZXing o GS1-128 que o **browser** exportou.

Este e' o nivel 3: o ficheiro que o utilizador recebe, e nao a matriz que o
encoder produziu. Existe porque e' o unico sitio onde se apanha o que o encoder
e o desenho discordam.

Para o GS1-128 o nivel 3 e' menos critico do que foi para o QR com logotipo - o
desenho de um codigo de barras tem uma so dimensao e nao ha coordenadas para
desacertar. Mas nao e' nulo:

  - o canvas e' exportado com a escala que o browser escolheu, e se a escala for
    pequena demais o ZXing recusa um codigo perfectly bom;
  - a legenda vem junto, e um GS1-128 **tem de** ter a linha humana impressa: e'
    o que permite ler a etiqueta sem scanner. Uma legenda que desaparece na
    exportacao nao e' um problema estetico.

    python web/tests/ver-gs1-nivel3.py <ficheiro.png> <payload>

O payload e' o que o utilizador escreveu, com os AIs entre parenteses - a forma
humana, que e' tambem o `text` que o ZXing devolve.
"""

from __future__ import annotations

import sys

import zxingcpp
from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    caminho, esperado = sys.argv[1], sys.argv[2]
    imagem = Image.open(caminho).convert("L")
    lidos = zxingcpp.read_barcodes(imagem)

    if not lidos:
        print(f"  FALHOU o ZXing nao leu o PNG exportado ({imagem.size})")
        return 1

    codigo = lidos[0]
    texto = codigo.text
    identificador = codigo.symbology_identifier
    bytes_lidos = bytes(codigo.bytes) if getattr(codigo, "bytes", None) else b""

    print(f"  {caminho.split(chr(92))[-1]}  {imagem.size[0]}x{imagem.size[1]} px")
    print(f"    texto       {texto!r}")
    print(f"    identificador {identificador!r}")
    print(f"    bytes       {bytes_lidos!r}")

    problemas = []

    if identificador != "]C1":
        problemas.append(
            f"identificador {identificador!r} em vez de ']C1' - o browser exportou "
            f"um Code 128 normal, nao um GS1-128"
        )

    if texto != esperado:
        problemas.append(f"texto {texto!r} em vez de {esperado!r}")

    if problemas:
        print()
        for p in problemas:
            print("  -", p)
        return 1

    print()
    print("  O PNG que o browser exportou le-se, e o ZXing reconhece-o como GS1-128.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
