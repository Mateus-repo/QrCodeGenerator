"""
Paridade entre o GS1 DataMatrix do Java e o do Python.

    python web/tests/paridade-gs1-datamatrix-java.py

**E' o teste de verdade do encoder de Java.** Os 303 testes de Java provam que o ZXing
le o que ele desenhou; este prova que o Java e o Python **constroem a mesma coisa** —
e sem isso o Java pode estar certo e o Python errado, ou o inverso.

## Os casos vem do Python, e nao estao escritos aqui

Sao os de ``python/tests/test_gs1_datamatrix.py``, lidos da suite — **duas listas do
mesmo conjunto divergem em silencio**, que e' o que a ``AGENTS.md`` ja registou com o
Code 93. **Corre-se a suite e nao le-se um JSON de uma execucao anterior**: comparar
o encoder de hoje com o de ontem nao apanha divergencia nenhuma.

## E porque e' que este ficheiro chama o `build.sh` e nao o `java` directo

**A armadilha que custou uma volta:** o ``>`` do PowerShell escreve UTF-16, e o gson
do Java morre em ``0xff`` na posicao zero. Um ficheiro de casos escrito pelo Python e
passado por aqui seria UTF-16 sem dar conta, e a falha pareceria de gson.
**Chamar o ``build.sh`` pelo ``subprocess`` com a entrada em bytes nao tem o
problema** — e e' a forma de o ``run-gs1-datamatrix`` ja ser usado pelos outros
scripts de paridade.

## O que se compara

**Os ``codewords`` sao a comparacao principal**, e nao a imagem: um ``232`` no sitio
errado da o mesmo numero de modulos e le-se com o campo partido. E a matriz vem
depois, porque apanha a divergencia na correccao de erros, que os codewords ainda nao
veem.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
JAVA = RAIZ / "java"
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.gs1_datamatrix import gs1_datamatrix  # noqa: E402
from qrcode_core.simbologias.upcean import SimbologiaError  # noqa: E402

#: O que se compara, e o nome de cada coisa.
#:
#: **O Python nao tem `legenda`** — o `gs1_datamatrix` devolve `gs1`, `payload`,
#: `codewords`, `modulos` e `separadores`, e o `legenda` e' so do `CodigoGs1` (o
#: GS1-128, que tem tres textos porque o leitor devolve tres). **Os campos que os
#: dois lados tem** sao os que se comparam, e a razao de o fazer assim e' nao
#: inventar uma chave que um dos lados nao tem.
CAMPOS = ("codewords", "modulos", "payload", "gs1", "separadores")


def casos_do_python() -> list[dict]:
    """Os casos, lidos da suite do Python — a fonte unica."""
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
    return [
        {"texto": t, "erro_esperado": False} for t in dados["casos"]
    ] + [
        {"texto": t, "erro_esperado": True} for t in dados["recusas"]
    ]


def pedir_ao_java(casos: list[dict]) -> list[dict]:
    """Manda os casos ao Java e le a resposta.

    **O ficheiro de casos e' escrito em UTF-8 explicito**, porque o ``>`` do
    PowerShell escreveria UTF-16 e o gson nao le. Aqui o ficheiro e' escrito pelo
    Python, que e' a razao de o problema nao aparecer.
    """
    entrada = RAIZ / "java" / ".casos-gdm.json"
    entrada.write_text(
        json.dumps([[c["texto"], c["erro_esperado"]] for c in casos]),
        encoding="utf-8",
    )

    bash = r"C:\Program Files\Git\bin\bash.exe"
    if os.name == "nt":
        cmd = [bash, "build.sh", "run-gs1-datamatrix", str(entrada)]
    else:
        cmd = ["./build.sh", "run-gs1-datamatrix", str(entrada)]

    r = subprocess.run(cmd, cwd=JAVA, capture_output=True)

    if r.returncode != 0:
        raise SystemExit(
            "  o Java falhou:\n"
            + r.stderr.decode("utf-8", errors="replace")[-1500:]
        )

    return json.loads(r.stdout.decode("utf-8"))


def modulos_diferentes(a: list, b: list) -> list[tuple[int, int]]:
    """As coordenadas onde as duas matrizes divergem, para a mensagem dizer onde."""
    return [
        (y, x)
        for y in range(min(len(a), len(b)))
        for x in range(min(len(a[y]), len(b[y])))
        if a[y][x] != b[y][x]
    ]


def main() -> int:
    casos = casos_do_python()
    resposta = pedir_ao_java(casos)

    print(f"  {len(casos)} casos de Python, comparados com o Java")

    falhas = 0
    recusas = 0

    for caso, java in zip(casos, resposta):
        texto = caso["texto"]

        try:
            codigo = gs1_datamatrix(texto)
        except SimbologiaError as e:
            recusas += 1

            if java.get("erro") is None:
                print(f"  FALHOU {texto:<42} o Java aceita e o Python recusa: {e}")
                falhas += 1
                continue

            print(f"  ok   {texto:<42} os dois recusam")
            continue

        if java.get("erro") is not None:
            print(f"  FALHOU {texto:<42} o Python aceita e o Java recusa: {java['erro']}")
            falhas += 1
            continue

        problemas = []

        for campo in CAMPOS:
            a, b = codigo[campo], java[campo]

            if campo == "modulos":
                onde = modulos_diferentes(a, b)
                if onde:
                    problemas.append(f"modulos: {len(onde)} diferem, a primeira em {onde[0]}")
                continue

            if a != b:
                problemas.append(f"{campo}: python {a!r}, java {b!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {texto:<42} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            continue

        print(
            f"  ok   {texto:<42} {java['linhas']}x{java['colunas']}, "
            f"{len(codigo['codewords'])} codewords, {java['separadores']} FNC1"
        )

    print()
    print(f"  {len(casos) - recusas} codigos, {recusas} recusas, {falhas} falha(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())