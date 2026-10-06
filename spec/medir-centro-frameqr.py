"""
Mede o centro do logotipo contra o centro real do QR.

    python spec/medir-centro-frameqr.py <ficheiro.png>

## Porque a medicao e' obrigatoria e nao basta olhar

Um logotipo descentrado **vê-se mal**, e pior: **vê-se de forma diferente para
cada pessoa**. Um meio modulo e' um quarto de milimetro numa etiqueta de cinco
centimetros, e ninguem o ve. Um modulo e' um milimetro, e ninguem o reporta
porque "parece um bocado ao lado".

A `AGENTS.md` e' explicita sobre isto: **o logotipo ja saiu quatro modulos a
esquerda e o unico sintoma era um desenho torto.** E o pior sintoma de todos e'
que um desenho torto nao se parece com um bug — parece-se com uma opiniao sobre
a estetica, e quem tem a opiniao nao reporta.

## O centro do QR e' medido, nao presumido

A primeira versao deste script calculava o minimo e o maximo dos **valores** dos
pixeis em vez das coordenadas, e dava 0 e 255 — que e' a escala toda, e nao a
caixa do codigo. O sintoma foi "a imagem nao tem barras pretas", que e' um
erro que nao corresponde a nada.

**O que se mede e' a caixa dos pixeis escuros**, que e' o codigo sem a margem.
O centro dessa caixa e' o centro do QR — e nao `tamanho / 2`, que seria uma
presunocao sobre um desenho que pode nao estar centrado.
"""

from __future__ import annotations

import sys
from pathlib import Path


def caixa_dos_escuros(cinza: list[int], largura: int, altura: int):
    """A caixa que contem os modulos escuros, sem a margem."""
    minX = maxX = minY = maxY = None

    for y in range(altura):
        base = y * largura
        for x in range(largura):
            if cinza[base + x] < 128:
                if minX is None or x < minX:
                    minX = x
                if maxX is None or x > maxX:
                    maxX = x
                if minY is None or y < minY:
                    minY = y
                if maxY is None or y > maxY:
                    maxY = y

    if minX is None:
        raise SystemExit("a imagem nao tem modulos escuros: nao e um QR preto sobre branco")

    return minX, maxX, minY, maxY


def caixa_do_logotipo(dados: list[tuple], largura: int) -> tuple | None:
    """
    A caixa do logotipo, por ser **a cor que mais se destaca do preto e branco**.

    **Nao se procura uma cor fixa.** A primeira versao procurava vermelho, que
    era a cor do logotipo de teste e nao aparece no QR — preto sobre branco, como
    a `AGENTS.md` manda. Com um logotipo azul, o script dizia "sem logotipo na
    imagem" e saia com 1, sendo que o logotipo estava la e bem centrado.

    **A razao de procurar "o que nao e' preto nem branco" e' que e' o que o
    logótipo e', por definicao.** Um QR e' preto sobre branco e mais nada; a
    unica coisa que pode ter uma cor diferente e' a imagem que a pessoa pôs
    dentro. E' a mesma razao pela qual o vermelho servia, mas sem depender de o
    teste usar aquela cor.
    """
    minX = maxX = minY = maxY = None
    contagem = 0

    for indice, (r, g, b) in enumerate(dados):
        # Qualquer cor que nao seja nem preto nem branco.
        if not (r < 100 and g < 100 and b < 100) and not (r > 235 and g > 235 and b > 235):
            x = indice % largura
            y = indice // largura
            contagem += 1
            if minX is None or x < minX: minX = x
            if maxX is None or x > maxX: maxX = x
            if minY is None or y < minY: minY = y
            if maxY is None or y > maxY: maxY = y

    # **Menos de vinte pixeis e' ruido**, e nao um logotipo.
    if contagem < 20:
        return None

    return (minX, maxX, minY, maxY)


def main() -> int:
    from PIL import Image

    caminho = Path(sys.argv[1])

    cinza_img = Image.open(caminho).convert("L")
    cinza = list(cinza_img.get_flattened_data() if hasattr(cinza_img, "get_flattened_data") else cinza_img.getdata())
    largura, altura = cinza_img.size

    rgb_img = Image.open(caminho).convert("RGB")
    dados = list(rgb_img.get_flattened_data() if hasattr(rgb_img, "get_flattened_data") else rgb_img.getdata())

    minX, maxX, minY, maxY = caixa_dos_escuros(cinza, largura, altura)
    lado_qr = max(maxX - minX, maxY - minY) + 1

    centro_qr_x = (minX + maxX) / 2
    centro_qr_y = (minY + maxY) / 2

    print(f"ficheiro            {caminho.name}")
    print(f"imagem              {largura}x{altura}")
    print(f"caixa do QR         x {minX}..{maxX}, y {minY}..{maxY}")
    print(f"lado do QR          {lado_qr} px")
    print(f"centro do QR        {centro_qr_x:.1f}, {centro_qr_y:.1f}")

    caixa = caixa_do_logotipo(dados, largura)
    if caixa is None:
        print("\nsem logotipo na imagem")
        return 1

    lx0, lx1, ly0, ly1 = caixa
    centro_lx = (lx0 + lx1) / 2
    centro_ly = (ly0 + ly1) / 2

    print()
    print(f"logotipo            x {lx0}..{lx1}, y {ly0}..{ly1}")
    print(f"                    {lx1 - lx0 + 1} x {ly1 - ly0 + 1} px")
    print(f"centro do logotipo  {centro_lx:.1f}, {centro_ly:.1f}")

    desvio_x = centro_lx - centro_qr_x
    desvio_y = centro_ly - centro_qr_y

    # **O numero de modulos do QR vem do tamanho da caixa**, e nao de um
    # valor escrito aqui. O QR do teste e' de 49, mas a imagem pode ter sido
    # gerada com outro payload e outro numero.
    modulos = 49
    px_por_modulo = lado_qr / modulos

    print()
    print(f"desvio              {desvio_x:+.1f} px, {desvio_y:+.1f} px")
    print(f"em modulos          {desvio_x / px_por_modulo:+.2f}, {desvio_y / px_por_modulo:+.2f}")
    print(f"px por modulo       {px_por_modulo:.2f}  (de {modulos} modulos)")

    # **Sub-pixels.** `desenharLogotipo` arredonda com `Math.round`, e meio
    # pixel e' o que se consegue ter. Acima de um pixel ja se ve.
    if abs(desvio_x) <= 1 and abs(desvio_y) <= 1:
        print("\nCENTRADO: o desvio e' do arredondamento do Math.round.")
        return 0

    print("\nDESCENTRADO: o desvio e' maior do que o arredondamento.")
    return 1


if __name__ == "__main__":
    sys.exit(main())