"""
Le com o ZXing os QRs que têm **o logo do projecto** desenhado na zona.

    node web/tests/medir-logo.mjs    # se o .json nao existir
    python web/tests/medir-logo.py

Este e' o **nivel 3** do `AGENTS.md`: o ficheiro que o browser exporta, lido por um
leitor independente. E' o nivel que apanha o que os outros dois nao apanham — e o
`AGENTS.md` ja registou que a legenda do EAN-13 estava cortada dos dois lados, o
codigo varria bem e os dois niveis passavam, e a etiqueta e que nao se lia.

## A diferenca para o `analisar-frameqr.py`, que ja existe

**Esse mede a zona apagada; este mede o logo desenhado.** A razao de os dois
coexistirem e' que a zona sozinha e' o **pior caso konservador**: apagada e' uma
mancha contigua de branco, e o logo e' uma mancha contigua de **escuro**. A correccao
de erros reconstroi modulos, e um modulo reconstruido a partir de vizinhos escuros e'
mais facil de acertar do que um surrounded de branco.

**E este logo e' o pior dos dois**, por tres razoes que estao no `medir-logo.mjs`:
fundo gradiente escuro, cantos arredondados, e o padrao de localizacao desenhado
dentro de si.

## O que o resultado diz

Para cada nivel de correccao, o **maior logo que ainda le**. E' esse numero que
decide se o logo do projecto entra e, se entra, com que tamanho por omissao.

E nao se usa a percentagem da norma: **4% a L e 24% a H sao de codewords errados, e
nao de area**, e so valem com os erros espalhados por varios blocos. Num QR pequeno
ha poucos codewords e a mancha do logo e' contigua. Os valores em `frameqr.js` sao
medidos por este mesmo caminho, e nao da norma.
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
from pathlib import Path

import zxingcpp
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".logo.json"

#: Quantos pixele por modulo.
#:
#: **Oito, e nao quatro.** Um logo de 6 modulos a 4 pixele por modulo tem 24 pixele de
#: lado, e o PNG do logo e' de 512 — reduzido a 24 nao se distingue de nada. A 8 a
#: leitura e' a de uma etiqueta impressa, que e' onde o logo vai estar.
ESCALA = 8

#: A margem minima em volta do codigo, em modulos. **Dois**, e o mesmo que o
#: `aplicarFrame` usou para apagar a zona — **tem de ser igual nos dois lados**, ou o
#: logo sai deslocado, que e' o bug que o `AGENTS.md` ja registou uma vez.
MARGEM = 2


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(AQUI / "medir-logo.mjs")], cwd=RAIZ, check=True, capture_output=True
    )


def desenhar(caso: dict) -> Image.Image:
    """
    A imagem com o QR **e o logo**.

    **E' aqui que a zona apagada e a imagem sao juntas**, e a ordem conta: o codigo
    primeiro, o logo por cima. Ao contrario, o logo vai debaixo do QR e nao se ve — e
    um codigo que "parece" ter logo e nao tem.
    """
    modulos = caso["modules"]
    lado = len(modulos)

    px = (lado + MARGEM * 2) * ESCALA
    imagem = Image.new("L", (px, px), 255)

    for y, linha in enumerate(modulos):
        for x, m in enumerate(linha):
            if m:
                x0 = (x + MARGEM) * ESCALA
                y0 = (y + MARGEM) * ESCALA
                imagem.paste(0, (x0, y0, x0 + ESCALA, y0 + ESCALA))

    # **A mesma conta que o `frameqr.js` faz**: a zona e' quadrada e centrada no
    # codigo, e o centro da imagem e' o centro da *caixa*, nao o da imagem. Sao a
    # mesma coisa quando a imagem e' quadrada e nao sao quando nao e'.
    logo = Image.open(io.BytesIO(base64.b64decode(caso["logo"]))).convert("RGBA")

    lado_logo = caso["modulosPedidos"] * ESCALA
    if lado_logo > 0 and lado_logo <= px:
        x0 = MARGEM * ESCALA + (lado * ESCALA - lado_logo) // 2
        y0 = MARGEM * ESCALA + (lado * ESCALA - lado_logo) // 2

        # **O logo reduz-se pelo lado mais comprido, e nunca se estica.** Esticar
        # um quadrado para um rectangulo deforma-o, e um logotipo deformado e' pior
        # do que um logotipo pequeno. Este e' quadrado, pelo que a proporcao e' 1 e a
        # distincao nao aparece — mas o codigo tem de estar escrito, porque o
        # `frameqr.js` faz o mesmo e os dois tem de concordar.
        if logo.width >= logo.height:
            largura = lado_logo
            altura = round(lado_logo * logo.height / logo.width)
        else:
            altura = lado_logo
            largura = round(lado_logo * logo.width / logo.height)

        reduzido = logo.resize((max(1, largura), max(1, altura)), Image.LANCZOS)

        # **O fundo do logo e' escuro e tem cantos arredondados**, pelo que o
        # contorno da forma arredondada aparece sobre o branco da zona. E'
        # precisamente o que este teste mede — um logo que le com o preenchimento e'
        # outro codigo do que um logo que le so com o contorno.
        fundo = imagem.crop((x0, y0, x0 + largura, y0 + altura))
        bx = fundo.convert("RGBA")
        bx.paste(reduzido, (0, 0), reduzido)
        imagem.paste(bx.convert("L"), (x0, y0))

    return imagem


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))

    print(f"  {len(casos)} casos com o logo do projecto, lidos pelo ZXing")

    por_nivel: dict[str, int] = {}
    falhas = 0

    for caso in casos:
        nivel = caso["ecl"]
        modulos = caso["modulosPedidos"]
        lidos = zxingcpp.read_barcodes(desenhar(caso))

        leu = bool(lidos) and lidos[0].text == caso["payload"]

        if leu:
            maior = por_nivel.get(nivel, -1)
            por_nivel[nivel] = max(maior, modulos)
        else:
            falhas += 1

        marca = "ok    " if leu else "FALHOU"
        print(
            f"  {marca} {nivel:<2} logo {modulos:>2} mod  "
            f"apaga {caso['modulosApagados']:>3} mod ({caso['percentagem']:>5.2f}%)  "
            f"versao {caso['version']}"
        )

    print()
    print("  O maior logo que o ZXing ainda le, por nivel:")
    for nivel in ("L", "M", "Q", "H"):
        maior = por_nivel.get(nivel, -1)
        if maior < 0:
            print(f"    {nivel:<3} nenhum tamanho le — nem 3 modulos")
        else:
            print(f"    {nivel:<3} {maior} modulos")

    print()
    if falhas:
        print(
            f"  {falhas} de {len(casos)} nao leram. **Isto e' o resultado, e nao um "
            "problema:** significa que o logo e' grande demais para esse nivel."
        )
        print()
        print("  **A percentagem da norma nao serve para prever isto.** 4% a L e 24% a")
        print("  H sao de *codewords* errados, e so com os erros espalhados por varios")
        print("  blocos. A mancha do logo e' contigua e toca muitos codewords de uma vez,")
        print("  e num QR pequeno ha poucos codewords para repartir.")
        return 0

    print(f"  Todos os {len(casos)} leram. O logo do projecto cabe em todos os niveis,")
    print("  nos tamanhos testados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())