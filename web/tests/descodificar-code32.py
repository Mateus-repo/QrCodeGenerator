"""
O Code 32 do encoder de JavaScript, modulo a modulo, contra o do Zint.

    node web/tests/gerar-code32.mjs
    python web/tests/descodificar-code32.py

Este e' o **nivel 0 do Code 32**, e e' a razao de o encoder poder entrar sem
leitor proprio.

O que a medicao mostrou
-----------------------

1. **O ZXing nao tem leitor de Code 32.** O `Code32Reader.java` nao existe, ao
   contrario de todos os outros codigos de barras deste repositorio. O que o
   ZXing le, ao encontrar um Code 32, e' Code 39 - e acrescenta o digito de
   controlo do Code 39 ao fim. Nao e' um bug: um codigo de barras nao transporta
   o formato, transporta barras.

2. **O Zint - que e' quem o ZXing chama para escrever - aceita no maximo oito
   digitos.** E' o limite do Code 32, e o encoder tem de o recusar com a mesma
   mensagem, porque um codigo de dez digitos sai desenhado e nao e' um Code 32.

Por que e' que a comparacao modulo a modulo chega
-------------------------------------------------

Porque o Code 32 **e' um Code 39**, com a mesma tabela de 43 caracteres, os mesmos
padroes e o mesmo desenho. A unica coisa que muda e' a soma de controlo, e essa
nao aparece no codigo de barras - aparece no **texto**, e portanto no ZXing
devolver uma coisa diferente do que se escreveu.

O que a comparacao apanha, e o que ela **nao** apanha:

  - apanha: um padrao trocado, um start ou stop em falta, uma barra de
    terminacao a mais, o `*` de codigo nos dados, um `+` como dado;
  - **nao apanha**: a checksum errada. Essa verifica-se pelo ZXing devolver o
    texto, que e' o `descodificar-code32.py`.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
GERADOS = AQUI / ".code32.json"
REF = AQUI / ".code32-ref.json"


def garantir() -> None:
    if not REF.exists():
        subprocess.run(
            ["python", str(AQUI / "extrair-tabela-code32.py")], check=True, capture_output=True
        )
    if not GERADOS.exists():
        subprocess.run(["node", str(AQUI / "gerar-code32.mjs")], check=True, capture_output=True)


def main() -> int:
    garantir()
    refs = {c["entrada"]: c for c in json.loads(REF.read_text(encoding="utf-8"))}
    meus = json.loads(GERADOS.read_text(encoding="utf-8"))

    falhas = 0
    comparados = 0

    for caso in meus:
        if caso.get("erro") or not caso["modules"]:
            continue

        entrada = caso["entrada"]
        ref = refs.get(entrada)
        if ref is None:
            print(f"  sem referencia para {entrada!r} - o Zint nao aceitou")
            continue

        comparados += 1
        problemas = []

        # O encoder acrescenta o digito de controlo do Code 39, e o Zint tambem
        # - por isso os dois tem' o mesmo texto e os mesmos modulos. A comparacao
        # e' entre as duas legendas, e nao apenas entre os modulos.
        if caso["caption"] != ref["lido"]:
            problemas.append(
                f"a legenda {caso['caption']!r} nao bate com o Zint "
                f"{ref['lido']!r} - a soma de controlo esta errada"
            )

        if caso["modules"] != ref["modulos"]:
            problemas.append(
                f"os modulos nao batem: {len(caso['modules'])} contra "
                f"{len(ref['modulos'])} do Zint"
            )

        if problemas:
            falhas += 1
            print(f"  FALHOU {entrada!r}")
            for p in problemas:
                print(f"           - {p}")
        else:
            print(
                f"  ok     {entrada!r} {len(caso['modules']):4} modulos, "
                f"bate com o Zint ({ref['lido']!r})"
            )

    print()
    if comparados == 0:
        print("Nenhum caso comparado - a referencia nao foi obtida.")
        return 1

    if falhas:
        print(f"{falhas} de {comparados} Code 32 divergem do Zint.")
        return 1

    print(f"Os {comparados} Code 32 batem com o Zint, modulo a modulo.")
    print("O Zint e' a implementacao de referencia da GS1, e o ZXing chama-o")
    print("para escrever este formato - e' a melhor referencia disponivel para")
    print("um codigo sem leitor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
