"""
Le o QR com logotipo exportado pelo browser, e o SVG ao lado.

    python web/tests/ver-frameqr-nivel3.py <ficheiro.png> <ficheiro.svg> <payload>

Este e o nivel 3: o ficheiro que o utilizador recebe, e nao a matriz que o
encoder produziu. Existe porque e o unico sitio onde se apanha o que o
encoder e o desenho discordam.

O que ja aconteceu por este caminho:

- O logotipo saiu **4 modulos a esquerda**, porque a zona apagada e dada em
  coordenadas do codigo e o canvas desenha a partir da margem. O QR nao mudou,
  por isso **continuava a ler** — o teste de leitura passava, e o desenho
  estava torto. E o pior: um logotipo descentrado nao se chama codigo
  corrompido, chama-se feio, e ninguem reporta.
- O PNG saia com o logotipo e o SVG sem ele: dois ficheiros com o mesmo nome e
  conteudos diferentes, sem nenhum aviso.
"""
import re
import sys
import zxingcpp
from PIL import Image, ImageDraw


def ler(png_path: str, svg_path: str, esperado: str) -> int:
    falhas = []

    # --- O PNG, tal como o utilizador o recebe ---
    img = Image.open(png_path)
    r = zxingcpp.read_barcodes(img)
    lido_png = bytes(r[0].bytes).decode("utf-8", "replace") if r and getattr(r[0], "bytes", None) else (r[0].text if r else None)
    if lido_png == esperado:
        print(f"  ok  o ZXing le o PNG exportado: {lido_png[:40]!r}")
    else:
        falhas.append(f"o PNG com logotipo nao le: {lido_png!r}")
        print(f"  FALHA  o PNG com logotipo leu {lido_png!r}")

    # --- O SVG, reconstruido a partir dos seus rects ---
    texto = open(svg_path, encoding="utf-8").read()

    if "<image" not in texto:
        falhas.append("o SVG nao tem logotipo nenhum")
        print("  FALHA  o SVG nao leva o logotipo")
    else:
        viewbox = re.search(r'viewBox="([\d\. ]+)"', texto).group(1).split()
        largura, altura = float(viewbox[2]), float(viewbox[3])
        esc = 6
        img2 = Image.new("L", (int(largura * esc), int(altura * esc)), 255)
        d = ImageDraw.Draw(img2)
        for x, y in re.findall(r"M([\d\.]+),([\d\.]+)h1v1h-1z", texto):
            d.rectangle(
                [
                    float(x) * esc,
                    float(y) * esc,
                    (float(x) + 1) * esc - 1,
                    (float(y) + 1) * esc - 1,
                ],
                fill=0,
            )
        r2 = zxingcpp.read_barcodes(img2)
        lido_svg = bytes(r2[0].bytes).decode("utf-8", "replace") if r2 and getattr(r2[0], "bytes", None) else (r2[0].text if r2 else None)
        if lido_svg == esperado:
            print(f"  ok  o ZXing le o SVG exportado: {lido_svg[:40]!r}")
        else:
            falhas.append(f"o SVG com logotipo nao le: {lido_svg!r}")
            print(f"  FALHA  o SVG leu {lido_svg!r}")

    print()
    if falhas:
        for f in falhas:
            print("  -", f)
        return 1

    print("O PNG e o SVG exportados pelo browser leem-se, e o SVG leva o logotipo.")
    return 0


if __name__ == "__main__":
    sys.exit(ler(sys.argv[1], sys.argv[2], sys.argv[3]))
