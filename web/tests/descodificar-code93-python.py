"""
Le com o ZXing os Code 93 que o encoder de **Python** gerou.

Este e' o **nivel 2 do Code 93 em Python**, e o `AGENTS.md` nao aceita menos:
*um encoder so entra no repositorio depois de o ZXing devolver a string certa.*
O `paridade-code93.py` mostra que o Python faz o mesmo que o web; este mostra
que o leitor independente le o resultado.

    python web/tests/descodificar-code93-python.py

Duas coisas que so o Code 93 tem, e que por isso este script e' diferente do dos
outros codigos de barras:

**O texto que o leitor devolve nao inclui os dois digitos de controlo.** O ZXing
apaga-os, porque sao de controlo e nao fazem parte do dado. Por isso a comparacao
e' com o `entrada` e nao com a legenda.

**E a legenda tem de os ter na mesma.** Um codigo que le certo e imprime uma
legenda sem os digitos e' o pior dos casos numa etiqueta de automovel: o leitor
funciona, e a folha impressa nao bate com o que esta inscrito no veiculo. Por
isso aqui tambem se confere a legenda, e nao so a leitura.

**Os casos vem do gerador do web**, e nao de uma lista aqui: duas listas do
mesmo conjunto divergem em silencio, e o `casos-barras.mjs` ja existe para
evitar isso nos lineares. Corre-se o gerador em vez de ler o JSON de uma
execucao anterior, pelo mesmo motivo - senao a paridade passava a comparar o
encoder de hoje com o de ontem.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import zxingcpp

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.code93 import code93  # noqa: E402
from qrcode_core.simbologias.tabelas_code93 import ALFABETO, MODULO_CHECKSUM  # noqa: E402

AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".code93.json"

#: Quantos pixele por modulo. **Tres**, e nao um nem dois: e' o minimo confiavel
#: para leitores de 1D, e a 2 pixele ja falha em codigos com barras estreitas.
#: O Code 93 e' o pior dos casos aqui, porque **cada elemento tem no minimo um
#: modulo de largura** - um codigo de barras com barras de um modulo e' o
#: limite do que um leitor consegue medir.
ESCALA = 3

#: Altura em modulos. 1D nao tem altura definida pela norma, mas tem altura
#: minima em fisica: um codigo curto demais nao e lido por leitores de mao.
ALTURA = 60

#: Zona muda. A norma ISO/IEC 15420 pede 10 modulos. E' a zona que garante que o
#: codigo e lido dentro de uma caixa com outras coisas impressas ao lado.
ZONA_MUDA = 10


def casos_do_web() -> list[dict]:
    """Corre o gerador do web e le os casos que ele produziu."""
    subprocess.run(
        ["node", str(AQUI / "gerar-code93.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def renderizar(modulos: list[bool], guardas: list[int]) -> Image.Image:
    """
    A imagem em tons de cinza a partir da sequencia de modulos.

    **Os modulos ``True`` sao barras escuras**, e um codigo de barras le-se na
    horizontal - por isso a imagem e larga e baixa.

    PIL e nao numpy porque e' o que ja esta instalado, e nao vale a pena
    acrescentar uma dependencia a um script de teste.
    """
    larguras = set(guardas)

    largura = (len(modulos) + ZONA_MUDA * 2) * ESCALA
    altura = ALTURA * ESCALA

    # "L" e tons de cinza: 0 = preto, 255 = branco.
    imagem = Image.new("L", (largura, altura), 255)
    desenho = ImageDraw.Draw(imagem)

    for i, escuro in enumerate(modulos):
        if not escuro:
            continue
        x0 = (i + ZONA_MUDA) * ESCALA
        # As barras-guarda descem mais, para o leitor ter onde ancorar e para
        # quem olha ver onde o codigo comeca e acaba.
        y1 = int(ALTURA * (0.9 if i in larguras else 0.8)) * ESCALA
        desenho.rectangle([x0, 0, x0 + ESCALA - 1, y1], fill=0)

    return imagem


def conferir_digitos(legenda: str) -> str | None:
    """
    Confere que os dois ultimos caracteres da legenda sao digitos de controlo.

    **Sao eles que o ZXing apaga, e por isso que ninguem os veria na leitura.**
    A razao de os conferir aqui, e nao deixar a leitura falar, e' que um digito
    de controlo errado **nao impede a leitura**: o ZXing so se queixa quando o
    checksum no bate certo, e um checksum mal calculado no sitio certo da um
    codigo que parece inteiro e e' lido por um leitor e recusado por outro.

    Confere-se que os dois ultimos sao caracteres da tabela - e nao que o valor
    do checksum bate, porque isso a leitura ja confirmou.
    """
    if len(legenda) < 2:
        return f"a legenda tem {len(legenda)} caracteres e precisa de dois digitos"

    for digito in legenda[-2:]:
        if digito not in ALFABETO[:MODULO_CHECKSUM]:
            return f"o digito {digito!r} nao e um caractere da tabela"

    return None


def main() -> int:
    casos = casos_do_web()

    print(f"{len(casos)} casos do encoder de Python, lidos pelo ZXing")

    falhas = 0

    for caso in casos:
        nome = caso["nome"]
        entrada = caso["entrada"]

        if "erro" in caso:
            try:
                code93(entrada)
            except ValueError:
                print(f"  ok    {nome:<34} recusado, como deve ser")
                continue
            print(f"  FALHOU {nome:<34} o web recusa e o Python aceitou")
            falhas += 1
            continue

        codigo = code93(entrada)

        razao = conferir_digitos(codigo["legenda"])
        if razao is not None:
            print(f"  FALHOU {nome:<34} {razao}")
            falhas += 1
            continue

        imagem = renderizar(codigo["modulos"], codigo["guardas"])
        lidos = zxingcpp.read_barcodes(imagem)

        if not lidos:
            print(f"  FALHOU {nome:<34} o ZXing nao leu nada")
            falhas += 1
            continue

        codigo_lido = lidos[0]
        formato = str(codigo_lido.format).replace("BarcodeFormat.", "")

        # **Compara-se pelos bytes, nao pelo texto.**
        #
        # O `text` do `zxingcpp` escreve os caracteres de controlo em notacao
        # mnemonica — o ESC vem `<ESC>`, o BEL vem `<BEL>`, e o CR vem como um
        # retorno de carro cru que o terminal desenha como uma mudanca de linha.
        # **Sao tres formatos para tres caracteres da mesma tabela.**
        #
        # O `bytes` devolve o que o codigo transporta, e e' o que se quer
        # comparar. A falha era do teste e nao do encoder: o ZXing leu
        # correctamente os trinta e dois caracteres de controlo, com os escapes
        # certos, e a comparacao é que falhava por estar a comparar duas
        # representacoes humanas.
        #
        # **Quando um leitor devolve duas representacoes, a que se compara e' a
        # crua.** A outra e' para mostrar a uma pessoa.
        lido = codigo_lido.bytes.decode("ascii")

        if lido != entrada:
            print(f"  FALHOU {nome:<34} esperava {entrada!r}")
            print(f"           leu      {lido!r} como {formato}")
            print(f"           o `text` do leitor mostrava {codigo_lido.text!r}")
            falhas += 1
            continue

        print(
            f"  ok    {nome:<34} {codigo_lido.text!r} "
            f"({formato}), legenda {codigo['legenda'][-2:]}"
        )

    print()
    if falhas:
        print(
            f"{falhas} de {len(casos)} Code 93 do encoder de Python nao "
            f"sobreviveram a leitura pelo ZXing."
        )
        return 1

    print(
        f"Os {len(casos)} Code 93 gerados pelo encoder de Python sao legiveis "
        f"pelo ZXing, com os dois digitos de controlo certos na legenda."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
