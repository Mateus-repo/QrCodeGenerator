"""
Le os SQRC **com logotipo** com o ZXing e compara os bytes.

    node web/tests/gerar-sqrc-frameqr.mjs
    python web/tests/descodificar-sqrc-frameqr.py

Este e' o **nivel 3 do SQRC**, e a propriedade que ele verifica e' diferente da
do nivel 2. O `descodificar-sqrc.py` diz que **os bytes do contentor chegam
intactos** — a propriedade da cifra. Este diz que **o QR com a zona apagada
ainda se lê** — a propriedade da correcção de erros.

Porque sao dois ficheiros
-------------------------

**Porque sao duas propriedades, e juntá-las seria verificar uma e falhar a
outra em silêncio.** Um SQRC com um modulo apagado a mais lê-se na mesma — com o
texto errado — e a falha so apareceria a quem tentasse descifrar, com o erro de
"chave errada". O sintoma aponta para a chave, que está impecável, e não para o
código, que tem um buraco do tamanho de um logotipo.

E' o mesmo mecanismo do bug do descentrado de quatro modulos: o QR continuava a
ler, o desenho saía torto, e nenhum teste falhava. **Por isso o que se exporta
tem de se ler E estar no sítio.**

A comparação é de **bytes**, e não de texto
------------------------------------------

**O atributo `text` do ZXing assume ISO-8859-1 sem ECI**, e num formato binário
dá sempre o resultado errado. A base64 tem de ser comparada caractere a
caractere: é a única forma de notar um módulo trocado que ainda produz um QR
legível.

O controlo em cada par
----------------------

Cada payload vai duas vezes: uma sem logotipo e uma com. **Sem o controlo, um
renderizador de teste defeituoso aparece como "a correcção de erros não
funciona"** — e a investigação começa pelo sítio errado, que é a
implementação do ZXing e não a correcção de erros.

E o limite de 2.7%
------------------

O `modulosMaximos` é medido com o ZXing, não deduzido da percentagem teórica da
norma. Os casos aqui vão até aos 2.7% de módulos apagados, e a razão de o limite
ser esse e não o teórico é a mesma que vale para o QR: **a teórica é 4 a 6 vezes
o que um QR pequeno aguenta**, e usá-la dá logotipos que às vezes leem — o pior
resultado possível, porque o defeito só aparece no cartão impresso.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
DADOS = AQUI / ".sqrc-frameqr.json"

# A escala da imagem. O SVG de cada caso é grande, e o ZXing precisa de margem
# para amostrar os módulos com folga — sem isso um módulo de um pixel pode cair
# entre duas amostras e o leitor falha por um motivo que nao tem nada a ver com a
# correcção de erros.
ESCALA = 6

# A zona calma, em módulos. **A mesma que o `qrcode.js` usa.** Sem ela o leitor
# pode nao encontrar o código, e o sintoma seria um falso negativo deste teste —
# que é pior do que um teste que não existe, porque dá a ideia de que o
# encoder falhou.
MARGEM = 4


def imagem_da_matriz(modulos: list[list[int]], escala: int):
    """A matriz numa imagem PIL, com zona calma.

    **PIL e não `zxingcpp.ImageView`:** o `ImageView` quer um `ndarray` do numpy,
    que é mais uma dependência para um ganho nenhum. O `read_barcodes` aceita uma
    `Image` do PIL directamente, e é o que `descodificar.py` já usa.
    """
    from PIL import Image, ImageDraw

    altura = len(modulos)
    largura = len(modulos[0])
    total_l = (largura + 2 * MARGEM) * escala
    total_a = (altura + 2 * MARGEM) * escala

    imagem = Image.new("L", (total_l, total_a), 255)
    desenho = ImageDraw.Draw(imagem)

    for y, linha in enumerate(modulos):
        for x, valor in enumerate(linha):
            if not valor:
                continue
            desenho.rectangle(
                [
                    (x + MARGEM) * escala,
                    (y + MARGEM) * escala,
                    (x + MARGEM + 1) * escala - 1,
                    (y + MARGEM + 1) * escala - 1,
                ],
                fill=0,
            )

    return imagem


def main() -> int:
    if not DADOS.exists():
        print("Falta o .sqrc-frameqr.json. Corre primeiro:  node web/tests/gerar-sqrc-frameqr.mjs")
        return 1

    casos = json.loads(DADOS.read_text(encoding="utf-8"))["casos"]
    problemas = []
    lidos = 0
    com_logotipo = 0

    for caso in casos:
        nome = f"{caso['ecl']} v{caso['version']} {'controlo' if caso['controlo'] else 'logo'}"
        imagem = imagem_da_matriz(caso["modules"], ESCALA)

        resultados = zxingcpp.read_barcodes(imagem, formats=zxingcpp.BarcodeFormat.QRCode)

        if not resultados:
            problemas.append(
                f"{nome} ({caso['modulosApagados']} modulos apagados): o ZXing nao leu o QR"
            )
            continue

        obtido = bytes(resultados[0].bytes).decode("ascii")

        if obtido != caso["base64"]:
            problemas.append(
                f"{nome} ({caso['modulosApagados']} modulos apagados): "
                f"a base64 que voltou nao e' a que entrou\n"
                f"    entrou {len(caso['base64'])} caracteres, voltaram {len(obtido)}"
            )
            continue

        lidos += 1
        if not caso["controlo"]:
            com_logotipo += 1

        print(
            f"  {nome:16} {caso['size']}x{caso['size']}"
            f"  {caso['modulosApagados']:>3} apagados"
            f" ({caso['percentagem']:>4}%)  lido"
        )

    if problemas:
        print()
        for p in problemas:
            print(f"  {p}")
        print()
        print("Um SQRC com a zona apagada a mais ainda se le — com o texto errado. Quem")
        print("descifrar ve 'chave errada', e a pista aponta para a chave, que esta impecavel.")
        return 1

    print()
    print(f"Os {lidos} SQRC leem-se com os bytes intactos, {com_logotipo} deles com a zona do logotipo apagada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
