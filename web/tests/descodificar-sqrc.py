"""
Le os QR de conteudo cifrado (SQRC) com o ZXing e compara os **bytes**.

    node web/tests/gerar-sqrc.mjs
    python web/tests/descodificar-sqrc.py

O que este teste NAO faz, e porquê
-----------------------------------

**Nao descifra, e nao pode.** O ZXing le o QR e devolve os bytes do contentor,
que e' o que deve acontecer. Nao ha leitor de SQRC em lado nenhum - o que
descifra e' a aplicacao de quem tem a chave, e nao uma camera. Entao este nivel
2 verifica a unica coisa que da para verificar sem a chave.

O que verifica, e porque e' mais forte do que parece
----------------------------------------------------

**Que o ZXing devolve exactamente os bytes que lhe foram dados.** Nem um a mais,
nem a menos.

Um SQRC que o ZXing lê com um byte a mais ou a menos e' um QR perfeitamente
normal: desenha-se, le-se, e parece estar tudo bem. A falha so apareceria a
quem tentasse descifrar - e apareceria com o erro de "chave errada", a
apontar para o software e nao para o codigo. Quem vai ao terreno verificar a
etiqueta vai suspectar do primeiro que viu, que e' o software.

E' por isso que a comparacao e' de **bytes** e nao de texto. O ZXing devolve o
que leu em `bytes` (UTF-8) e em `text`, e o atributo `text` **assume ISO-8859-1
sem ECI** - o que neste formato daria sempre o resultado errado, porque o
conteudo e' binario. Comparar `text` aqui nao seria um teste mais fraco: seria
um teste errado.

A base64 tem duas camadas onde um byte se pode perder
----------------------------------------------------

O conteudo vai em **base64** para dentro do QR, e nao em bytes crus. A razao e'
que um `Uint8Array` tem bytes que nao sao caracteres, e metê-los num QR em modo
byte da um codigo com bytes invalidos, que o ZXing leria com substituicoes.

Ha portanto uma perda possivel na codificacao, e outra na descodificacao que o
ZXing faz do modo byte. Comparar os bytes do contentor de ponta a ponta apanha
as duas; comparar o texto apanha nenhuma.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
DADOS = AQUI / ".sqrc.json"

# A escala da imagem. O conteudo cifrado em base64 e' mais comprido que o texto
# original - em base64 sao 4 caracteres por 3 bytes, e o AES-GCM acrescenta 28
# bytes - por isso que um simbolo pequeno fica grande. A escala tem de chegar
# para o leitor amostrar bem.
ESCALA = 6

# A zona calma, em modulos. **A mesma que o `qrcode.js` usa.** Sem ela o leitor
# pode nao encontrar o codigo, e o sintoma seria um falso negativo deste teste -
# que e' pior do que um teste que nao existe, porque da a ideia de que o
# encoder falhou.
MARGEM = 4


def imagem_da_matriz(modulos: list[list[int]], escala: int):
    """A matriz de modulos numa imagem PIL, com zona calma e a escala pedida.

    **PIL e nao `zxingcpp.ImageView`, e a razao e' o que os outros testes usam.**
    O `ImageView` do `zxingcpp` quer um `ndarray` do numpy, que e' mais uma
    dependencia para um ganho nenhum: o `read_barcodes` aceita uma `Image` do
    PIL directamente, e e' o que `descodificar.py` ja usa para os QR normais.
    A primeira versao deste script construia um `bytearray` a mao e passava-o ao
    `ImageView`, que dava um erro de argumentos que nao dizia nada sobre o
    problema - a mensagem era sobre os tipos, e o que estava mal era a via.
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
                continue  # modulo claro: ja esta branco
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
        print("Falta o .sqrc.json. Corre primeiro:  node web/tests/gerar-sqrc.mjs")
        return 1

    dados = json.loads(DADOS.read_text(encoding="utf-8"))
    casos = dados["casos"]
    problemas = []

    for caso in casos:
        nome = caso["nome"]
        imagem = imagem_da_matriz(caso["conteudo"], ESCALA)

        resultados = zxingcpp.read_barcodes(imagem, formats=zxingcpp.BarcodeFormat.QRCode)

        if not resultados:
            problemas.append(f"{nome}: o ZXing nao leu o QR")
            continue

        lido = resultados[0]

        # **A base64 que volta, e nao os bytes do contentor.**
        #
        # O que vai no QR e' a **base64** do contentor, e nao os bytes: um
        # `Uint8Array` tem bytes que nao sao caracteres, e metê-los num QR em
        # modo byte daria um codigo com bytes invalidos, que o ZXing leria com
        # substituicoes.
        #
        # A primeira versao comparava `base64.b64encode(bytes(lido.bytes))` com
        # a base64 do contentor, e falhava nos sete casos com "o contentor tinha
        # 30 bytes e o QR devolveu 40". **40 e' o numero de caracteres de
        # base64 e 30 e' o numero de bytes** - as unidades certas uma ao lado da
        # outra, e o erro parecia um byte trocado no QR quando o QR estava
        # perfeitamente certo: a base64 e' 4/3 do tamanho, e 30 bytes dao 40
        # caracteres, sempre.
        #
        # A propriedade a verificar e' a mesma e mais forte: **a base64 que
        # volta tem de ser identica, caractere a caractere.** Um byte trocado em
        # qualquer das duas camadas - na codificacao, ou na descodificacao que o
        # ZXing faz do modo byte - muda a base64, e o descifrar falha com
        # "chave errada" a apontar para o software em vez de para o codigo.
        obtido = bytes(lido.bytes).decode("ascii")

        if obtido != caso["base64"]:
            problemas.append(
                f"{nome}: a base64 que voltou nao e' a que entrou\n"
                f"    entrou {len(caso['base64'])} caracteres, voltaram {len(obtido)}"
            )
            continue

        # E o round-trip completo: a base64 lida tem de dar outra vez os bytes
        # originais do contentor. E' a segunda camada, e e' a que apanha um bug
        # de codificacao em vez de um de transporte.
        if base64.b64decode(obtido) != base64.b64decode(caso["base64"]):
            problemas.append(f"{nome}: a base64 volta aos bytes errados")
            continue

        if len(base64.b64decode(obtido)) != caso["tamanho"]:
            problemas.append(
                f"{nome}: o contentor tinha {caso['tamanho']} bytes"
                f" e a base64 devolveu {len(base64.b64decode(obtido))}"
            )
            continue

        print(
            f"  {nome:<14} {len(obtido):>5} caracteres de base64,"
            f" versao {caso['versao']}, id {caso['tamanhoId']} bytes"
        )

    if problemas:
        print()
        for p in problemas:
            print(f"  {p}")
        print()
        print("Um SQRC com um byte a mais ou a menos nao da erro nenhum ate alguem")
        print("tentar descifrar - e o erro que aparece e' 'chave errada', a pista errada.")
        return 1

    print()
    print(f"Os {len(casos)} SQRC vao de ponta a ponta com os bytes intactos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
