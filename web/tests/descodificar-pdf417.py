"""
Le com o ZXing os PDF417 que o encoder gerou.

    node web/tests/gerar-pdf417.mjs
    python web/tests/descodificar-pdf417.py

Este e o teste que decide se o PDF417 entra no repositorio. Nao ha "quase": ou o
ZXing devolve a string original, ou o encoder nao existe.

A razao de um leitor externo ser obrigatorio aqui e maior do que nos codigos de
barras 1D: o PDF417 e quase todo numeros que vieram de uma tabela. Sao 2787
padroes de cluster, 1022 factores de Reed-Solomon e doze transicoes de submodo,
e um unico numero trocado produz um codigo que se desenha com o aspecto
perfeito e nao le. Nenhum teste estrutural apanha um numero trocado — a
estrutura do codigo continua a ser coerente, e a unica coisa errada e o
conteudo.

Ao contrario dos 1D, aqui a imagem e uma grelha de duas dimensoes com as linhas
justas umas abaixo das outras, e o PDF417 e sensível a isso: um modulo de
separacao a mais entre linhas, ou uma linha com a largura errada, e o leitor
perde a grelha.
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
JSON = AQUI / ".pdf417.json"

ESCALA_X = 3
# A razao entre a altura e a largura de um modulo. O PDF417 e um codigo
# empilhado e e deliberadamente baixa: as linhas justas umas abaixo das outras,
# sem margem, e e por isso que as barras verticais se veem.
RAZAO = 4
# A zona muda do PDF417 e de 2 modulos. E menor que a do QR, e a norma pede
# menos.
ZONA_MUDA = 2


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(RAIZ / "web" / "tests" / "gerar-pdf417.mjs")],
        capture_output=True,
        check=True,
    )


def caminho_dos_dados() -> Path:
    """O ficheiro a ler, que pode ser o normal ou o da reducao."""
    if len(sys.argv) > 1:
        # O nome pode vir sem caminho, e o ficheiro esta sempre na pasta dos
        # testes — que e onde o `gerar-*.mjs` o escreve.
        return AQUI / sys.argv[1]
    return JSON


def renderizar(caso: dict) -> Image.Image:
    grade = caso["modules"]
    linhas = len(grade)
    colunas = len(grade[0])

    px = (colunas + ZONA_MUDA * 2) * ESCALA_X
    py = (linhas + ZONA_MUDA * 2) * ESCALA_X * RAZAO

    img = Image.new("L", (px, py), 255)
    desenho = ImageDraw.Draw(img)
    altura = ESCALA_X * RAZAO

    for y, linha in enumerate(grade):
        y0 = (y + ZONA_MUDA) * ESCALA_X * RAZAO
        for x, modulo in enumerate(linha):
            if not modulo:
                continue
            x0 = (x + ZONA_MUDA) * ESCALA_X
            desenho.rectangle([x0, y0, x0 + ESCALA_X - 1, y0 + altura - 1], fill=0)

    return img


def main() -> int:
    dados = caminho_dos_dados()
    if not dados.exists():
        garantir_json()

    casos = json.loads(dados.read_text(encoding="utf-8"))

    if not casos:
        print("Nenhum caso gerado.")
        return 1

    lidos_ok = []
    falhados = []

    for caso in casos:
        # A largura tem de ser igual em todas as linhas, e isso verifica-se
        # antes do leitor: um codigo com linhas de larguras diferentes falha
        # sempre, e a mensagem do leitor nao diz isso.
        if not caso.get("largurasIguais", True):
            falhados.append(caso)
            continue

        lidos = zxingcpp.read_barcodes(renderizar(caso))
        ok = bool(lidos) and ler(lidos[0]) == caso["payload"]
        (lidos_ok if ok else falhados).append(caso)

    # Na reducao, o que interessa e o MENOR que falha, e nao a contagem.
    if dados.name == ".pdf417-reduzir.json":
        return resumir_reducao(lidos_ok, falhados)

    print()
    if lidos_ok:
        primeiro = lidos_ok[0]
        print(f"  o ZXing le: {len(lidos_ok)} de {len(casos)}")
        print(
            f"  exemplo: {primeiro['linhas']} linhas, {primeiro['largura']} modulos, "
            f"{primeiro['palavras']} codewords, ECC {primeiro['nivel']}"
        )
        print(f"  leu: {primeiro['payload']!r}")

    if falhados:
        print()
        print("  FALHARAM:")
        for caso in falhados[:20]:
            motivo = (
                "linhas de larguras diferentes"
                if not caso["largurasIguais"]
                else "o ZXing nao leu"
            )
            print(
                f"    {motivo}: ECC {caso['nivel']}, "
                f"{caso['linhas']}x{caso['largura']} modulos, "
                f"payload de {len(caso['payload'])} caracteres: {caso['payload'][:40]!r}"
            )
        if len(falhados) > 20:
            print(f"    ... e mais {len(falhados) - 20}")

    JSON.unlink(missing_ok=True)
    print()

    if falhados:
        print("Um PDF417 so entra no repositorio quando o ZXing devolve a string certa.")
        return 1

    print(f"Todos os {len(lidos_ok)} PDF417 gerados pelo encoder JS sao legiveis pelo ZXing.")
    return 0


def resumir_reducao(lidos_ok: list, falhados: list) -> int:
    """
    O menor payload que falha, e os que lêem à volta dele.

    É isto que um ficheiro de redução tem de responder. A contagem de
    "quantos passaram" não diz nada sobre onde está o bug; o menor que falha
    diz, e é quase sempre um ou dois caracteres mais curto do que o maior que
    passa.
    """
    maus = sorted(falhados, key=lambda c: len(c["payload"]))
    bons = sorted(lidos_ok, key=lambda c: len(c["payload"]))

    print()
    if not maus:
        print("Nenhum candidato falha: a reducao nao encontrou o bug.")
        return 0

    menor = maus[0]
    print(f"  o MENOR payload que nao le: {menor['payload']!r}")
    print(
        f"    {len(menor['payload'])} caracteres, ECC {menor['nivel']}, "
        f"{menor['linhas']}x{menor['largura'] if 'largura' in menor else '?'} "
        f"({menor['linhas']} linhas de {menor['colunas']} colunas, {menor['palavras']} codewords)"
    )

    mais_curto_que_lia = [c for c in bons if len(c["payload"]) < len(menor["payload"])]
    if mais_curto_que_lia:
        vizinho = max(mais_curto_que_lia, key=lambda c: len(c["payload"]))
        print(f"  o maior que le logo abaixo: {vizinho['payload']!r}")
    else:
        print("  nenhum candidato mais curto le: o bug e no encoder, nao no tamanho")

    print()
    print("  todos os que falham, por ordem de tamanho:")
    for caso in maus[:14]:
        print(f"    {caso['payload']!r}  (ECC {caso['nivel']}, {caso['linhas']} linhas)")

    return 0


def ler(resultado) -> str:
    """
    O texto que o leitor devolve, dos bytes crus e em UTF-8.

    **O atributo `text` nao serve para comparar conteudo com acentos.** O ZXing,
    na ausencia de ECI — que o PDF417 nao tem de serie —, assume ISO-8859-1, e
    o `text` de "aÇb" sai como "aÃ§b". Os bytes estao certos; a decodificacao
    assumida e que nao.

    A primeira versao deste script comparava o `text` com o payload, e falhava
    em todos os oito casos com acentos e emojis, dando a impressao de que o
    modo de bytes estava partido. Nao estava: estava a ser lido com a
    codificacao errada.
    """
    crus = getattr(resultado, "bytes", None)
    if crus is None:
        return resultado.text
    return bytes(crus).decode("utf-8", errors="replace")


if __name__ == "__main__":
    sys.exit(main())
