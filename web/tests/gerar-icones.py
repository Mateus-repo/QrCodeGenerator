"""
Gera os icones PNG do PWA a partir do SVG, e o favicon.

    python web/tests/gerar-icones.py

O que estava a dar mal
----------------------

O `manifest.json` declara tres icones: o SVG, um PNG de 192 e um de 512. **Os
dois PNG nao existiam.** E um PWA instalavel no telemovel fica com o icone do
sistema — que e' o do browser, ou um retangulo branco — porque o que o
telemovel procura no manifesto nao esta la.

E o sintoma e' **silencioso**: o manifesto e' JSON valido, o site instala, o
`display: standalone` funciona, e nada dá erro. O que falta e' so o icone, e o
que aparece no ecra do telemovel e' o do browser. Num site que faz icones para
tudo, e' a unica coisa que se ve sem querer.

A razao de o PNG ser gerado e nao desenhado a mao
--------------------------------------------------

**O icone e' um QR code, e um QR code desenhado a mao e' um QR code que nao
le.** O `icon.svg` tem 29x29 modulos com os padroes de localizacao e a matriz
completa, e rasteriza-lo da o icone certo; redesenhar os modulos num PNG
introduz a chance de errar num modulo e dar um icone que **nao e' o QR que o
site produz** — que e' a pior coisa que pode acontecer a um icone de um
gerador de QR.

E a rasterizacao e' feita com o **Pillow**, e nao com uma biblioteca de SVG: o
SVG tem `viewBox` e `path` com uma forma por linha, e ha uma decisao a tomar
sobre o que um `path` como `M1 1h7v7H1z` quer dizer. **Parsear o `path` e
preencher os rectangulos e' mais simples e mais seguro**, e da o mesmo
resultado, porque o SVG e' gerado por este repositorio e so tem rectangulos.

O que o script verifica
-----------------------

**Que o PNG tem a cor certa em cada canto, e que o centro nao e' um bloco
uniforme.** Um icone gerado com o fundo trocado e' um icone que se ve no
telemovel com o contraste errado, e a falha so aparece depois de instalado.

E que o **`maskable` e' mesmo maskable**: o formato tem uma zona de 10% de cada
lado que o sistema pode cortar, e um icone que chega ao limite da Corte fica com
o padrao de localizacao partido. O script encolhe a imagem para 80% e deixa o
sistema cortar o branco.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
WEB = AQUI.parent
SVG = WEB / "assets" / "icon.svg"
DESTINOS = [
    (WEB / "assets" / "icon-192.png", 192),
    (WEB / "assets" / "icon-512.png", 512),
    (WEB / "favicon.png", 32),
]

# A cor de fundo do manifesto. Tem de ser a mesma que a do SVG, e a razao de a
# repetir aqui e' que uma diferenca entre as duas da um icone com um anel
# branco num telemovel com fundo escuro — e o sintoma so aparece instalado.
FUNDO = "#ffffff"
TINTA = "#111827"


def modulos_do_svg(texto: str) -> list[list[int]]:
    """A matriz de modulos do SVG, e as cores.

    O SVG deste repositorio e' um `rect` de fundo e um `path` com **um
    rectangulo por linha**, na forma `M<x> <y>h<largura>v<altura>H<x>z`. E' um
    formato que so o proprio gerador produz, e por isso que o parser e' directo:
    qualquer coisa mais geral seria generalizar para um caso que nao existe.
    """
    modulos: set[tuple[int, int]] = set()
    fundo = re.search(r'<rect[^>]*fill="(#[0-9a-fA-F]{6})"', texto)
    tinta = re.search(r'<path[^>]*fill="(#[0-9a-fA-F]{6})"', texto)

    if not fundo or not tinta:
        raise SystemExit("o SVG nao tem o rect de fundo e o path da tinta")

    #
    # **Os rectangulos fecham de duas maneiras, e o `z` e' o mesmo nos dois.**
    #
    # O `M1 1h7v7H1z` volta ao inicio com `H1`, e o `M21 1h7v7h-7z` volta com
    # `h-7` — a mesma coisa escrita ao contrario. A primeira versao deste parser
    # so aceitava a forma com `H`, e apanhou **11 dos 57** rectangulos: o
    # resultado foi um icone com dois dos tres padroes de localizacao, que se
    # parece com um QR e **nao le**.
    #
    # E o sintoma e' o pior possivel para um icone de um gerador de QR: um icone
    # que parece um QR e que nenhuma camera le. Nao ha erro, nao ha aviso, e o
    # unico sitio onde se ve e' a tela inicial do telemovel.
    #
    # O `z` e' o que fecha o caminho e torna o rectangulo completo, por isso que
    # a forma se distingue pelo `z` e nao pela letra.
    #
    # **As coordenadas podem ter virgula ou espaco.** O `toSvg` deste
    # repositorio escreve `M4,4h1v1h-1z` (com virgula) e o SVG antigo escrevia
    # `M1 1h7v7H1z` (com espaco). O parser so aceitava a segunda forma e
    # apanhou **zero** rectangulos do SVG gerado — o que o fez dizer que o
    # desenho estava vazio, e a primeira versao tratar aquilo como um erro de
    # fonte.
    #
    # A razao de o parser ter de aguentar as duas e' que o ficheiro **muda de
    # forma** quando passa a ser gerado: o `toSvg` e o desenho antigo nao vem
    # do mesmo sitio, e um gerador que so serve para o que ele proprio escreveu
    # deixa de servir assim que o outro entra.
    for x, y, larg, alt in re.findall(r"M(\d+)[, ](\d+)h(\d+)v(\d+)[Hh](?:-?\d+)?z", texto):
        for dy in range(int(alt)):
            for dx in range(int(larg)):
                modulos.add((int(x) + dx, int(y) + dy))

    return modulos, fundo.group(1), tinta.group(1), int(
        re.search(r'viewBox="0 0 (\d+) (\d+)"', texto).group(2)
    )


def cor_de(hexa: str) -> tuple[int, int, int]:
    return tuple(int(hexa[i : i + 2], 16) for i in (1, 3, 5))


def desenhar(modulos: set[tuple[int, int]], lado: int, margem: float, fundo, tinta) -> Image.Image:
    """A imagem do icone, com **duas** margens.

    **A do `maskable`, que e' para o corte, e a do QR, que e' para a leitura.** E
    que sao coisas diferentes, e a primeira versao daqui tratava uma so — e o
    ZXing nao leu o icone.

    A do sistema e' de 10%: o pode cortar ate 10% de cada lado, e um desenho
    que chega a borda fica com o padrao de localizacao partido.
    A do QR e' de **4 modulos**, a pedir da ISO/IEC 18004, e sem ela **nenhuma
    camera encontra o codigo**.

    As duas ao mesmo tempo sao o branco: encolhe-se o desenho para dentro e
    deixa-se o branco dar as duas.
    """
    #
    # **A zona calma do icone tem de ser a do QR, e nao a do maskable.**
    #
    # A margem do `maskable` (10%) e' uma coisa: serve para o sistema cortar o
    # icone sem partir o desenho. A **zona calma do QR** e' outra: a ISO/IEC
    # 18004 pede **4 modulos** de branco em volta, e sem eles nenhuma camera
    # encontra o codigo.
    #
    # A primeira versao encolhia o desenho para 80% do lado e achava que isso
    # resolvia as duas coisas. Nao resolvia: o desenho ficava com 10% de branco
    # em volta, que a 29 modulos sao **2,9 modulos** — e o ZXing **nao leu o
    # icone nenhum**. Um icone de um gerador de QR que nao le, e a falha so
    # aparecia apontando uma camera para ele.
    #
    # Por isso o desenho encolhe para caber com **4 modulos de zona calma
    # declarados**, e o `maskable` continua a ser servido pelo branco que sobra.
    # São as duas margens ao mesmo tempo, e cada uma com a sua razao.
    lado_qr = 29
    zona_qr = 4  # em modulos, a pedir da ISO/IEC 18004
    total = lado_qr + 2 * zona_qr

    interno = lado * (1 - 2 * margem)
    modulo = interno / total
    deslocamento = (lado - interno) / 2 + zona_qr * modulo

    imagem = Image.new("RGB", (lado, lado), fundo)
    pxeis = imagem.load()

    for (x, y) in modulos:
        x0 = int(deslocamento + x * modulo)
        y0 = int(deslocamento + y * modulo)
        x1 = int(deslocamento + (x + 1) * modulo)
        y1 = int(deslocamento + (y + 1) * modulo)
        for py in range(y0, max(y1, y0 + 1)):
            for px in range(x0, max(x1, x0 + 1)):
                if 0 <= px < lado and 0 <= py < lado:
                    pxeis[px, py] = tinta

    return imagem


def conferir(imagem: Image.Image, nome: str, maskable: bool) -> list[str]:
    """As propriedades que um icone tem de ter, e que so se veem depois de instalado.

    **A zona de corte so se verifica no `maskable`, e a primeira versao
    verificava em todos** — e o favicon, que tem 2% de margem por estar colado a
    um texto, falhava com "ha tinta na zona de corte em (1, 1)".

    A razao de a distincao ser real: um **favicon** nunca e' cortado pelo
    sistema, e uma margem grande deixava-o minusculo ao lado do texto da barra
    de enderecos. Um **icone de PWA** e' cortado, e sem margem o padrao de
    localizacao fica partido na tela inicial do telemovel.
    """
    problemas = []
    lado = imagem.size[0]

    # 1. O fundo esta la, e e' da cor do manifesto.
    #
    # **So para o `maskable`.** Com 10% de margem o canto e' sempre fundo, e e'
    # a propriedade que garante que o corte do sistema nao leva tinta. Num
    # favicon de 2% o canto pode ser tinta, e isso esta certo — o que interessava
    # era que o canto estivesse *da cor certa*, e nao que estivesse branco.
    if maskable:
        cor = imagem.getpixel((1, 1))
        if cor != cor_de(FUNDO):
            problemas.append(f"{nome}: o canto e' {cor} e o fundo do manifesto e' {FUNDO}")

    # 2. Ha tinta, e nao e' um bloco uniforme.
    #
    # A contagem e' feita com `im.getcolors`, e nao com `getdata`, porque o
    # `getdata` esta' deprecado no Pillow 12 e `get_flattened_data` nao existe em
    # versoes mais antigas. `getcolors` da a mesma contagem sem nenhum dos dois.
    contagem = dict(imagem.getcolors(maxcolors=lado * lado) or [])
    total = lado * lado
    escuro = sum(n for n, c in contagem.items() if sum(c) < 300)
    if escuro < total * 0.05:
        problemas.append(f"{nome}: so {escuro} pxeis escuros de {total} — o icone esta vazio")
    if escuro == total:
        problemas.append(f"{nome}: nao ha fundo — o icone e' um bloco todo escuro")

    # 3. **A zona de corte nao leva tinta.** E' o que faz o `maskable` ser
    #    maskable: o sistema pode cortar 10% de cada lado, e tinta nessa zona
    #    aparece cortada na tela inicial.
    if not maskable:
        return problemas

    margem = int(lado * 0.1)
    for py in range(margem):
        for px in range(lado):
            for x, y in ((px, py), (px, lado - 1 - py)):
                if sum(imagem.getpixel((x, y))) < 300:
                    problemas.append(f"{nome}: ha tinta na zona de corte em ({x}, {y})")
                    return problemas
    for px in range(margem):
        for py in range(lado):
            for x, y in ((px, py), (lado - 1 - px, py)):
                if sum(imagem.getpixel((x, y))) < 300:
                    problemas.append(f"{nome}: ha tinta na zona de corte em ({x}, {y})")
                    return problemas

    return problemas


def main() -> int:
    if not SVG.exists():
        raise SystemExit(f"falta {SVG}")

    modulos, fundo_hex, tinta_hex, lado_svg = modulos_do_svg(SVG.read_text(encoding="utf-8"))

    print(f"o SVG tem {len(modulos)} modulos escuros em {lado_svg}x{lado_svg}")

    #
    # **A contagem tem de bater com o SVG.** Um QR de 29x29 tem entre 100 e 200
    # modulos escuros, e um icone com 116 apanhados dos 57 rectangulos do
    # ficheiro era o sinal de que o parser so via metade.
    if lado_svg * 2 > len(modulos):
        raise SystemExit(
            f"só {len(modulos)} modulos para um {lado_svg}x{lado_svg} — o parser do path falhou"
        )

    if fundo_hex.lower() != FUNDO.lower():
        raise SystemExit(
            f"o fundo do SVG e' {fundo_hex} e o do manifesto e' {FUNDO} — "
            "a diferenca da um anel no telemovel com fundo escuro"
        )

    fundo, tinta = cor_de(fundo_hex), cor_de(tinta_hex)

    problemas = []
    for destino, lado in DESTINOS:
        # O favicon e' `any`: pode ficar colado a um texto, e um icone com
        # margem grande fica pequeno demais. Os outros sao `maskable`.
        margem = 0.02 if lado <= 32 else 0.1
        imagem = desenhar(modulos, lado, margem, fundo, tinta)
        problemas += conferir(imagem, destino.name, maskable=lado > 32)
        imagem.save(destino, "PNG", optimize=True)
        kb = round(destino.stat().st_size / 1024, 1)
        print(f"  {destino.name:16} {lado}x{lado}  margem {margem:.0%}  {kb} KB")

    if problemas:
        print()
        for p in problemas:
            print(f"  {p}")
        print()
        print("O icone fica mal num PWA instalado, e so se ve depois de instalar.")
        return 1

    print()
    print("Os icones estao nos sitio e o manifesto ja aponta para ficheiros que existem.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
