"""
Gera ``web/symbologies/pdf417-tabelas.js`` a partir da referência.

    python web/tests/extrair-tabelas-pdf417.py     # o JSON
    python web/tests/gerar-tabela-pdf417.py       # o ficheiro de JavaScript

Porque é que o ficheiro é gerado e não escrito à mão
------------------------------------------------------

A tabela do PDF417 são **3 x 929** padrões de 17 módulos. São 2787 números, e
escrevê-los de memória é exactamente o erro que já deu três vezes neste
repositório: o Code 39 saiu com doze elementos por carácter em vez de nove, e o
ITF com dois elementos na moldura de paragem em vez de três. Nenhum dos dois
foi apanhado por teste estrutural.

Por isso o ficheiro é gerado **uma vez** a partir de uma fonte de referência, e
a partir daí é código-fonte normal: entra no git, versiona-se, e revê-se como
se revê qualquer outro. O que o mantém honesto não é a origem, é o
`tabelas-pdf417.test.mjs`, que compara as 2787 entradas com a referência,
entrada a entrada, sempre que a referência está disponível.

Se um dia a referência mudar, o ficheiro não muda sozinho — e é suposto que
não mude. Um ficheiro de dados que se regenera sozinho esconde exactamente o
tipo de divergência que estes testes existem para apanhar.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".tabelas-pdf417.json"
DESTINO = RAIZ / "web" / "symbologies" / "pdf417-tabelas.js"

CABECALHO = """/**
 * As tabelas do PDF417. **Gerado** por `tests/gerar-tabela-pdf417.py`.
 *
 * São 2787 números — 3 tabelas de 929 padrões de 17 módulos — e não estão
 * escritos à mão de propósito. Vêm do `pdf417gen` (Python puro, licença MIT),
 * que por sua vez os transcreve da ISO/IEC 15438. A origem está escrita aqui
 * porque uma tabela sem origem é uma tabela em que ninguém pode confiar, e o
 * ficheiro tem 17 KB de dados que ninguém vai ler.
 *
 * `tests/tabelas-pdf417.test.mjs` compara cada entrada com a referência, e
 * verifica ainda a propriedade estrutural de cada padrão: 17 módulos, quatro
 * barras e quatro espaços, começando em barra e acabando em espaço.
 *
 * **Não editar à mão.** Alterar um número aqui sem alterar a referência dá um
 * código que se lê mal, e é o que o teste existe para apanhar.
 */

/** Os três clusters, por índice: 0, 3 e 6. */
export const CLUSTERS = [
"""

RODAPE = """];

/**
 * Os factores de Reed-Solomon, por nível de correcção (0 a 8).
 *
 * Cada nível tem tantos factores quantos são os codewords de correcção desse
 * nível, e esse número é 2^(nível+1): 2, 4, 8, 16, 32, 64, 128, 256, 512. São
 * 1022 factores no total, e não 9 x 8 — o que é a melhor lembranca de que
 * estes números não se escrevem de memória.
 */
export const EC = [
"""


def embrulhar(valores: list[int], por_linha: int, sangria: str) -> str:
    """Mete a lista em linhas, com a sangria certa para o ficheiro JS."""
    linhas = []
    for i in range(0, len(valores), por_linha):
        bloco = ", ".join(f"0x{v:05x}" for v in valores[i : i + por_linha])
        linhas.append(f"{sangria}{bloco},")
    return "\n".join(linhas)


def lista_de_clusters(cluster: list[int], por_linha: int = 8) -> str:
    """
    Uma tabela de clusters, oito por linha, com o índice de 32 em 32.

    Oito por linha em vez de um por linha porque 2787 linhas dão um ficheiro
    que ninguém abre; e com um comentário de índice de 32 em 32 continua a dar
    para conferir um número isolado contando até ele, que é o que interessa
    quando se está a ver porque é que o código não lê.
    """
    partes = []
    for inicio in range(0, len(cluster), por_linha):
        if inicio % 32 == 0:
            partes.append(f"\n    // codeword {inicio}")
        bloco = ", ".join(f"0x{v:05x}" for v in cluster[inicio : inicio + por_linha])
        partes.append(f"\n    {bloco},")
    partes.append("\n")
    return "".join(partes)


def principal() -> int:
    if not JSON.exists():
        print(
            f"Falta {JSON.name}. Corre primeiro:\n"
            "  python web/tests/extrair-tabelas-pdf417.py",
            file=sys.stderr,
        )
        return 1

    tabelas = json.loads(JSON.read_text(encoding="utf-8"))

    # --- As três tabelas de clusters ---------------------------------------
    # Uma linha por código base 929, para se poder conferir um número
    # isolado sem contar 2787. E 5 dígitos hexadecimais porque 17 bits é o
    # mínimo que cabe, e sobra um dígito de guarda.
    partes = [CABECALHO]
    for cluster in tabelas["clusters"]:
        assert len(cluster) == 929, f"esperava 929 codewords, veio {len(cluster)}"
        partes.append("  [")
        partes.append(lista_de_clusters(cluster))
        partes.append("  ],\n")

    partes.append(RODAPE)
    for nivel in tabelas["ec"]:
        partes.append("  [\n")
        partes.append(embrulhar(nivel, 16, "    ") + "\n")
        partes.append("  ],\n")
    partes.append("];\n\n")

    # --- O modo texto -------------------------------------------------------
    # O valor de cada caractere em cada submodo, **como mapa explícito**.
    #
    # A primeira versão guardava isto como uma cadeia ordenada e dizia que o
    # valor de um caractere era a sua posição na cadeia. Isso é verdade em UPPER
    # e em LOWER, e é **falso** em MIXED: o valor 25 não é usado por nenhum
    # caractere, e o valor do espaço é 26 e não 25. Com a cadeia, o espaço saía
    # com o valor 25, um a menos, e o ZXing lia o código errado — sem devolver
    # erro nenhum, porque o espaço é um caractere válido no submodo MIXED, só
    # com outro valor.
    #
    # É o mesmo aviso de sempre, com uma forma nova: uma tabela *inferida* é
    # uma tabela escrita de memória com passos a menos. O mapa não infere nada.
    partes.append("""/**
 * O modo texto: o valor de cada caractere em cada um dos quatro submodos.
 *
 * **Isto é um mapa, e não uma cadeia ordenada, por causa do MIXED.** Os valores
 * do MIXED vão de 0 a 26 com o 25 por usar, e um caractere não é a sua posição
 * numa lista: o espaço vale 26 e não 25. Guardar isto como cadeia e tirar o
 * valor da posição dá um código que se lê com um caractere trocado, sem erro
 * nenhum — porque o espaço existe no MIXED, só com outro número.
 */
export const SUBMODOS = {
""")
    for modo, caracteres in tabelas["characters"].items():
        ordenados = sorted(caracteres.items(), key=lambda par: par[1])
        entradas = ", ".join(
            f"{json.dumps(c)}: {valor}" for c, valor in ordenados
        )
        partes.append(f"  {modo}: {{ {entradas} }},\n")
    partes.append("};\n\n")

    # --- As transições entre submodos --------------------------------------
    partes.append("""/**
 * As transições entre submodos do modo texto.
 *
 * Há transições que precisam de **dois** códigos, e não de um. De minúsculas
 * para pontuação não há caminho directo: passa por misto com o 28, e só depois
 * o 25 leva a pontuação. Um array com uma ou duas entradas é o que faz essa
 * distinção visível; com um número só, o 28 e o 25 entravam num sitio e o
 * código não lia.
 */
export const TRANSICOES = {
""")
    for origem, destinos in tabelas["switchCodes"].items():
        for destino, codigos in destinos.items():
            lista = ", ".join(str(c) for c in codigos)
            partes.append(f"  {origem}_{destino}: [{lista}],\n")
    partes.append("};\n")

    DESTINO.write_text("".join(partes), encoding="utf-8")

    tamanho = DESTINO.stat().st_size
    print(f"{DESTINO.relative_to(RAIZ)} ({tamanho // 1024} KB, gerado de {JSON.name})")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
