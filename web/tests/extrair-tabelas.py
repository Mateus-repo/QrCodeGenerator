"""
Despeja as tabelas das especificacoes, tal como a biblioteca python-barcode as
tem, para JSON.

Existe porque escrever uma tabela de codigo de barras de memoria daores wrong.
Ja aconteceu: o Code 39 foi escrito de memoria com doze elementos por
caractere em vez de nove, e o ITF ficou com dois elementos na moldura de
paragem em vez de tres. Nenhum dos dois foi apanhado por nenhum teste — o
codigo desenhava-se com aspecto de estar certo e o leitor devolvia outra
coisa, ou nada.

O python-barcode e uma implementacao de referencia da industria, em Python
puro, com as tabelas no codigo-fonte em forma legivel. Este script extrai-as
para JSON, e `tests/tabelas.test.mjs` compara-as com as do encoder de
JavaScript, entrada a entrada. Uma transcricao errada passa a ser um teste
vermelho, e nao um codigo que nao le.

    python web/tests/extrair-tabelas.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import barcode
except ImportError:
    print(
        "python-barcode nao esta instalado.\n"
        "  python -m pip install python-barcode\n"
        "(e so para os testes — o site nao tem nenhuma dependencia)",
        file=sys.stderr,
    )
    sys.exit(1)

from barcode.charsets import code39 as T39
from barcode.charsets import codabar as TCODABAR
from barcode.charsets import itf as TITF
from barcode.charsets import upc as TUPC

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / ".tabelas.json"


def principal() -> int:
    tabelas = {
        # Code 39: 43 caracteres, por ordem, com o asterisco de inicio e
        # paragem em separado. Cada entrada e uma cadeia de modulos cujas
        # corridas dao os nove elementos.
        "code39": {
            "alfabeto": list(T39.REF),
            "padroes": list(T39.CODES),
            "paragem": T39.EDGE,
        },
        # ITF: cinco elementos por digito, mais as duas molduras. Letra
        # maiuscula e barra, minuscula e espaco; W e largo, N e estreito.
        "itf": {
            "inicio": TITF.START,
            "paragem": TITF.STOP,
            "padroes": list(TITF.CODES),
        },
        # Codabar: sete elementos por caracter.
        "codabar": {
            "padroes": dict(TCODABAR.CODES),
            "inicioParagem": dict(TCODABAR.STARTSTOP),
        },
        # A familia UPC/EAN, para confirmar as tabelas L e R.
        "upcean": {
            "l": list(TUPC.CODES["L"]),
            "r": list(TUPC.CODES["R"]),
            "guardaInicio": TUPC.EDGE,
            "guardaCentro": TUPC.MIDDLE,
        },
    }

    SAIDA.write_text(json.dumps(tabelas, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(
        len(v.get("padroes", v.get("l", [])))
        for v in tabelas.values()
    )
    print(f"{total} padroes extraidos para {SAIDA.name}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
