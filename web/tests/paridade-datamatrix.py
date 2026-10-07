"""Paridade entre o Data Matrix do Python e o do web, modulo a modulo.

**E o primeiro teste de verdade do encoder novo.** O `descodificar-datamatrix.py`
le o que o **web** produz; este compara os dois encoders sobre os mesmos casos.

A ordem importa e e' a que a `AGENTS.md` manda: primeiro a paridade, que apanha
uma divergencia em segundos e sem dependencias; so depois a leitura, que apanha
o que a paridade nao apanha.

**Porquê nao usar o ZXing logo de inicio:** o ZXing devolve texto, e duas
implementacoes podem divergir em dois modulos e devolver a mesma coisa. A
paridade apanha a divergencia antes de ela se esconder atras de uma leitura que
passa.

**E foi aqui que apareceu o bug do canto.** O web escrevia
``bits[linhas * colunas + colunas - 1]``, um indice `colunas - 1` posicoes a
mais, e um ``Uint8Array`` fora do fim da ``undefined`` - e ``undefined < 0`` e'
falso, portanto o bloco nunca corria. **O encoder web desenhava o codigo certo e
o ZXing lia-o na mesma**, e a diferenca eran dois modulos que ninguem via. O
Python levantou ``IndexError`` na mesma linha, e a paridade deixou de estar a
contar a historia toda.

**Compara-se mais do que os modulos.** As dimensoes, a capacidade e a correccao vao
tambem, porque sao os tres sitios onde um erro se esconde sem mudar um modulo da
matriz: um simbolo escolhido a mais e' um codigo valido e maior.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

#: A raiz do repositorio. **Dois niveis acima, e nao um** - o ficheiro esta em
#: `web/tests/`, e `parents[1]` e' `web/`. Com um nivel a menos o `sys.path`
#: apontava para `web/python`, que nao existe, e o import falhava com um
#: `ModuleNotFoundError` que nao dizia nada sobre o caminho.
RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.datamatrix import data_matrix  # noqa: E402

AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".datamatrix.json"

#: Os campos que **nao** sao a matriz. Cada um com o porque de estar aqui.
EXTRA = {
    "colunas": "a largura do simbolo, guias incluidas",
    "linhas": "a altura do simbolo, guias incluidas",
    "dados": "a capacidade em codewords de dados",
    "correccao": "quantos codewords de correccao ha",
    "usado": "quantos codewords o texto ocupa",
}


def casos_do_web() -> list[dict]:
    """
    Os casos que o encoder do web gerou.

    **Corre-se o gerador do web primeiro**, em vez de ler o JSON de uma
    execucao anterior: o JSON e' um artefacto, e um artefacto pode ser de uma
    versao do encoder que ja nao existe. Se o encoder mudou e o JSON nao, a
    paridade passa a estar a comparar o encoder de hoje com o de ontem.
    """
    subprocess.run(
        ["node", str(AQUI / "gerar-datamatrix.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def conferir(caso: dict) -> str | None:
    """
    Compara um caso, e devolve a razao se differirem.

    :return: ``None`` se tudo bate certo, ou a razao da divergencia.
    """
    codigo = data_matrix(caso["payload"])

    for chave, porque in EXTRA.items():
        if codigo[chave] != caso[chave]:
            return f"{chave} {codigo[chave]} no Python e {caso[chave]} no web ({porque})"

    do_python = [[1 if m else 0 for m in linha] for linha in codigo["modulos"]]
    do_web = caso["modules"]

    if len(do_python) != len(do_web):
        return f"{len(do_web)} linhas no web e {len(do_python)} no Python"

    for y, (a, b) in enumerate(zip(do_python, do_web)):
        if len(a) != len(b):
            return (
                f"a linha {y} tem {len(b)} colunas no web e {len(a)} no Python"
            )
        diferentes = [x for x, (u, v) in enumerate(zip(a, b)) if u != v]
        if diferentes:
            return (
                f"{len(diferentes)} modulos diferentes na linha {y}, "
                f"o primeiro na coluna {diferentes[0]}"
            )

    return None


def mostrar(texto: str, largura: int = 34) -> str:
    """O payload em ASCII: a consola do Windows e' cp1252 e rebenta com um acento."""
    cru = texto.encode("ascii", errors="backslashreplace").decode("ascii")
    return cru[:largura]


def main() -> int:
    casos = casos_do_web()
    print(f"{len(casos)} casos do encoder do web")

    falhas = 0

    for caso in casos:
        razao = conferir(caso)

        if razao is None:
            print(
                f"  ok    {mostrar(caso['payload']):<34} "
                f"{caso['linhas']}x{caso['colunas']:<4} "
                f"dados {caso['usado']}/{caso['dados']}"
            )
            continue

        print(f"  ERRO  {mostrar(caso['payload']):<34} {razao}")
        falhas += 1

    total = len(casos)
    print(f"\n{total - falhas}/{total} iguais ao web.")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())