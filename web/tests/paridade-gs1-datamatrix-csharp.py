"""
Paridade entre o GS1 DataMatrix do C# e o do Python.

    python web/tests/paridade-gs1-datamatrix-csharp.py

**E' o teste de verdade do encoder de C#.** Os testes de leitura provam que o ZXing le
o que o C# desenhou; este prova que o C# e o Python **constroem a mesma coisa**.

## Os casos vem do Python

Sao os de ``python/tests/test_gs1_datamatrix.py``, lidos da suite — **duas listas do
mesmo conjunto divergem em silencio**, que e' o que a ``AGENTS.md`` ja registou com o
Code 93.

## E o ``-v q`` e o ``--`` nao sao cosmetica

**O ``-v q``** porque sem ele o ``dotnet run`` escreve o ``Build succeeded`` no mesmo
stdout onde a ferramenta escreve o JSON, e o ``json.loads`` falha numa linha que comeca
por ``B`` — **a falha aparece no Python e a causa e' do ``dotnet run``**.

**O ``--``** porque e' o que separa as opcoes do ``dotnet run`` das do programa. Sem ele,
o ``--gs1-datamatrix`` era lido pelo ``dotnet`` e nao pelo ``Program`` — e a guarda
estrita do ``Program`` dava um erro de uso em vez de um codigo.

**E a linha que parece JSON e' procurada, e nao a ultima**, pelo mesmo motivo que o
script de Node: o ``dotnet`` pode acrescentar um aviso em qualquer versao futura, e
assumir a forma da resposta e' assumir que nunca muda.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.gs1_datamatrix import gs1_datamatrix  # noqa: E402
from qrcode_core.simbologias.upcean import SimbologiaError  # noqa: E402

#: O que se compara. **O Python nao tem `legenda`** — o `gs1_datamatrix` devolve
#: `gs1`, `payload`, `codewords`, `modulos` e `separadores`, e a `legenda` e' so do
#: `CodigoGs1` (o GS1-128, que tem tres textos porque o leitor devolve tres). **Os
#: campos que os dois lados tem** sao os que se comparam, e a razao de o fazer assim e'
#: nao inventar uma chave que um dos lados nao tem.
CAMPOS = ("codewords", "modulos", "payload", "gs1", "separadores")


def casos_do_python() -> list[dict]:
    """Os casos, lidos da suite — a fonte unica."""
    r = subprocess.run(
        [
            sys.executable,
            "-c",
            "import json, sys; sys.path.insert(0, 'tests'); import test_gs1_datamatrix as t; "
            "print(json.dumps({'casos': [c[0] for c in t.CASOS], "
            "'recusas': [c[0] for c in t.RECUSAS]}))",
        ],
        cwd=RAIZ / "python",
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if r.returncode != 0:
        raise SystemExit(f"  o Python falhou:\n{r.stderr}")

    dados = json.loads(r.stdout)
    return [{"texto": t, "erro_esperado": False} for t in dados["casos"]] + [
        {"texto": t, "erro_esperado": True} for t in dados["recusas"]
    ]


def pedir_ao_csharp(casos: list[dict]) -> list[dict]:
    """Manda os casos ao C# pela ponta `--gs1-datamatrix` e le a resposta."""
    entrada = json.dumps([[c["texto"]] for c in casos])

    r = subprocess.run(
        [
            "dotnet",
            "run",
            "--project",
            str(RAIZ / "csharp" / "tools" / "QrCodeGenerator.Tools.csproj"),
            "-v",
            "q",
            "--",
            "--gs1-datamatrix",
        ],
        cwd=RAIZ,
        input=entrada,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    if r.returncode != 0:
        raise SystemExit(f"  o C# falhou:\n{r.stderr[-1500:]}")

    # **A linha que parece JSON e' procurada, e nao a ultima.**
    linha = next(
        (l.strip() for l in reversed(r.stdout.splitlines()) if l.strip().startswith("[")),
        None,
    )
    if linha is None:
        raise SystemExit(f"  a ponta de C# nao devolveu JSON:\n{r.stdout[:400]}")

    return json.loads(linha)


def modulos_diferentes(a: list, b: list) -> list[tuple[int, int]]:
    """As coordenadas onde as duas matrizes divergem."""
    return [
        (y, x)
        for y in range(min(len(a), len(b)))
        for x in range(min(len(a[y]), len(b[y])))
        if a[y][x] != b[y][x]
    ]


def main() -> int:
    casos = casos_do_python()
    resposta = pedir_ao_csharp(casos)

    print(f"  {len(casos)} casos de Python, comparados com o C#")

    falhas = 0
    recusas = 0

    for caso, csharp in zip(casos, resposta):
        texto = caso["texto"]

        try:
            codigo = gs1_datamatrix(texto)
        except SimbologiaError as e:
            recusas += 1

            if csharp.get("erro") is None:
                print(f"  FALHOU {texto:<42} o C# aceita e o Python recusa: {e}")
                falhas += 1
                continue

            print(f"  ok   {texto:<42} os dois recusam")
            continue

        if csharp.get("erro") is not None:
            print(f"  FALHOU {texto:<42} o Python aceita e o C# recusa: {csharp['erro']}")
            falhas += 1
            continue

        problemas = []

        for campo in CAMPOS:
            a, b = codigo[campo], csharp[campo]

            if campo == "modulos":
                onde = modulos_diferentes(a, b)
                if onde:
                    problemas.append(f"modulos: {len(onde)} diferem, a primeira em {onde[0]}")
                continue

            if a != b:
                problemas.append(f"{campo}: python {a!r}, csharp {b!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {texto:<42} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            continue

        print(
            f"  ok   {texto:<42} {csharp['linhas']}x{csharp['colunas']}, "
            f"{len(codigo['codewords'])} codewords, {csharp['separadores']} FNC1"
        )

    print()
    print(f"  {len(casos) - recusas} codigos, {recusas} recusas, {falhas} falha(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())