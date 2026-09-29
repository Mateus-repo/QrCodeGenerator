"""
Le com o ZXing os Code 93 que o encoder de JavaScript gerou.

Este e' o nivel 2 do Code 93, e tem uma particularidade que nao tem nenhum dos
outros codigos de barras: **o texto que o leitor devolve nao inclui os dois
digitos de controlo**. O ZXing apaga-os, porque sao de controlo e nao fazem
parte do dado. Por isso a comparacao e' com o `valor` e nao com a legenda.

A legenda impressa tem de os ter, e e' o que a assercia `caption` ve.

    node web/tests/gerar-code93.mjs
    python web/tests/descodificar-code93.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".code93.json"

_spec = importlib.util.spec_from_file_location(
    "descodificar_lineares", AQUI / "descodificar-lineares.py"
)
_linear = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_linear)
renderizar = _linear.renderizar


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(["node", str(AQUI / "gerar-code93.mjs")], check=True, capture_output=True)


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))
    falhas = 0

    for caso in casos:
        nome = caso["nome"]
        entrada = caso["entrada"]
        erro_esperado = caso.get("erro")

        if erro_esperado:
            print(f"  ok     {nome:20} {entrada!r} -> recusado, como deve ser")
            continue

        modulos = caso["modules"]
        guardas = caso.get("guards", [])
        imagem = renderizar({"modules": modulos, "guards": guardas})

        lidos = zxingcpp.read_barcodes(imagem)
        if not lidos:
            print(f"  FALHOU {nome:20} {entrada!r}: o ZXing nao leu nada")
            falhas += 1
            continue

        codigo = lidos[0]
        texto = codigo.text
        formato = str(codigo.format).replace("BarcodeFormat.", "")

        problemas = []

        # 1. O texto. **O ZXing desfaz os pares de escape** e devolve o texto
        #    original: `teste-93` no codigo como `dTdEdSdTdE-93` sai lido como
        #    `teste-93`. A primeira versao deste teste supus o contrario - que o
        #    leitor devolvia a forma estendida - e falhou nos dois casos com
        #    minusculas, com o leitor a fazer a coisa certa.
        #
        #    E' o `decodeExtended` do ZXing que desfaz, e e' por isso que a
        #    forma estendida so aparece no **codigo de barras** e nunca no texto
        #    lido. A legenda impressa, essa sim, leva a estendida.
        if texto != entrada:
            problemas.append(f"texto {texto!r} em vez de {entrada!r}")

        # 2. O formato. O ZXing devolve 'Code 93', **com um espaco** - e nao
        #    'CODE93', que e' como o enum de Python chama. Comparar so com as
        #    letras e os digitos, como o `descodificar-lineares.py` ja faz, para
        #    nao se estar a discutir ortografia com o numero certo.
        if "".join(c for c in formato if c.isalnum()).upper() != "CODE93":
            problemas.append(f"formato {formato!r} em vez de Code 93")

        # 3. A legenda, que tem de ter os dois digitos de controlo. E' o que se
        #    imprime, e sem eles uma etiqueta de automovel nao tem o que a pessoa
        #    lê em voz alta quando o carro tem a vidroca partida.
        #
        #    **A legenda e' a forma estendida mais os dois digitos**, e nao o
        #    texto original: e' o que permite ao lector conferir o checksum, e e'
        #    o que o sector imprime. Nao ha forma de imprimir `teste-93` e o
        #    codigo ser valido ao mesmo tempo.
        legenda = caso["caption"]
        if not legenda.startswith(caso["estendido"]):
            problemas.append(
                f"legenda {legenda!r} sem a forma estendida {caso['estendido']!r}"
            )
        elif len(legenda) != len(caso["estendido"]) + 2:
            problemas.append(f"legenda {legenda!r} sem os dois digitos de controlo")

        if problemas:
            falhas += 1
            print(f"  FALHOU {nome:20} {entrada!r}")
            for p in problemas:
                print(f"           - {p}")
        else:
            print(
                f"  ok     {nome:20} {texto} "
                f"(controles {legenda[len(caso['estendido']):]}, {formato})"
            )

    print()
    if falhas:
        print(f"{falhas} de {len(casos)} Code 93 nao bateram certo.")
        return 1

    print(f"Os {len(casos)} Code 93 gerados pelo encoder JS sao legiveis pelo ZXing,")
    print("com os dois digitos de controlo certos na legenda.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
