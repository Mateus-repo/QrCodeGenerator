"""
Paridade entre o GS1 DataMatrix do Kotlin e o do Python.

    python web/tests/paridade-gs1-datamatrix-kotlin.py

**E' o teste de verdade do encoder de Kotlin.** Os testes de leitura provam que o ZXing
le o que o Kotlin desenhou; este prova que o Kotlin e o Python **constroem a mesma
coisa**.

## Os casos vem do Python

Sao os de ``python/tests/test_gs1_datamatrix.py``, lidos da suite — **duas listas do
mesmo conjunto divergem em silencio**, que e' o que a ``AGENTS.md`` ja registou com o
Code 93.

## E o `stdin` em UTF-8, e nao o que der

A ponta de Kotlin le de ``stdin`` e escreve em ``stdout``, e **os dois em UTF-8
explicito**. Sem isso o Windows mete um BOM UTF-16, e o ``gson`` morre em ``0xff`` na
posicao zero — **uma falha que parece de biblioteca e e' de codificacao**, e que ja
custou uma volta.

**E o ``gradlew`` e' chamado sem ``-q``**, porque a saida do Gradle e' o progresso da
compilacao e o JSON tem de vir **so** da ponta.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
KOTLIN = RAIZ / "kotlin"

sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.gs1_datamatrix import gs1_datamatrix  # noqa: E402
from qrcode_core.simbologias.upcean import SimbologiaError  # noqa: E402

#: O que se compara. **O Python nao tem `legenda`** — o `gs1_datamatrix` devolve
#: `gs1`, `payload`, `codewords`, `modulos` e `separadores`, e a `legenda` e' so do
#: `CodigoGs1` (o GS1-128, que tem tres textos porque o leitor devolve tres).
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


def pedir_ao_kotlin(casos: list[dict]) -> list[dict]:
    """Manda os casos ao Kotlin pela tarefa `runGs1DataMatrix` e le a resposta."""
    entrada = json.dumps([[c["texto"], c["erro_esperado"]] for c in casos])

    #: **O caminho tem de ser absoluto.** O `subprocess` nao procura o programa no
    #: `cwd` — o `cwd` e' onde o processo corre, nao onde se procura o executavel — e um
    #: `gradlew.bat` relativo da um `FileNotFoundError` que parece o Gradle nao existir.
    gradlew = KOTLIN / ("gradlew.bat" if os.name == "nt" else "gradlew")

    #: **O `stdin` vai por `cmd /c type`, e nao por `input=`.** O `JavaExec` do Gradle
    #: le o `stdin` do processo, e o `input=` do `subprocess` num Windows com um
    #: processo que tambem escreve sai um deadlock: o Gradle escreve o progresso e o
    #: pipe enche antes de o `input` ser todo lido. **Um pipe que bloqueia sem erro e'
    #: a pior falha**, porque parece um Gradle lento.
    entrada_path = KOTLIN / ".casos-gdm.json"
    entrada_path.write_text(entrada, encoding="utf-8")

    if os.name == "nt":
        # **Sem aspas em volta do gradlew**, porque o caminho nao tem espacos e o
        # `cmd /c` com barras invertidas dentro de aspas diz que nao reconhece o
        # comando — uma falha que parece do Gradle e e' do `cmd`.
        cmd = f"type {entrada_path} | {gradlew} --console=plain -q :core:runGs1DataMatrix"
        r = subprocess.run(["cmd", "/c", cmd], cwd=KOTLIN, capture_output=True)
    else:
        r = subprocess.run(
            [str(gradlew), "--console=plain", "-q", ":core:runGs1DataMatrix"],
            cwd=KOTLIN,
            input=entrada.encode("utf-8"),
            capture_output=True,
        )

    if r.returncode != 0:
        raise SystemExit(
            "  o Kotlin falhou:\n" + r.stderr.decode("utf-8", errors="replace")[-1500:]
        )

    #: **O `-q` deixa passar so o stdout da ponta**, que e' o JSON. O progresso da
    #: compilacao vai para stderr, e um `echo` no meio dava um array pela metade.
    saida = r.stdout.decode("utf-8", errors="replace").strip()

    inicio = saida.find("[")
    if inicio < 0:
        raise SystemExit(f"  a ponta de Kotlin nao devolveu JSON:\n{saida[:400]}")

    return json.loads(saida[inicio:])


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
    resposta = pedir_ao_kotlin(casos)

    print(f"  {len(casos)} casos de Python, comparados com o Kotlin")

    falhas = 0
    recusas = 0

    for caso, kotlin in zip(casos, resposta):
        texto = caso["texto"]

        try:
            codigo = gs1_datamatrix(texto)
        except SimbologiaError as e:
            recusas += 1

            if kotlin.get("erro") is None:
                print(f"  FALHOU {texto:<42} o Kotlin aceita e o Python recusa: {e}")
                falhas += 1
                continue

            print(f"  ok   {texto:<42} os dois recusam")
            continue

        if kotlin.get("erro") is not None:
            print(f"  FALHOU {texto:<42} o Python aceita e o Kotlin recusa: {kotlin['erro']}")
            falhas += 1
            continue

        problemas = []

        for campo in CAMPOS:
            a, b = codigo[campo], kotlin[campo]

            if campo == "modulos":
                onde = modulos_diferentes(a, b)
                if onde:
                    problemas.append(f"modulos: {len(onde)} diferem, a primeira em {onde[0]}")
                continue

            if a != b:
                problemas.append(f"{campo}: python {a!r}, kotlin {b!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {texto:<42} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            continue

        print(
            f"  ok   {texto:<42} {kotlin['linhas']}x{kotlin['colunas']}, "
            f"{len(codigo['codewords'])} codewords, {kotlin['separadores']} FNC1"
        )

    print()
    print(f"  {len(casos) - recusas} codigos, {recusas} recusas, {falhas} falha(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
