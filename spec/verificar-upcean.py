"""
Desenha as simbologias de Python e le-as de volta com o ZXing.

    python spec/verificar-upcean.py

## A regra que este script cumpre

A `AGENTS.md` e' explicita sobre codigos de barras: **as tabelas nunca se
escrevem de memoria**, e um encoder so entra no repositorio **depois de o ZXing
devolver a string certa**. Nao ha "quase", nao ha parcial.

Este script e' a segunda metade dessa regra. O `test_upcean.py` compara as
tabelas com o `python-barcode` — a nivel zero, que e' o mais barato e o que mais
apanha. **Este compara a saida com um leitor independente**, que e' o unico
nivel que apanha um encoder com a geometria certa e a silhueta errada.

## O que um leitor devolve, e porque isso nao basta sozinho

O ZXing devolve `text`, e `text` e' a cadeia que o *leitor* montou a partir dos
modulos. Um EAN-13 tem uma propriedade que nenhum outro formato deste
repositorio tem: **o digito de controlo vem do proprio codigo**, e um leitor
verifica-o. Um EAN-13 com o digito errado da um erro de "digito invalido" que
nao distingue um encoder partido de um numero mal escrito.

Por isso este script confere **duas coisas em separado**: que o leitor devolve a
mesma cadeia, e que a cadeia que ele devolve tem o digito de controlo certo. A
segunda e' redundante para o ZXing — que ja a verificou — e e' o que torna o
teste honesto: **se um dia o ZXing deixar de verificar, este script da erro.**

## Porque a sao e' por stdout e nao um ficheiro

O `>` do Windows PowerShell 5.1 produz UTF-16, e o Python depois falha a ler. Da
mesma razao que `spec/gerar-vectors.py` escreve com `write_text` e nao com
redireccionamento.
"""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias import SIMBOLOGIAS  # noqa: E402
from qrcode_core.simbologias.upcean import digito_de_controlo  # noqa: E402

#: Os valores de teste, **sem o digito de controlo** — porque e' isso que a
#: pessoa escreve e o que o encoder recebe.
#:
#: **O primeiro e' o exemplo do manual da GS1**, e nao um numero que eu escolhi:
#: e' o mesmo que a `AGENTS.md` cita do Code 39 e do ITF, e um codigo lido por
#: leitores reais e' o que prova que o ZXing e' o leitor certo.
#:
#: O encoder calcula o digito de controlo e o poe no fim. **Aceitar tambem o
#: numero completo seria mais simpatico**, e e' uma decisao que vale para as
#: sete stacks ao mesmo tempo — aceitar uma coisa num cliente e nao noutro e' um
#: bug de paridade, mesmo que o teste desse cliente passe.
ENTRADAS = [
    ("ean13", "400638133393"),
    ("ean13", "590123412345"),
    ("ean13", "036000291452"),
    ("ean13", "123456789012"),
    ("ean13", "000000000000"),
    ("ean8", "9638507"),
    ("ean8", "5512345"),
    ("upca", "03600029145"),
    ("upca", "01234567890"),
]


def aceitos(legenda: str, tipo: str) -> set[str]:
    """
    As formas que o leitor pode devolver, e sao **mais do que uma** so para o
    UPC-A.

    **Um UPC-A e' um EAN-13 com um zero a esquerda, e o leitor reporta-o como
    EAN-13.** O ZXing devolve `0036000291452` para um UPC-A de
    `036000291452` — treze digitos com dois zeros, porque e' assim que o codigo
    se identifica e como a GS1 o cataloga.

    **Isto nao e' uma divergencia do encoder, e' a verdade sobre o formato**, e o
    `web/tests/descodificar-lineares.py` ja a trata do mesmo modo. A razao de
    ficar escrito aqui e' que a primeira vez que se ve um leitor devolver treze
    digitos para um codigo de doze, a leitura natural e' que o encoder tem uma
    barra a mais.
    """
    if tipo == "upca":
        return {legenda, "0" + legenda}
    return {legenda}


def main() -> int:
    try:
        import zxingcpp
        from PIL import Image
    except ImportError:
        print(
            "Faltam o Pillow e o zxing-cpp.\n"
            "  python -m pip install Pillow zxing-cpp\n"
            "\n"
            "Estes casos **nao podem ser escritos a mao** — a regra e' que um "
            "codigo de barras so entra no repositorio depois de um leitor "
            "independente devolver a string certa.",
            file=sys.stderr,
        )
        return 1

    print(f"{'caso':22} {'simbologia':10} {'modulos':>8}  leitor")
    print("-" * 68)

    problemas: list[str] = []

    for tipo, entrada in ENTRADAS:
        codigo = SIMBOLOGIAS[tipo](entrada)
        valor = entrada
        modulos = codigo["modulos"]
        legenda = codigo["legenda"]

        # O digito de controlo, conferido por nos antes de tudo o resto. E' o
        # unico sitio onde um numero mal escrito se parece com um encoder
        # partido, e por isso que vai primeiro.
        sem_controlo = legenda[:-1]
        esperado = digito_de_controlo(sem_controlo)
        if int(legenda[-1]) != esperado:
            problemas.append(
                f"{tipo}/{valor}: o digito de controlo e' {legenda[-1]} e o certo e' {esperado}"
            )

        # O desenho, e a leitura de volta.
        import io

        from qrcode_core.simbologias.desenho import to_bitmap

        png = to_bitmap(modulos, escala=3, guardas=codigo["guardas"])
        imagem = Image.open(io.BytesIO(png))
        resultado = zxingcpp.read_barcode(imagem)

        if resultado is None:
            problemas.append(f"{tipo}/{valor}: o ZXing nao leu o codigo")
            estado = "NAO LEU"
        elif resultado.text not in aceitos(legenda, tipo):
            problemas.append(
                f"{tipo}/{valor}: o ZXing devolveu {resultado.text!r} e o esperado e' {legenda!r}"
            )
            estado = f"DIVERGE ({resultado.text})"
        else:
            estado = "ok"

        print(f"{tipo + ' ' + valor:22} {codigo['simbologia']:10} {len(modulos):8}  {estado}")

    print("-" * 68)

    if problemas:
        print(f"\n{len(problemas)} problemas:")
        for p in problemas:
            print(f"  {p}")
        return 1

    print(f"\nTodos os {len(ENTRADAS)} codigos foram lidos pelo ZXing com a string certa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
