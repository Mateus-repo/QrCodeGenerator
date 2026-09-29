"""
Le com o ZXing os Data Matrix que o encoder gerou.

    node web/tests/gerar-datamatrix.mjs
    python web/tests/descodificar-datamatrix.py

Este e o teste que decide se o Data Matrix entra no repositorio.

A correcao de erros e o que torna este caso diferente dos outros. Um Data Matrix
tem **um unico nivel** de correccao — o ECC200, e nao se escolhe — mas tem ate
**62% do codigo em codewords de correcao**, tres vezes mais do que o QR mais
robusto. A razao e que as etiquetas sao pequenas e apanham inferno: uma ampola
que passa por uma camera, um chip que se esfrega. Por isso um factor de
Reed-Solomon errado nao da um codigo que "quase le": da um codigo que o leitor
rejeita por corrupcao, e a mensagem nao fala da tabela.

A zona muda e de 1 modulo, e nao 4 como no QR. E um Data Matrix e sensible a ela:
o leitor orienta-se pelos cantos tracejados, e sem margem a detecao falha. Por isso o
teste conta com uma, que e o minimo da norma.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import zxingcpp
from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".datamatrix.json"

ESCALA = 4
ZONA_MUDA = 1


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(RAIZ / "web" / "tests" / "gerar-datamatrix.mjs")],
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


def ler(resultado) -> str:
    """
    O texto, dos bytes crus e em UTF-8.

    O atributo `text` do ZXing, na ausencia de ECI, assume ISO-8859-1 — e um
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

    A consola do Windows e cp1252 e rebenta com um acento. Um script de teste
    que rebenta a imprimir o payload esconde o que ia dizer — e o que ia dizer
    e a lista dos que falharam, que e a unica coisa que interessa aqui.
    """
    cru = texto.encode("ascii", errors="backslashreplace").decode("ascii")
    return f"{cru[:largura]!r:<{largura + 2}}"


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))

    if not casos:
        print("Nenhum caso gerado.")
        return 1

    lidos_ok = []
    falhados = []

    for caso in casos:
        lidos = zxingcpp.read_barcodes(renderizar(caso))
        ok = bool(lidos) and ler(lidos[0]) == caso["payload"]
        (lidos_ok if ok else falhados).append(caso)

    print()
    for caso in lidos_ok[:6]:
        print(
            f"  ok  {mostrar(caso['payload'], 28)} {caso['linhas']}x{caso['colunas']:<4} "
            f"dados {caso['usado']}/{caso['dados']}, ec {caso['correccao']}"
        )

    if falhados:
        print()
        print("  FALHARAM:")
        for caso in falhados[:20]:
            print(
                f"    {mostrar(caso['payload'], 34)} {caso['linhas']}x{caso['colunas']} "
                f"dados {caso['usado']}/{caso['dados']}"
            )
        if len(falhados) > 20:
            print(f"    ... e mais {len(falhados) - 20}")

    JSON.unlink(missing_ok=True)
    print()

    if falhados:
        print("Um Data Matrix so entra no repositorio quando o ZXing devolve a string certa.")
        return 1

    print(f"Todos os {len(lidos_ok)} Data Matrix gerados pelo encoder JS sao legiveis pelo ZXing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
