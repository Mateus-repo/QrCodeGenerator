"""
Le com o ZXing os GS1-128 que o encoder de **Python** gerou.

Este e' o **nivel 2 do GS1-128 em Python**, e o `AGENTS.md` nao aceita menos: *um
encoder so entra no repositorio depois de o ZXing devolver a string certa.* O
`paridade-gs1.py` mostra que o Python faz o mesmo que o web; este mostra que o
leitor independente le o resultado.

    python web/tests/descodificar-gs1-python.py

## O GS1-128 tem uma coisa que nenhum outro codigo de barras tem

**A comparacao nao e' com o texto, e' com os bytes** — porque o FNC1 de
separador e' um `0x1D` que o `text` do ZXing mostra como `<GS>` e que o `bytes`
mostra cru. **Sao duas representacoes para o mesmo caracter**, e comparar o `text`
com uma cadeia com `0x1D` dava uma falha que parecia um erro do encoder.

E a razao de comparar os bytes e nao o texto e' mais forte aqui do que no Code
93: **o `text` de um GS1-128 sem separadores e' identico ao de um Code 128 com os
mesmos caracteres**. O que os distingue e' o `symbology_identifier`, que diz `]C1`
quando ha FNC1 no inicio e `]C0` quando nao ha. **E por isso que o `]C1` e'
afirmado aqui**: e' a unica coisa que diz ao leitor que aquilo e' um GS1 e nao um
Code 128 com texto ao acaso.

## Os casos vem do encoder de Python, e nao de uma lista aqui

**Duas listas do mesmo conjunto divergem em silencio.** O `AGENTS.md` chama a isso
com as paridades do Code 93 nas stacks que ainda nao o tinham: acrescentar um
formato a lista partida as paridades. Aqui a lista esta em
`python/tests/test_gs1.py` e este script corre o encoder, e nao le um JSON de
uma execucao anterior — pelo mesmo motivo, para nao comparar o encoder de hoje com
o de ontem.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import zxingcpp

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.gs1 import GS, gs1_128  # noqa: E402
from qrcode_core.simbologias.upcean import SimbologiaError  # noqa: E402

#: Quantos pixele por modulo. **Tres**, e nao um nem dois: e' o minimo confiavel
#: para leitores de 1D, e a 2 pixele ja falha em codigos com barras estreitas.
ESCALA = 3

#: Altura em modulos. 1D nao tem altura definida pela norma, mas tem altura minima
#: em fisica: um codigo curto demais nao e lido por leitores de mao.
ALTURA = 60

#: Zona muda. A norma ISO/IEC 15420 pede 10 modulos. E' a zona que garante que o
#: codigo e lido dentro de uma caixa com outras coisas impressas ao lado.
ZONA_MUDA = 10

#: **Os casos sao os de `python/tests/test_gs1.py`, e vem de os correr.**
#:
#: **O `]C1` e' o que diz que isto e' um GS1-128 e nao um Code 128.** O texto e'
#: identico nos dois casos, e o unico sintoma da diferenca e' o identificador.
#: Um codigo que se lê e devolve o texto certo sem o `]C1` e' lido por um sistema
#: GS1 como um Code 128, e o campo de comprimento variavel nao tem separador.
IDENTIFICADOR_GS1 = "]C1"

#: O que o ZXing chama ao formato, **medido**: `Code 128`, com um espaco. A
#: primeira versao comparava com `Code128` — que e' o nome do enumerado no Python e
#: nao o que `str()` devolve — e deu nove falhas de uma vez.
FORMATO_ESPERADO = "Code 128"

#: O que o `GS` e' no `text` do ZXing. **Esta e' a representacao humana, e nao a
#: que se compara** — o `bytes` tem o `0x1D` cru. Um leitor que devolve duas
#: representacoes tem uma para comparar e outra para mostrar a uma pessoa.
GS_NO_TEXT = "<GS>"


def casos_do_python() -> list[dict]:
    """
    Corre a suite do GS1-128 e tira os casos de la.

    **Corre o `pytest` e nao le um ficheiro.** Os casos estao em
    `python/tests/test_gs1.py`, num `CASOS` e num `RECUSAS`, e sao a fonte unica.
    Uma segunda lista aqui seria uma lista que diverge em silencio — que e' o que
    aconteceu ao Code 93, cujo `case` entrou na lista partilhada e rebentou com as
    paridades do Kotlin e do C#.

    E porque e' que se **corre** a suite em vez de a importar: importar um ficheiro
    de testes puxa o `pytest` para dentro deste script, e o que se quer e' a lista
    de casos, nao a execucao da suite.
    """
    r = subprocess.run(
        [
            sys.executable, "-c",
            "import json, sys;"
            "sys.path.insert(0, 'tests');"
            "import test_gs1;"
            "print(json.dumps({'casos': test_gs1.CASOS, 'recusas': test_gs1.RECUSAS}))",
        ],
        cwd=RAIZ / "python",
        capture_output=True,
        text=True,
        check=True,
    )

    import json

    dados = json.loads(r.stdout)
    return [
        {"nome": f"o GS1-128 de {t}", "texto": t, "erro": None}
        for t, _, _ in dados["casos"]
    ] + [
        {"nome": f"a recusa de {t}", "texto": t, "erro": p}
        for t, p in dados["recusas"]
    ]


def renderizar(modulos: list[bool]) -> Image.Image:
    """
    A imagem em tons de cinza a partir da sequencia de modulos.

    **Os modulos ``True`` sao barras escuras**, e um codigo de barras le-se na
    horizontal — por isso a imagem e larga e baixa.

    PIL e nao numpy porque e' o que ja esta instalado, e nao vale a pena
    acrescentar uma dependencia a um script de teste.
    """
    largura = (len(modulos) + ZONA_MUDA * 2) * ESCALA
    altura = ALTURA * ESCALA

    # "L" e tons de cinza: 0 = preto, 255 = branco.
    imagem = Image.new("L", (largura, altura), 255)
    desenho = ImageDraw.Draw(imagem)

    for i, escuro in enumerate(modulos):
        if not escuro:
            continue
        x0 = (i + ZONA_MUDA) * ESCALA
        desenho.rectangle([x0, 0, x0 + ESCALA - 1, altura], fill=0)

    return imagem


def conferir(caso: dict, codigo: dict, lido) -> list[str]:
    """
    O que o ZXing devolve tem de ser o que o encoder pôs.

    Sao quatro coisas e **cada uma apanha um bug diferente**. Todas foram medidas,
    e duas delasContraryam o que eu tinha suposto:

    1. **O `formato` e' `Code 128`, com um espaco.** Nao ha um formato "GS1" no
       ZXing — o GS1-128 e' um Code 128 com FNC1 e o leitor classifica-o pelo
       codigo. **A primeira versao comparava com `Code128`, sem espaco, e deu nove
       falhas de uma vez** — que é o sintoma de um teste de convencao a medir o
       encoder.
    2. **O `symbology_identifier` diz `]C1`, e um Code 128 sem FNC1 diz `]C0`.**
       Medido nos dois, com o mesmo texto. **E' a unica coisa que distingue um
       GS1-128 de um Code 128 com os mesmos caracteres**, e é o que um sistema GS1
       le para saber que tem de interpretar os AIs.
    3. **Os `bytes` sao o `payload`, com o `0x1D` cru.** E' a representacao a
       comparar: o `text` do mesmo codigo **nao** tem o `0x1D`, tem parenteses.
    4. **O `text` e' a legenda, com os AIs entre parenteses.** O ZXing parseia o
       GS1 e devolve a forma humana. **E' a verificacao mais forte das quatro**,
       porque o ZXing tem a sua propria tabela de AIs: se a nossa divergir, o
       `text` dele sai diferente da nossa legenda — mesmo que os `bytes` batam.
    """
    problemas: list[str] = []

    formato = str(lido.format).replace("BarcodeFormat.", "")

    if formato != FORMATO_ESPERADO:
        problemas.append(f"o ZXing disse {formato!r} e esperava {FORMATO_ESPERADO!r}")

    identificador = lido.symbology_identifier
    if identificador != IDENTIFICADOR_GS1:
        problemas.append(
            f"o identificador e' {identificador!r} e nao {IDENTIFICADOR_GS1!r} — "
            "e' o unico sintoma da diferenca entre um GS1-128 e um Code 128"
        )

    esperado = codigo["payload"]
    obtido = lido.bytes.decode("ascii")

    if obtido != esperado:
        problemas.append(f"os bytes sao {obtido!r} e esperava {esperado!r}")
        if obtido.count(GS) != esperado.count(GS):
            problemas.append(
                f"o leitor devolveu {obtido.count(GS)} separadores e o encoder pôs "
                f"{esperado.count(GS)}"
            )

    if lido.text != codigo["legenda"]:
        problemas.append(
            f"o `text` do ZXing e' {lido.text!r} e a legenda e' {codigo['legenda']!r} — "
            "o ZXing tem a sua propria tabela de AIs e decidiu diferente da nossa"
        )

    return problemas


def main() -> int:
    casos = casos_do_python()

    print(f"{len(casos)} casos do encoder de Python, lidos pelo ZXing")

    falhas = 0
    lidos_total = 0

    for caso in casos:
        nome = caso["nome"]
        texto = caso["texto"]

        if caso["erro"] is not None:
            try:
                gs1_128(texto)
                print(f"  FALHOU {nome:<40} devia recusar ({caso['erro']!r})")
                falhas += 1
            except SimbologiaError as e:
                tem = caso["erro"] in str(e)
                marca = "ok   " if tem else "FALHOU"
                if not tem:
                    falhas += 1
                print(f"  {marca} {nome:<40} recusado: {str(e)[:70]}")
            continue

        codigo = gs1_128(texto)

        # **O que se compara e' o `payload`, que tem os separadores.** O
        # `maquina` e' o mesmo texto sem eles, e comparar esse diria que o
        # separador e' opcional.
        #
        # **A contagem de `0x1D` nos bytes e' o que apanha o separador a mais**, e
        # e' a verificacao que os testes estruturais nao fazem: o `modulos` tinha o
        # comprimento certo com o separador a mais, porque um codeword a mais da um
        # codigo que o leitor le.

        imagem = renderizar(codigo["modulos"])
        resultados = zxingcpp.read_barcodes(imagem)

        if not resultados:
            print(f"  FALHOU {nome:<40} o ZXing nao leu nada")
            falhas += 1
            continue

        problemas = conferir(caso, codigo, resultados[0])
        lidos_total += 1

        if problemas:
            print(f"  FALHOU {nome:<40} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            print(f"           o `text` do leitor mostrava {resultados[0].text!r}")
            falhas += 1
            continue

        p = codigo["payload"].replace(GS, "<GS>")
        print(f"  ok   {nome:<40} {len(codigo['modulos'])} modulos, {p}")

    print()
    print(f"  {lidos_total} codigos lidos, {falhas} falha(s)")

    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())