"""Paridade entre o GS1 DataMatrix do Python e o do web, codeword a codeword.

    python web/tests/paridade-gs1-datamatrix-python.py

**E' o teste de verdade do encoder novo.** O `descodificar-gs1-datamatrix-python.py`
le o que o ZXing devolve; este compara os dois encoders sobre os mesmos casos.

A ordem importa e e' a que a `AGENTS.md` manda: primeiro a paridade, que apanha uma
divergencia em segundos e sem dependencias; so depois a leitura, que apanha o que a
paridade nao apanha.

## O que se compara, e porque sao cinco coisas

**Os `codewords` sao a comparacao principal**, e nao a imagem. E' o formato de fio: e' o
que o ZXing le, e o numero de modulos e' o mesmo para varios conjuntos de codewords - um
GS1 DataMatrix com o 232 no sitio errado desenha-se identico e le-se com o campo
partido.

  - **`codewords`** apanha o separador a mais ou a menos, e o modo de digitos errado
    (que dobra o numero de codewords sem dar erro nenhum);
  - **`modulos`** apanha a divergencia na correccao de erros ou na colocacao, que os
    codewords ainda nao veem porque so a fase de desenho os poe na grelha;
  - **`payload`** e' a forma de maquina, com o `0x1D` onde o encoder o pos - e e' a
    lista de comparacao com o `bytes` do ZXing;
  - **`gs1`** e' a forma humana, com os AI entre parenteses e sem separadores;
  - **`separadores`** e' a contagem de FNC1, que e' a afirmacao a parte e nao um
    subproduto.

## Uma recusa e' um resultado, e nao uma excepcao

O `gerar-gs1-datamatrix-python.mjs` poe `erro: null` quando o web **aceita** um caso
que devia recusar. **E' o resultado mais grave que este script pode dar** - o Python
tambem recusaria, a paridade passava, e o sintoma seria uma etiqueta impressa com um
campo a mais. Por isso esta' aqui separado do resto: uma excepcao que os dois lados
levantam e' concordancia; uma excepcao que so um levanta nao e'.
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

AQUI = RAIZ / "web" / "tests"

#: **O `.gs1-datamatrix-python.json` nao e' o `.gs1-datamatrix.json`.** O do web e' do
#: GS1 DataMatrix **dele**, e a primeira versao desta script escrevia por cima dele - o
#: sintoma foi o `descodificar-gs1-datamatrix.py` do web a dar `KeyError: 'entrada'`,
#: porque os casos de Python tinham substituido os casos do web.
#:
#: **Dois geradores para o mesmo ficheiro sao o mesmo bug dos dois registos**, e e' o
#: que a `AGENTS.md` chama lista escrita duas vezes.
JSON = AQUI / ".gs1-datamatrix-python.json"

#: O que se compara, e o nome de cada coisa. **A lista e' a mesma em todas as stacks**,
#: e e' a que o `casos-barras.mjs` impoe para os 1D: um formato que ninguem implementa
#: nao se compara, e um formato declarado sem casos nao se verifica.
CAMPOS = ("codewords", "modulos", "payload", "gs1", "separadores")


def casos_do_web() -> list[dict]:
    """Corre o gerador do web e le os casos que ele produziu.

    **Corre-se o gerador, e nao le-se o JSON de uma execucao anterior.** Comparar o
    encoder de hoje com o de ontem nao apanha divergencia nenhuma.
    """
    subprocess.run(
        ["node", str(AQUI / "gerar-gs1-datamatrix-python.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def modulos_diferentes(a: list, b: list) -> list[tuple[int, int]]:
    """As coordenadas onde as duas matrizes divergem.

    **A comparacao e' elemento a elemento, e nao `!=` nas listas inteiras**: dizer
    "as listas sao diferentes" nao diz *onde*, e uma diferenca num unico modulo e' o
    que interessa. E uma lista de coordenadas cabe numa linha de mensagem; a matriz
    nao.
    """
    return [
        (y, x)
        for y in range(min(len(a), len(b)))
        for x in range(min(len(a[y]), len(b[y])))
        if a[y][x] != b[y][x]
    ]


def main() -> int:
    casos = casos_do_web()

    print(f"{len(casos)} casos do web, comparados com o Python")

    falhas = 0
    recusas = 0

    for caso in casos:
        nome = caso["nome"]
        texto = caso["entrada"]

        try:
            codigo = gs1_datamatrix(texto)
        except SimbologiaError as e:
            recusas += 1

            if caso["erro"] is None:
                print(f"  FALHOU {nome:<44} o web aceita e o Python recusa: {e}")
                falhas += 1
                continue

            # **As duas recusas tem de ser pela mesma razao.** Um caso de recusa que
            # os dois recusam por motivos diferentes e' um caso em que um dos dois
            # recusa pela razao errada.
            if caso["erro"][:30] != str(e)[:30]:
                print(f"  FALHOU {nome:<44} recusam por razões diferentes")
                print(f"           web    {caso['erro'][:90]}")
                print(f"           python {str(e)[:90]}")
                falhas += 1
                continue

            print(f"  ok   {nome:<44} os dois recusam")
            continue

        if caso["erro"] is not None:
            print(f"  FALHOU {nome:<44} o Python aceita e o web recusa: {caso['erro']}")
            falhas += 1
            continue

        problemas = []

        for campo in CAMPOS:
            a = codigo[campo]
            b = caso[campo]

            if campo == "modulos":
                onde = modulos_diferentes(a, b)
                if onde:
                    problemas.append(
                        f"modulos: {len(onde)} diferem, a primeira em {onde[0]}"
                    )
                continue

            if a != b:
                problemas.append(f"{campo}: python {a!r}, web {b!r}")

        if problemas:
            print(f"  FALHOU {nome:<44} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            falhas += 1
            continue

        print(
            f"  ok   {nome:<44} {caso['linhas']}x{caso['colunas']}, "
            f"{len(codigo['codewords'])} codewords, {caso['separadores']} FNC1"
        )

    print()
    print(f"  {len(casos) - recusas} codigos, {recusas} recusas, {falhas} falha(s)")

    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())