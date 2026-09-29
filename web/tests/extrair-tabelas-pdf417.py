"""
Despeja as tabelas do PDF417, tal como a biblioteca `pdf417gen` as tem, para
JSON.

Existe pela mesma razao que `extrair-tabelas.py` existe para os codigos de
barras: escrever uma tabela de memoria da errado. A do PDF417 sao **3 x 930**
padroes de 17 modulos — 2790 entradas — e a tentacao de as copiar a mao e
enorme. A primeira versao do Code 39, escrita de memoria, saiu com doze
elementos por caractere em vez de nove.

O `pdf417gen` e Python puro (licenca MIT) e traz a tabela em forma legivel. E
traz tambem **o PDF da especificacao**, o que dá uma segunda fonte para
confirar: as entradas vem do codigo, e as propriedades estruturais vem da
norma.

O que sai daqui:
  - `clusters`: 3 listas de 930 padroes de 17 modulos (clusters 0, 3 e 6)
  - `ec`: os 9 niveis de Reed-Solomon, com os factores
  - `characters`: o modo texto (alfabeto, minusculas, misto, pontuacao)
  - `switchCodes`: os codigos de troca e de bloqueio entre submodos

O `tests/tabelas-pdf417.test.mjs` compara com as tabelas do encoder, entrada a
entrada, e verifica a propriedade estrutural dos clusters — que se explica
la.

    python -m pip install pdf417gen   # so para os testes
    python web/tests/extrair-tabelas-pdf417.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from pdf417gen.codes import CODES
    from pdf417gen.data import (
        CHARACTERS_LOOKUP,
        ERROR_CORRECTION_FACTORS,
        SINGLE_SWITCH_CODE_LOOKUP,
        SWITCH_CODES,
        SWITCH_CODE_LOOKUP,
    )
except ImportError:
    print(
        "pdf417gen nao esta instalado.\n"
        "  python -m pip install pdf417gen\n"
        "(e so para os testes — o site nao tem nenhuma dependencia)",
        file=sys.stderr,
    )
    sys.exit(1)

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / ".tabelas-pdf417.json"

# O modo texto do PDF417 tem quatro submodos. No JSON vai por nome, para o
# encoder de JavaScript poder usar as mesmas palavras e nao numeros soltos.
SUBMODOS = ("UPPER", "LOWER", "MIXED", "PUNCT")


def principal() -> int:
    # `CHARACTERS_LOOKUP` vai do caractere para os submodos em que esse
    # caractere existe. Inverte-se: o que o encoder precisa e "neste submodo,
    # que valor tem este caractere".
    por_submodo: dict[str, dict[str, int]] = {m: {} for m in SUBMODOS}
    for caractere, modos in CHARACTERS_LOOKUP.items():
        for modo, valor in modos.items():
            por_submodo[modo][chr(caractere)] = valor

    tabelas = {
        # 3 listas (clusters 0, 3 e 6) de 930 padroes de 17 bits.
        "clusters": [list(linha) for linha in CODES],
        "ec": [list(nivel) for nivel in ERROR_CORRECTION_FACTORS],
        "characters": por_submodo,
        "switchCodes": {k: v for k, v in SWITCH_CODES.items()},
        "switchCodeLookup": {k: v for k, v in SWITCH_CODE_LOOKUP.items()},
        "singleSwitchCodeLookup": {k: v for k, v in SINGLE_SWITCH_CODE_LOOKUP.items()},
    }

    SAIDA.write_text(json.dumps(tabelas, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(len(linha) for linha in tabelas["clusters"])
    print(f"{total} padroes de cluster, {len(tabelas['ec'])} niveis de EC -> {SAIDA.name}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
