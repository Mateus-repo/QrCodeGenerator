"""
Le com o ZXing os Data Matrix que o encoder de **Python** gerou.

Este e' o **nivel 2 do Data Matrix em Python**, e o `AGENTS.md` nao aceita menos:
*um encoder so entra no repositorio depois de o ZXing devolver a string certa.*
O `dm-paridade.py` mostra que o Python faz o mesmo que o web; este mostra que o
leitor independente le o resultado.

    python web/tests/descodificar-datamatrix-python.py

**Os casos vem do gerador do web**, e nao de uma lista aqui: duas listas do mesmo
conjunto divergem em silencio. Corre-se o gerador em vez de ler o JSON de uma
execucao anterior, pelo mesmo motivo - senao a comparacao passava a verificar o
encoder de hoje contra o de ontem.

**E a comparacao e' pelos bytes, nunca pelo texto.** O `text` do `zxingcpp` na
ausencia de ECI assume ISO-8859-1, e um Data Matrix nao tem ECI: um ``ç`` lido
por um caminho e por outro nao sao o mesmo byte. O `bytes` devolve o que o codigo
transporta, e e' o que se quer comparar.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import zxingcpp

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from PIL import Image  # noqa: E402

from qrcode_core.simbologias.datamatrix import data_matrix  # noqa: E402
from qrcode_core.simbologias.desenho import to_bitmap_2d  # noqa: E402

AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".datamatrix.json"

#: Quantos pixele por modulo. **Quatro**, e nao um: o ZXing detecta o simbolo por
#: contraste e a 1 pixele por modulo um codigo pequeno da problemas de amostragem
#: nos cantos tracejados, que sao a unica coisa de que o leitor se serve para se
#: orientar. Um codigo de 10x10 a 1 pixele e' uma grelha que se parece com as
#: outras e nao e' lida.
ESCALA = 4


def casos_do_web() -> list[dict]:
    """Corre o gerador do web e le os casos que ele produziu."""
    subprocess.run(
        ["node", str(AQUI / "gerar-datamatrix.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def ler(resultado) -> str:
    """
    O texto, dos bytes crus e em UTF-8.

    O atributo `text` do ZXing, na ausencia de ECI, assume ISO-8859-1 - e um
    Data Matrix nao tem ECI. O mesmo caso com o PDF417 falhava em todos os
    payloads com acentos e dava a impressao de que o modo estava partido.
    """
    crus = getattr(resultado, "bytes", None)
    if crus is None:
        return resultado.text
    return bytes(crus).decode("utf-8", errors="replace")


def mostrar(texto: str, largura: int = 30) -> str:
    """
    O payload, mas em ASCII.

    A consola do Windows e' cp1252 e rebenta com um acento. Um script de teste
    que rebenta a imprimir o payload esconde o que ia dizer - e o que ia dizer
    e' a lista dos que falharam, que e' a unica coisa que interessa aqui.
    """
    cru = texto.encode("ascii", errors="backslashreplace").decode("ascii")
    return f"{cru[:largura]!r:<{largura + 2}}"


def _renderizar(png: bytes) -> Image.Image:
    """A imagem de volta, para o ZXing."""
    import io

    return Image.open(io.BytesIO(png))


def main() -> int:
    casos = casos_do_web()

    print(f"{len(casos)} casos do encoder de Python, lidos pelo ZXing")

    falhas = 0

    for caso in casos:
        codigo = data_matrix(caso["payload"])
        imagem = _renderizar(to_bitmap_2d(codigo["modulos"], escala=ESCALA))

        lidos = zxingcpp.read_barcodes(imagem)

        if not lidos:
            print(f"  FALHOU {mostrar(caso['payload'], 34)} o ZXing nao leu nada")
            falhas += 1
            continue

        codigo_lido = lidos[0]
        formato = str(codigo_lido.format).replace("BarcodeFormat.", "")
        lido = ler(codigo_lido)

        if lido != caso["payload"]:
            print(f"  FALHOU {mostrar(caso['payload'], 34)} esperava "
                  f"{caso['payload']!r}")
            print(f"           leu      {lido!r} como {formato}")
            print(f"           o `text` do leitor mostrava {codigo_lido.text!r}")
            falhas += 1
            continue

        print(
            f"  ok    {mostrar(caso['payload'], 28)} {codigo['linhas']}x"
            f"{codigo['colunas']:<4} dados {codigo['usado']}/{codigo['dados']}, "
            f"ec {codigo['correccao']} ({formato})"
        )

    print()
    if falhas:
        print(
            f"{falhas} de {len(casos)} Data Matrix do encoder de Python nao "
            "sobreviveram a leitura pelo ZXing."
        )
        return 1

    print(
        f"Os {len(casos)} Data Matrix gerados pelo encoder de Python sao "
        "legiveis pelo ZXing."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())