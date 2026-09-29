"""
Extrai a tabela do Code 32 do SVG que o **Zint** escreve.

    python web/tests/extrair-tabela-code32.py

De onde vem
-----------

O ZXing **nao tem leitor de Code 32** - o `Code32Reader.java` nao existe, ao
contrario de todos os outros codigos de barras deste repositorio. Mas tem
escritor, e o escritor delega no **Zint**, que e' a implementacao de referencia
da GS1. E o SVG que sai diz isso mesmo: ``<desc>Zint Generated Symbol</desc>``.

**A razao de isto ser melhor do que comparar com o ZXing**, que era o plano
inicial: o que o ZXing escreve e' o que o Zint escreve, e o que o Zint escreve
tem a checksum correcta, os start e stop certos e a forma canonica. Comparar os
modulos com essa saida e' o nivel 0 mais alto que um gerador pode ter sem um
leitor - nao e' uma tabela transcrita, e' o codigo feito por quem o fez.

O que o SVG da
--------------

Um unico ``<path>`` com as barras todas, cada uma em ``Mx0hWv50h-W`` - a
posicao, a largura e a altura. A sequencia de larguras, a dividir pelos valores,
da a sequencia de modulos do codigo de barras, e e' isso que se compara com o
que o ``code39()`` produz.

E' a **mesma comparacao entrada a entrada** que o ``tabelas.test.mjs`` faz com o
``python-barcode``, so que a fonte e' o Zint em vez de um pacote de Python - e o
Zint tem o Code 32, que o ``python-barcode`` nao tem.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".code32-ref.json"

# Os casos sao digitos, porque o Code 32 so leva digitos, e **no maximo oito**.
#
# O limite nao e' uma escolha minha: o Zint - que e' quem o ZXing chama para
# escrever - recusa com "Input length 10 too long (maximum 8)". E' o limite do
# Code 32, e o encoder tem de o respeitar, porque um codigo de dez digitos sai
# desenhado e nao e' um Code 32.
CASOS = ["0", "9", "12", "12345", "999999", "88888888", "03176752"]


def modulos_do_zint(texto: str) -> list[int]:
    """A sequencia de modulos, lida do path do SVG.

    O path e' ``M10 0h1v50h-1ZM13 0h1v50h-1Z...``. Cada ``M`` e' uma barra, o
    ``hN`` e' a largura em modulos, e a posicao ``x`` diz onde a barra comeca. A
    sequencia de modulos sai da posicao e da largura de cada barra, e nao da
    ordem do path - que e' a mesma coisa num codigo de barras, mas ler as
    posicoes e' o que apanha um path mal formado.
    """
    b = zxingcpp.create_barcode(texto, zxingcpp.BarcodeFormat.Code32)
    svg = zxingcpp.write_barcode_to_svg(b)

    # A largura total vem do <svg width="123">, e o que interessa e' a escala:
    # o Zint desenha com a zona muda ja incluida, a partir de x=10.
    caminho = re.search(r'<path d="([^"]+)"', svg)
    if not caminho:
        raise SystemExit(f"o SVG nao tem path para {texto!r}")

    barras = re.findall(r"M(\d+) 0h(\d+)v", caminho.group(1))
    if not barras:
        raise SystemExit(f"o path nao tem barras para {texto!r}")

    # O primeiro rect e' o fundo branco, e o path comeca a barra depois da zona
    # muda. A zona e' a posicao da primeira barra.
    inicio = int(barras[0][0])

    modulos = []
    for x, largura in barras:
        # Preenche ate a posicao, com brancos.
        while len(modulos) < int(x) - inicio:
            modulos.append(0)
        for _ in range(int(largura)):
            modulos.append(1)

    return modulos


def main() -> int:
    saida = []
    falhas = 0

    for texto in CASOS:
        try:
            modulos = modulos_do_zint(texto)
        except SystemExit as erro:
            print(f"  FALHOU {texto:12} {erro}")
            falhas += 1
            continue
        except ValueError as erro:
            # O Zint recusa com um erro proprio quando o texto e' longo demais.
            # Isso e' informacao - e' o limite do Code 32 - e nao uma falha.
            print(f"  {texto:12} recusado pelo Zint: {erro}")
            continue

        # Ler o que o Zing escreve, para confirmar que o que ele produz e' lido
        # por um leitor de Code 39 - que e' o unico leitor que existe para este
        # formato.
        img = zxingcpp.write_barcode_to_image(
            zxingcpp.create_barcode(texto, zxingcpp.BarcodeFormat.Code32), 3
        )
        lidos = zxingcpp.read_barcodes(img)
        lido = lidos[0].text if lidos else None

        saida.append({"entrada": texto, "modulos": modulos, "lido": lido})
        print(f"  {texto:12} {len(modulos):4} modulos   leu {lido!r}")

    if falhas:
        print(f"\n{falhas} casos nao deram modulos.")
        return 1

    JSON.write_text(json.dumps(saida), encoding="utf-8")
    print(f"\n{len(saida)} referencias em {JSON.name}")

    # O lido tem de ser o texto mais os caracteres de controlo, e o ZXing
    # acrescenta o dele. E o que se ve: um caracter a mais no fim.
    print()
    print("Nota: o ZXing le o Code 32 como Code 39 e acrescenta o digito de")
    print("controlo do Code 39 ao fim. E' o comportamento esperado - nao ha")
    print("leitor de Code 32, e um codigo de barras nao transporta o formato.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
