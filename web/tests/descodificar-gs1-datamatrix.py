"""
Le com o ZXing os GS1 DataMatrix que o encoder de JavaScript gerou.

Este e' o teste de nivel 2 do GS1 DataMatrix, e a unica coisa que interessa e' que
ele verifica **as duas metades** do FNC1, que sao as que o GS1-128 tambem tem:

  - o FNC1 do inicio, que o ZXing marca no `symbology_identifier` como ``]d2`` em
    vez de ``]d1`` e no `content_type` como `GS1` em vez de `Text`;
  - o separador nos campos de comprimento variavel, que volta nos bytes como
    ``0x1D`` e no texto como ``<GS>``.

Os dois foram medidos **antes** do encoder existir, com ``ver-dm-fnc1.py``, e a
medicao e' que diz o que se compara. Sem ela a primeira versao deste teste
esperava o FNC1 no texto do Data Matrix, que nao aparece - o mesmo engano que no
GS1-128, em que o FNC1 so aparecia no identificador.

    python web/tests/gerar-gs1-datamatrix.mjs    # se o .json nao existir
    python web/tests/descodificar-gs1-datamatrix.py
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
JSON = AQUI / ".gs1-datamatrix.json"

# O renderizador e' o do `descodificar-datamatrix.py`, e nao uma copia. Um segundo
# renderizador seria uma segunda fonte de verdade sobre quando uma matriz 2D e'
# legivel, que e' o que estes testes existem para evitar.
_spec = importlib.util.spec_from_file_location("descodificar_datamatrix", AQUI / "descodificar-datamatrix.py")
_dm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dm)
renderizar = _dm.renderizar

GS = b"\x1d"


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(["node", str(AQUI / "gerar-gs1-datamatrix.mjs")], check=True, capture_output=True)


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))
    falhas = 0

    for caso in casos:
        nome = caso["nome"]
        entrada = caso["entrada"]

        if caso.get("erro"):
            # O `gerar` ja falha o processo se o encoder nao recusar, por isso
            # chegar aqui e' a confirmacao de que a validacao dos AI funciona.
            print(f"  ok     {nome:16} {entrada} -> recusado, como deve ser")
            continue

        imagem = renderizar(caso)
        lidos = zxingcpp.read_barcodes(imagem)
        if not lidos:
            print(f"  FALHOU {nome:16} {entrada}: o ZXing nao leu nada")
            falhas += 1
            continue

        codigo = lidos[0]
        texto = codigo.text
        bytes_lidos = bytes(codigo.bytes) if getattr(codigo, "bytes", None) else b""
        identificador = codigo.symbology_identifier
        tipo = str(codigo.content_type).replace("ContentType.", "")

        problemas = []

        # 1. O FNC1 do inicio. `]d2` e' o que diz "isto e' GS1"; `]d1` e' um
        #    Data Matrix normal, e o codigo seria lido sem queixa nenhuma.
        if identificador != "]d2":
            problemas.append(f"identificador {identificador!r} em vez de ']d2'")

        if tipo != "GS1":
            problemas.append(f"content_type {tipo!r} em vez de 'GS1'")

        # 2. Os bytes, que e' onde se ve o separador. O FNC1 do inicio nao aparece
        #    neles - o ZXing consome-o e marca-o no identificador.
        payload = caso["payload"].encode("utf-8")
        if bytes_lidos != payload:
            problemas.append(f"bytes {bytes_lidos!r} em vez de {payload!r}")

        separadores_lidos = bytes_lidos.count(GS)
        separadores_esperados = caso["separadores"] - 1
        if separadores_lidos != separadores_esperados:
            problemas.append(
                f"{separadores_lidos} separadores lidos e o encoder emitiu {separadores_esperados}"
            )

        # 3. O texto, com os AI entre parenteses e `<GS>` no separador.
        texto_esperado = caso["esperado"].replace("\x1d", "<GS>")
        if texto != texto_esperado:
            problemas.append(f"texto {texto!r} em vez de {texto_esperado!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {nome:16} {entrada}")
            for p in problemas:
                print(f"           - {p}")
        else:
            print(
                f"  ok     {nome:16} {texto}  ({identificador}, {tipo}, "
                f"{separadores_lidos} separadores)"
            )

    print()
    if falhas:
        print(f"{falhas} de {len(casos)} GS1 DataMatrix nao bateram certo.")
        return 1

    print(f"Os {len(casos)} GS1 DataMatrix gerados pelo encoder JS sao legiveis pelo")
    print("ZXing, com o FNC1 do inicio reconhecido e os separadores no sitio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
