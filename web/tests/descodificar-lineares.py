"""
Le com o ZXing os codigos de barras que o encoder de JavaScript gerou.

Este e o teste de nivel 2 dos lineares. O encoder afirma que desenhou o numero
certo; aqui um leitor independente, que nao viu nada do encoder, diz o que leu.
Se nao bater certo, o encoder esta errado — por mais bonito que o codigo pareca.

    node web/tests/gerar-lineares.mjs > web/tests/.lineares.json
    python web/tests/descodificar-lineares.py

O ficheiro JSON e descartavel: se nao existir, e gerado. Por isso o script pode
ser corrido sozinho.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".lineares.json"

# Quantos pixels por modulo. 3 e o minimo confiavel para leitores de 1D: a
# 1 pixel o ZXing ainda le mas a margem de erro e zero, e a 2 ja falha em
# codigos com barras estreitas.
ESCALA = 3

# Altura em modulos. 1D nao tem altura definida pela norma, mas tem altura
# minima emfisica: um codigo de barras curto demais nao e lido por leitores de
# mao. 60 e o valor habitual em etiquetas.
ALTURA = 60

# Zona muda. A norma ISO/IEC 15420 pede 10 modulos. Passar menos e o leitor
# aceita, mas e a zona que garante que o codigo e lido dentro de uma caixa com
# as outras coisas impressas ao lado.
ZONA_MUDA = 10

# A imagem precisa de estar em tons de cinza, e o ZXing tem dificuldade em
# encontrar codigos que toquem nas bordas. Por isso a altura tem de servir para
# as guardas descem e o texto subir, e a margem de cima e de baixo e folga.


def garantir_json() -> None:
    """Corre o gerador, que escreve o ficheiro.

    Deliberadamente nao se le o resultado de um comando: o `>` do Windows
    PowerShell 5.1 produz UTF-16 e o JSON ficava ilegivel. O Node escreve o
    ficheiro e o Python limita-se a executa-lo.
    """
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(RAIZ / "web" / "tests" / "gerar-lineares.mjs")],
        capture_output=True,
        check=True,
    )


def renderizar(caso: dict) -> Image.Image:
    """Monta a imagem em tons de cinza a partir da sequencia de modulos.

    Os modulos `True` sao barras escuras. Um codigo de barras le-se na
    horizontal, por isso a imagem e larga e baixa.

    PIL e nao numpy porque e o que ja esta instalado, e nao vale a pena
    acrescentar uma dependencia a um script de teste.
    """
    modulos = caso["modules"]
    guardas = set(caso.get("guards", []))

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
        y1 = int(ALTURA * (0.9 if i in guardas else 0.8)) * ESCALA
        desenho.rectangle([x0, 0, x0 + ESCALA - 1, y1], fill=0)

    return imagem


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))

    falhas = 0
    for caso in casos:
        imagem = renderizar(caso)
        lidos = zxingcpp.read_barcodes(imagem)

        if not lidos:
            falhas += 1
            print(f"  FALHOU {caso['symbology']:<8} {caso['entrada']}: o ZXing nao leu nada")
            continue

        codigo = lidos[0]
        texto = codigo.text
        formato = str(codigo.format).replace("BarcodeFormat.", "")

        # O UPC-A e lido tanto como UPC-A (12 digitos) como EAN-13 (13, com o
        # zero a esquerda). Os dois estao correctos porque e a mesma matriz, e o
        # ZXing escolhe o EAN-13.
        aceitas = {caso["esperado"]}
        formatos_aceites = {caso["formato"]}

        # O ITF-14 e lido como ITF. A unica diferenca entre os dois e a
        # moldura de paragem, e o ZXing nao distingue os formatos.
        if caso["formato"] == "ITF14":
            formatos_aceites.add("ITF")

        if caso["formato"] == "UPCA":
            aceitas.add("0" + caso["esperado"])
            formatos_aceites.add("EAN13")

        # O ZXing devolve os nomes como "EAN-13" e "Code 128", com hifen e com
        # espaco, e o enum de Python sem nenhum dos dois. Compara-se so com as
        # letras e os digitos, para nao se estar a discutir ortografia enquanto
        # o numero esta certo — que e o que interessa.
        def normalizar(f: str) -> str:
            return "".join(c for c in f if c.isalnum()).upper()

        ok_texto = texto in aceitas
        ok_formato = normalizar(formato) in {normalizar(f) for f in formatos_aceites}

        if ok_texto and ok_formato:
            print(f"  ok     {caso['symbology']:<8} {caso['entrada']} -> {texto} ({formato})")
        else:
            falhas += 1
            print(f"  FALHOU {caso['symbology']:<8} {caso['entrada']}")
            print(f"           esperava {sorted(aceitas)} como {sorted(formatos_aceites)}")
            print(f"           leu      {texto!r} como {formato}")

    JSON.unlink(missing_ok=True)

    print()
    if falhas:
        print(f"{falhas} de {len(casos)} codigos de barras nao sobreviveram a leitura pelo ZXing.")
        return 1

    print(f"Todos os {len(casos)} codigos de barras gerados pelo encoder JS sao legiveis pelo ZXing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
