"""Paridade entre o Code 93 do Python e o do web, modulo a modulo.

**E o primeiro teste de verdade do encoder novo.** O `descodificar-code93.py`
le o que o **web** produz; este compara os dois encoders sobre os mesmos casos.

A ordem importa e e' a que a `AGENTS.md` manda: primeiro a paridade, que apanha
uma divergencia em segundos e sem dependencias; so depois a leitura, que apanha
o que a paridade nao apanha.

**Porquê nao usar o ZXing logo de inicio:** o ZXing devolve texto, e duas
implementacoes podem divergir na barra de terminacao e devolver a mesma coisa.
A paridade apanha a divergencia antes de ela se esconder atras de uma leitura
que passa.

**Compara-se mais do que os modulos.** As guardas e a legenda vao tambem, porque
sao os dois sitios onde um erro se esconde sem mudar um unico modulo: uma guarda
no sitio errado desenha-se igual, e uma legenda sem os digitos e' um codigo que
le certo e imprime mal. A legenda do Python tem de ser a **igual** a do web, e
nao igual ao `valor` que a pessoa escreveu - porque inclui os digitos.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

#: A raiz do repositorio. **Dois niveis acima, e nao um** — o ficheiro esta em
#: `web/tests/`, e `parents[1]` e' `web/`. Com um nivel a menos o `sys.path`
#: apontava para `web/python`, que nao existe, e o import falhava com um
#: `ModuleNotFoundError` que nao dizia nada sobre o caminho.
RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.code93 import code93  # noqa: E402

AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".code93.json"


def casos_do_web() -> list[dict]:
    """
    Os casos que o encoder do web gerou.

    **Corre-se o gerador do web primeiro**, em vez de ler o JSON de uma
    execucao anterior: o JSON e' um artefacto, e um artefacto pode ser de uma
    versao do encoder que ja nao existe. Se o encoder mudou e o JSON nao, a
    paridade passa a estar a comparar o encoder de hoje com o de ontem.
    """
    subprocess.run(
        ["node", str(AQUI / "gerar-code93.mjs")],
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
    nome = caso["nome"]
    entrada = caso["entrada"]

    # **Os casos que o web recusa tambem tem de ser recusados aqui**, e pela
    # mesma razao. Um encoder que aceita o que o outro recusa produz um codigo
    # que o leitor acaba a meio - que e' pior do que nao produzir nada, porque
    # parece que leu.
    if "erro" in caso:
        try:
            code93(entrada)
        except ValueError:
            return None
        return f"o web recusa ({caso['erro']}) e o Python aceitou"

    obtido = code93(entrada)

    modulos, do_web = obtido["modulos"], caso["modules"]
    if len(modulos) != len(do_web):
        return f"{len(do_web)} modulos no web e {len(modulos)} no Python"

    diferente = [i for i, (a, b) in enumerate(zip(do_web, modulos)) if a != b]
    if diferente:
        return (
            f"{len(diferente)} modulos diferentes, "
            f"o primeiro no indice {diferente[0]}"
        )

    if obtido["guardas"] != caso["guards"]:
        return (
            f"guardas {obtido['guardas']} no Python e "
            f"{caso['guards']} no web"
        )

    if obtido["legenda"] != caso["caption"]:
        return (
            f"legenda {obtido['legenda']!r} no Python e "
            f"{caso['caption']!r} no web"
        )

    return None


def main() -> int:
    casos = casos_do_web()
    print(f"{len(casos)} casos do encoder do web")

    falhas = 0

    for caso in casos:
        razao = conferir(caso)

        if razao is None:
            modulos = caso.get("modules") or []
            marcas = len(modulos) if modulos else "recusado"
            print(f"  ok    {caso['nome']:<34} {marcas}")
            continue

        print(f"  ERRO  {caso['nome']:<34} {razao}")
        falhas += 1

    total = len(casos)
    print(f"\n{total - falhas}/{total} iguais ao web.")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
