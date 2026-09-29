"""
Le com o ZXing os Data Matrix com FNC1, para saber o que se pode verificar.

Este script e' a **medicao** que precedeu o encoder do GS1 DataMatrix, e o que
ficou registado no `descodificar-gs1-datamatrix.py` e' o que ele diz.

O que se quer saber, e porquê:

  - O FNC1 no inicio (o codeword 232) marca o simbolo como GS1? Aparece em algum
    campo do resultado do leitor, como o `]C1` marcava no Code 128?
  - O FNC1 a separar campos volta nos bytes, como o `0x1D` no GS1-128?
  - E o par de digitos "02", que e' **o mesmo codeword 232**, distingue-se do
    FNC1? Se nao se distingue, o encoder tem de ser explicito sobre qual e' qual.

    python web/tests/gerar-dm-fnc1.mjs
    python web/tests/ver-dm-fnc1.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import zxingcpp
from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".dm-fnc1.json"

_spec = importlib.util.spec_from_file_location("descodificar_datamatrix", AQUI / "descodificar-datamatrix.py")
_dm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dm)


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(["node", str(AQUI / "gerar-dm-fnc1.mjs")], check=True, capture_output=True)


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))

    for caso in casos:
        # O `renderizar` do descodificar-datamatrix.py e' o mesmo que o resto da
        # suite usa, e por isso as imagens daqui sao comparaveis com as dos outros
        # casos. Nao ha um segundo renderizador para o GS1.
        simbolo = _dm.renderizar(caso)

        lidos = zxingcpp.read_barcodes(simbolo)
        if not lidos:
            print(f"  {caso['nome']:28} -> o ZXing nao leu nada")
            continue

        codigo = lidos[0]
        texto = codigo.text
        bytes_lidos = bytes(codigo.bytes) if getattr(codigo, "bytes", None) else b""
        atributos = {
            nome: getattr(codigo, nome)
            for nome in ("symbology_identifier", "content_type")
            if hasattr(codigo, nome)
        }

        print(f"  {caso['nome']:28} {caso['colunas']}x{caso['linhas']}")
        print(f"    texto  {texto!r}")
        print(f"    bytes  {bytes_lidos!r}")
        for chave, valor in atributos.items():
            print(f"    {chave} {valor!r}")
        gs = bytes_lidos.count(b"\x1d")
        if gs:
            print(f"    0x1D nos bytes: {gs}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
