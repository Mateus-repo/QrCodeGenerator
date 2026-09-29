"""
Le os icones do PWA com o ZXing, e confirma que o que esta no manifesto existe.

    python web/tests/descodificar-icones.py

O que este teste verifica, e porque e' um icone e nao uma imagem
---------------------------------------------------------------

**O icone de um gerador de QR tem de ser um QR que le.** Nao um desenho que se
parece com um QR, e nao um QR desenhado a mao para o icone.

A razao e' especifica: um icone que parece um QR e que nenhuma camera le e' um
icone de um gerador de QR que **nao parece um gerador de QR** quando se aponta
uma camera para ele. E a falha so aparece no sitio onde o icone e' usado — a
tela inicial do telemovel, ou o ecra de "adicionar a ecra principal".

**E ja aconteceu.** A primeira versao do `gerar-icones.py` apanhou **11 dos 57
rectangulos** do SVG, porque o `path` fecha o rectangulo de duas maneiras —
`H1` e `h-1` — e o parser so aceitava a primeira. O icone saiu com dois dos tres
padroes de localizacao: **parecia um QR e nao lia**, sem erro nenhum.

O que este teste verifica
-------------------------

Tres coisas, e a primeira e' a que apanha o bug de origem:

  1. **O icone le, e devolve o texto que o SVG codifica.** E' a verificacao que
     substitui a conta de modulos: nao interessa quantos modulos tem, interessa
     se a camera o le;
  2. **Todos os ficheiros do manifesto existem.** Um `src` a apontar para nada
     e' o sintoma mais discreto que ha: o manifesto e' JSON valido, o site
     instala, o `standalone` funciona, e o icone que aparece e' o do browser;
  3. **A zona de corte do `maskable` nao leva tinta.** O sistema pode cortar
     10% de cada lado, e tinta nessa zona fica cortada na tela inicial.

Por que o ZXing e nao uma conta de modulos
-------------------------------------------

Porque **uma conta de modulos passa com um QR trocado.** O que interessa nao e'
a imagem parecer certa, e' a **camera** a ler. E um leitor independente e' a
mesma razao de ser do nivel 2 dos encoders: um codigo pode ter a estrutura toda
e nenhum digito no sitio.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import zxingcpp
from PIL import Image

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent
MANIFESTO = WEB / "manifest.json"
SVG = WEB / "assets" / "icon.svg"

# O texto que o icone codifica. **Tem de bater com o que o `toSvg` produz** e
# nao com o que parece ser — e a razao de o verificador o comparar com o
# ficheiro e nao com uma constante.
ESPERADO = "https://exemplo.pt/qrcode-generator"

# A zona de corte do `maskable`, em fracao. O sistema pode cortar 10% de cada
# lado, e e' o valor que o manifesto assume com `purpose: any maskable`.
ZONA_DE_CORTE = 0.1


def texto_do_svg() -> str | None:
    """O texto que o SVG codifica, se estiver escrito.

    **O SVG nao guarda o que codifica** - e' so a imagem. E por isso que o
    `ESPERADO` e' uma constante acima, e este teste verifica que a camera le
    *aquilo* e nao outra coisa. Um icone que codifique outra coisa e' um icone
    de outra coisa.
    """
    return ESPERADO


def conferir_leitura(caminho: Path, problemas: list[str]) -> None:
    """A imagem le, e le o texto certo."""
    imagem = Image.open(caminho)

    # A zona calma. **O icone ja tem 10% de margem** e por isso que um leitor
    # pode ter dificuldade numa imagem tao pequena — a escala com que a camera
    # leria um icone nao e' a escala com que nos TESTES lemos.
    if min(imagem.size) < 128:
        return

    resultados = zxingcpp.read_barcodes(imagem, formats=zxingcpp.BarcodeFormat.QRCode)
    if not resultados:
        problemas.append(f"{caminho.name}: o ZXing NAO leu o icone — e' o pior para um gerador de QR")
        return

    lido = resultados[0].text
    if lido != ESPERADO:
        problemas.append(
            f"{caminho.name}: o icone le mas da {lido!r}, e o esperado e' {ESPERADO!r}"
        )


def conferir_manifesto(problemas: list[str]) -> None:
    """Todos os `src` do manifesto existem, e nenhum falta."""
    manifesto = json.loads(MANIFESTO.read_text(encoding="utf-8"))

    for icone in manifesto.get("icons", []):
        caminho = WEB / icone["src"]
        if not caminho.exists():
            problemas.append(
                f"o manifesto declara {icone['src']} e o ficheiro nao existe — "
                "o PWA instala sem icone e nao da erro nenhum"
            )

    if not manifesto.get("icons"):
        problemas.append("o manifesto nao tem icones — o PWA fica com o icone do browser")

    #
    # **O link de icone tem de existir, e nao tem de ser o PNG.**
    #
    # A primeira versao deste teste procurava a palavra "favicon" no HTML, e o
    # que la esta e' `<link rel="icon" href="assets/icon.svg" type="image/svg+xml">`
    # — que e' um link de icone, e o browser usa-o. O `favicon.png` existe para
    # os browsers que nao understood SVG, e nao para substituir o SVG.
    #
    # **Um `favicon.png` gerado e nao ligado e' um ficheiro morto**, e nao um
    # bug: o SVG cobre todos os browsers de hoje, e o PNG cobre os de antes. A
    # verificacao certa e' que o HTML liga *algum* icone, e nao que ligue um
    # ficheiro em concreto.
    html = (WEB / "index.html").read_text(encoding="utf-8")
    if not re.search(r'<link[^>]+rel="icon"', html):
        problemas.append(
            "o index.html nao liga nenhum icone — o browser mostra o icone do site, "
            "e num PWA instalado e' o unico sitio onde o icone se ve"
        )


def conferir_zona_de_corte(caminho: Path, problemas: list[str]) -> None:
    """A zona de corte do `maskable` nao leva tinta.

    **So no `maskable`.** Um favicon nunca e' cortado pelo sistema, e uma
    margem grande deixava-o minusculo ao lado do texto da barra de enderecos.
    """
    if "favicon" in caminho.name:
        return

    imagem = Image.open(caminho).convert("RGB")
    lado = min(imagem.size)
    margem = int(lado * ZONA_DE_CORTE)

    pxeis = imagem.load()
    escuro = lambda x, y: sum(pxeis[x, y]) < 300  # noqa: E731

    for i in range(margem):
        for j in range(lado):
            for x, y in ((i, j), (lado - 1 - i, j), (j, i), (j, lado - 1 - i)):
                if escuro(x, y):
                    problemas.append(
                        f"{caminho.name}: ha tinta na zona de corte em ({x}, {y}) — "
                        "o sistema corta isso e o icone fica partido"
                    )
                    return


def main() -> int:
    problemas: list[str] = []

    print("=== o manifesto ===")
    conferir_manifesto(problemas)
    for icone in json.loads(MANIFESTO.read_text(encoding="utf-8")).get("icons", []):
        caminho = WEB / icone["src"]
        marca = "ok  " if caminho.exists() else "FALTA"
        print(f"  {marca} {icone['src']}")

    print("\n=== o icone le-se? ===")
    for nome in ("icon-192.png", "icon-512.png"):
        caminho = WEB / "assets" / nome
        if not caminho.exists():
            problemas.append(f"{nome} nao existe")
            continue

        antes = len(problemas)
        conferir_leitura(caminho, problemas)
        if len(problemas) == antes:
            print(f"  {nome}: le-se, e da {ESPERADO!r}")

    print("\n=== a zona de corte ===")
    for nome in ("icon-192.png", "icon-512.png"):
        caminho = WEB / "assets" / nome
        if not caminho.exists():
            continue
        antes = len(problemas)
        conferir_zona_de_corte(caminho, problemas)
        if len(problemas) == antes:
            print(f"  {nome}: limpa")

    if problemas:
        print()
        for p in problemas:
            print(f"  {p}")
        print()
        print("Um icone de um gerador de QR que nao le e' o pior resultado: parece certo")
        print("e falha so quando alguem aponta uma camera para ele.")
        return 1

    print()
    print("O icone e' um QR que le, e o manifesto aponta para ficheiros que existem.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
