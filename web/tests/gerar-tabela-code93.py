"""
Gera ``web/symbologies/code93-tabelas.js`` a partir da referencia.

    python web/tests/gerar-tabela-code93.py

Porque e' gerado e nao escrito a mao
------------------------------------

**A tabela do Code 93 e' a mais antipatica de todas as que este repositorio
tem**, e a razao e' que nao e' uma lista de padroes em texto: sao **48 inteiros
em hexadecimal, de nove bits cada**, em que o bit menos significativo da
esquerda diz se o elemento e' largo e o seguinte diz o comprimento. Nao se
transcreve isso de memoria nem se revisa a olho: uma troca em dois caracteres
produz um codigo que se desenha perfeito, tem o checksum certo e **nao e' lido
por nada**.

E' a mesma razao que fez a tabela do Code 39 ser extraida - e essa ja falhou uma
vez, com doze elementos por caracter em vez de nove, apanhado pelo leitor e nao
por nenhum teste estrutural.

De onde vem
-----------

Da implementacao de referencia do **ZXing** (``Code93Reader.java``), que e'
tambem o leitor que vai verificar o que este encoder produz. Nao ha um pacote de
Python com o Code 93 instalado - o ``python-barcode`` nao o tem - e a fonte
publica mais limpa e' a do ZXing.

Os 48 valores
-------------

Os ultimos quatro sao **caracteres de controle** (os leitores do ZXing põem-nos como
letras a, b, c, d para os imprimir) e o ultimo e' o asterisco, que marca o inicio
e o fim. O Code 93 tem entao 43 caracteres de dados mais 4 de controle mais o
asterisco, e e' por isso que o modulo do checksum e' 47 e nao 43: contam o
asterisco e os de controle, e nao os dados.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
DESTINO = RAIZ / "web" / "symbologies" / "code93-tabelas.js"

ORIGEM = (
    "https://raw.githubusercontent.com/zxing/zxing/master/core/src/main/java/"
    "com/google/zxing/oned/Code93Reader.java"
)

CABECALHO = '''/**
 * As tabelas do Code 93. **Gerado** por `tests/gerar-tabela-code93.py`.
 *
 * Sao 48 inteiros de nove bits, e nao padroes em texto, que e' o que torna esta
 * tabela diferente de todas as outras do repositorio. Cada inteiro tem nove bits
 * significant, e cada par de bits diz uma coisa: o primeiro e' o bit menos
 * significativo do par, e o par e' (largo?, comprimento). Tres barras, tres
 * espacos, e cada um com uma largura de 1 a 4 modulos.
 *
 * **Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada -
 * o mesmo genre de falha do Code 39 com doze elementos por caracter em vez de
 * nove, que ja aconteceu neste repositorio.
 *
 * A origem e' a implementacao de referencia do ZXing (`Code93Reader.java`), que
 * e' tambem o leitor que vai verificar o encoder.
 */

/** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
export const ALFABETO =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcd*";

/** Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto. */
export const PADROES = [
'''


def extrair() -> tuple[str, list[int]]:
    pedido = urllib.request.Request(ORIGEM, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        texto = resposta.read().decode("utf-8")

    alfabeto = re.search(r'ALPHABET_STRING = "([^"]+)"', texto)
    if not alfabeto:
        raise SystemExit("nao encontrei o ALPHABET_STRING no Code93Reader.java")

    bloco = re.search(
        r"CHARACTER_ENCODINGS = \{(.*?)\};", texto, re.DOTALL
    )
    if not bloco:
        raise SystemExit("nao encontrei o CHARACTER_ENCODINGS no Code93Reader.java")

    valores = re.findall(r"0x([0-9A-Fa-f]+)", bloco.group(1))
    return alfabeto.group(1), [int(v, 16) for v in valores]


def main() -> int:
    alfabeto, valores = extrair()

    if len(alfabeto) != len(valores):
        raise SystemExit(
            f"o alfabeto tem {len(alfabeto)} caracteres e a tabela {len(valores)} "
            f"valores - a fonte mudou de forma, e nao se vai adivinhar"
        )

    if len(valores) != 48:
        raise SystemExit(f"a tabela tem {len(valores)} valores e devia ter 48")

    linhas = [CABECALHO]
    for i in range(0, len(valores), 6):
        grupo = valores[i : i + 6]
        identicos = ", ".join(f"0x{v:03X}" for v in grupo)
        marcas = "  // " + alfabeto[i : i + 6]
        linhas.append(f"  {identicos},{marcas}\n")

    linhas.append(
        """];

/** O indice de cada caractere, para a busca ao inverso. */
export const INDICE = new Map(
  [...ALFABETO].map((caractere, i) => [caractere, i]),
);

/** O asterisco, que marca o inicio e o fim. E' o indice 47. */
export const ASTERISCO = 47;
"""
    )

    DESTINO.write_text("".join(linhas), encoding="utf-8")
    tamanho = DESTINO.stat().st_size
    print(f"{DESTINO.name}: {len(valores)} padroes, {tamanho} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
