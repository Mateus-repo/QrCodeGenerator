"""
Desenha as zonas apagadas do FieldQR e manda o ZXing ler cada uma.

    node spec/verificar-zona-frameqr.mjs
    python spec/verificar-zona-frameqr.py

## O que este script responde, e o que ele nao responde

**Responde:** as zonas apagadas que a aplicacao produzem-se ou nao em codigos
legiveis. E' a pergunta que decide, e a unica que a `AGENTS.md` diz que conta —
um codigo de barras, ou um QR com logótipo, so entra no repositorio depois de um
leitor independente devolver a string certa.

**Nao responde:** se o logótipo e' bonito, se a imagem esta centrada, ou se a
margem a volta do logótipo e' suficiente. **Isso e' o nivel tres** — o ficheiro
que o browser exporta, lido pelo ZXing — e a razao de `verificar-frameqr.py`
existir a parte.

## Porquê que a mascara de funcao e' importada do codigo, e nao reescrita aqui

A primeira versao deste par tinha uma copia de `mascaraDeFuncao` escrita no
script, e deu **treze alarme falsos em trinta zonas**. A copia protegia os
padroes de localizacao mas nao os separadores nem a informacao de versao, e
contava como apagaveis 17 modulos que o `aplicarFrame` protegia.

**E' a mesma armadilha da tabela do Code 39**: o mesmo conjunto escrito duas
vezes diverge em silencio. E um verificador que da alarme falso e' pior do que
nao ter verificador, porque se aprende a ignora-lo. A funcao passou a ser
exportada de `web/frameqr.js` e o script usa a original.

## Porque se verificam todos os tamanhos de logo, e nao so o maior

O maior e' o caso limite e da o pior erro de margem. **Mas um tamanho a meio
pode estar mal centrado num QR de tamanho impar e o maior nao** — e o `floor`
de `Math.floor((tamanho - modulos) / 2)` mostra que isso e' exactamente o que
acontece. Por isso que a lista e' `1`, metade e o maximo.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "python"))

ZONAS = RAIZ / "spec" / "_zona-frameqr.json"
MATRIZES = RAIZ / "spec" / "_frameqr-"


def matrizes() -> list[dict]:
    """Corre o verificador de estrutura e le as matrizes que ele deixou."""
    subprocess.run(
        ["node", str(RAIZ / "spec" / "verificar-zona-frameqr.mjs")],
        check=True,
        cwd=RAIZ,
        capture_output=True,
    )
    return sorted(RAIZ.glob("spec/_frameqr-*.json"))


def main() -> int:
    try:
        import zxingcpp
        from PIL import Image
    except ImportError:
        print(
            "Faltam o Pillow e o zxing-cpp.\n"
            "  python -m pip install Pillow zxing-cpp\n"
            "\n"
            "Estes casos **nao podem ser escritos a mao** — a regra e' que um "
            "codigo so entra no repositorio depois de um leitor independente "
            "devolver a string certa.",
            file=sys.stderr,
        )
        return 1

    # A zona apagada, o que o `aplicarFrame` devolveu, lado a lado com o QR sem
    # logótipo. Sao duas perguntas: uma e' o logótipo le-se, a outra e' o QR
    # **contínua** a ler depois de apagados os modulos.
    dojs = ZONAS.read_text(encoding="utf-8") if ZONAS.exists() else "[]"

    casos = matrizes()
    if not casos:
        print("o verificador de estrutura nao deixou nenhuma matriz", file=sys.stderr)
        return 1

    print(f"{'caso':28} {'tam':>4} {'logo':>5} {'apag%':>6}  leitor")
    print("-" * 74)

    problemas: list[str] = []

    for caminho in casos:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
        nome_logo = caminho.stem.split("-")[-1]

        rotulo = f'{bruto["ecl"]} {bruto["payload"][:14]}'

        # **A percentagem de apagados vem do verificador de estrutura**, e nao
        # de contar os zeros da matriz.
        #
        # A primeira versao contava aqui e dava 48 a 53%, o que e' a metade do
        # codigo — porque **metade dos modulos de um QR ja e' clara**, e um zero
        # nao e' um modulo apagado, e' um modulo que ja era claro. A conta certa
        # e' a diferenca entre a matriz original e a com a zona.
        #
        # E o numero de(modulos apagados) e' `apagados` no JSON, que o
        # verificador de estrutura calculou com a mascara de funcao em maos.
        # **Voltar a contar aqui seria refazer a conta sem a mascara**, que e'
        # exactamente o erro que o verificador de estrutura ja evita.
        apagados = bruto["apagados"]
        percentagem = bruto["percentagem"]

        imagem = _desenhar_qr(bruto["matriz"], bruto["escala"], bruto["borda"])
        resultado = zxingcpp.read_barcode(imagem)

        if resultado is None:
            problemas.append(f"{rotulo} m={nome_logo}: o ZXing não leu o código")
            estado = "NAO LEU"
        elif resultado.text != bruto["payload"]:
            problemas.append(
                f"{rotulo} m={nome_logo}: o ZXing devolveu "
                f"{resultado.text[:30]!r} e o esperado é "
                f"{bruto['payload'][:30]!r}"
            )
            estado = "DIVERGE"
        else:
            estado = "ok"

        print(
            f"{rotulo:28} {bruto['modulos']:4} {nome_logo:>5} "
            f"{percentagem:5.1f}%  {estado}"
        )

    print("-" * 74)

    if problemas:
        print(f"\n{len(problemas)} problemas:")
        for p in problemas:
            print(f"  {p}")
        return 1

    print(f"\nOs {len(casos)} códigos com logotipo foram lidos pelo ZXing "
          f"com a string certa.")
    return 0


def _desenhar_qr(matriz, escala, borda):
    """O QR como imagem, com a margem que a aplicação lhe dá."""
    from PIL import Image

    n = len(matriz)
    lado = (n + borda * 2) * escala
    imagem = Image.new("L", (lado, lado), 255)
    pixels = imagem.load()

    for y, linha in enumerate(matriz):
        for x, bit in enumerate(linha):
            if not bit:
                continue
            for dy in range(escala):
                for dx in range(escala):
                    pixels[borda * escala + x * escala + dx, borda * escala + y * escala + dy] = 0

    return imagem


if __name__ == "__main__":
    sys.exit(main())