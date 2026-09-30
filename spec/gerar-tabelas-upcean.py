"""
Gera o modulo Python com as tabelas da familia UPC/EAN, a partir do
`python-barcode`.

    python spec/gerar-tabelas-upcean.py

## Porque um modulo gerado e nao um ficheiro escrito a mao

**A `AGENTS.md` e' explicita: as tabelas dos codigos de barras nunca se escrevem
de memoria.** Ja aconteceu duas vezes neste repositorio — o Code 39 com doze
elementos por caractere em vez de nove, e o ITF com dois na moldura de paragem
em vez de tres — e **nenhum dos dois foi apanhado por um teste**: o codigo
desenhava-se com aspecto de estar certo e o leitor devolvia outra coisa.

O `python-barcode` e' uma implementacao de referencia da industria, em Python
puro, com as tabelas no codigo-fonte em forma legivel. Este script extrai-as e
escreve o modulo; `tests/test_upcean.py` compara o que o encoder usa com o que o
`python-barcode` tem, entrada a entrada. **Uma transcricao errada passa a ser um
teste vermelho, e nao um codigo que nao le.**

## A tabela G nao vem de lado nenhum

**O G e' o R lido de tras para a frente**, e nao uma tabela independente: e a
mesma informacao vista do outro lado, porque o leitor espelha a barra. Derivar
em vez de transcrever tira uma fonte de erro — e a razao pela qual este script
nao escreve a G: **escreve a R, e o codigo deriva a G.**

    python spec/gerar-tabelas-upcean.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from barcode.charsets import upc as TUPC
except ImportError:
    print(
        "python-barcode nao esta instalado.\n"
        "  python -m pip install python-barcode\n"
        "(e' so para gerar as tabelas — o core nao tem dependencia nenhuma)",
        file=sys.stderr,
    )
    raise SystemExit(1)

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_upcean.py"


def principal() -> int:
    l = list(TUPC.CODES["L"])
    r = list(TUPC.CODES["R"])

    # A propria verificacao de que a extracao esta bem: as duas tabelas tem dez
    # entradas, cada uma com sete modulos, e cada digito aparece duas vezes —
    # uma em L e outra em R, e sao a mesma barra vista dos dois lados. Uma
    # extracao truncada ou baralhada falha aqui, e nao num codigo que nao le.
    for nome, tabela in (("L", l), ("R", r)):
        if len(tabela) != 10:
            raise SystemExit(f"a tabela {nome} devia ter 10 digitos, tem {len(tabela)}")
        for digito, padrao in enumerate(tabela):
            if len(padrao) != 7 or set(padrao) - {"0", "1"}:
                raise SystemExit(
                    f"a tabela {nome}[{digito}] tem {len(padrao)} caracteres: {padrao!r}"
                )

    conteudo = f'''"""
As tabelas da familia UPC/EAN, extraidas do `python-barcode`.

    python spec/gerar-tabelas-upcean.py

**NAO EDITE ESTE FICHEIRO A MAO.** As tabelas de um codigo de barras nunca se
escrevem de memoria, e a `AGENTS.md` explica porquê: ja aconteceu neste
repositorio, e os dois casos nao foram apanhados por nenhum teste. O
`python-barcode` e' uma implementacao de referencia da industria com as
tabelas em forma legivel; este modulo e' a extracao mechanical, e
`tests/test_upcean.py` compara as duas entrada a entrada.

## A tabela G nao existe, e e' de proposito

**G e' R lida de tras para a frente** — a mesma informacao vista do outro lado,
porque o leitor espelha a barra na metade esquerda. Derivar em vez de
transcrever tira uma fonte de erro inteira, e e' por isso que o gerador nao
escreve a G: escreve a R e o `modulo.py` deriva-a.
"""

#: L — combinacao de paridade impar, usada na metade esquerda.
L = {l!r}

#: R — combinacao de paridade par, usada na metade direita.
R = {r!r}

#: A guarda inicial e a final, mais alta e usada de ancora pelo leitor.
GUARDA_INICIO = {TUPC.EDGE!r}

#: A guarda central. E' a unica regiao do EAN-13 sem nenhum digito por baixo, e
#: quem divide a soma das guardas a meio cai precisamente nela.
GUARDA_CENTRO = {TUPC.MIDDLE!r}
'''

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(conteudo, encoding="utf-8")

    print(f"  L: {len(l)} digitos, R: {len(r)} digitos")
    print(f"  guardas: {TUPC.EDGE!r} / {TUPC.MIDDLE!r}")
    print(f"  -> {DESTINO.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
