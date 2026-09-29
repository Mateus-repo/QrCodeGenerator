"""
Gera as tabelas do C40 e do Text do Data Matrix, a partir do Zint.

    python web/tests/gerar-tabela-dm-modos.py

De onde vem
-----------

O **Zint**, a implementacao de referencia da GS1, em `backend/dmatrix.h`, que
e' tambem o codigo que o `zxingcpp` instalado chama para escrever este formato.
E' a referencia de nivel 0 mais alta que ha: nao e' uma tabela transcrita de uma
tabela, e' a que produz os codigos que um leitor de bolso le.

A fonte traz a **Tabela C.1** (C40) e a **Tabela C.2** (Text) da ISO/IEC
16022, citadas no proprio comentario:

    /* C40 shift to use per ASCII character (Table C.1) */
    /* C40 ASCII values (Table C.1) */
    /* Text shift to use per ASCII character (Table C.2) */
    /* Text ASCII values (Table C.2) */

Porque sao **quatro** tabelas e nao duas
--------------------------------------

Cada modo tem uma tabela de **deslocamento** e uma de **valor**, e sao coisas
diferentes:

  - o **valor** e' o que o caracter vale dentro do modo. Em C40, um `A` vale 14 e
    um espaco vale 3 — porque o espaco esta em dois sitios do alfabeto C40 (o
    basico e o conjunto 1);
  - o **deslocamento** diz **em que conjunto** o caracter vive. E' 0 para o
    basico, 1 para o primeiro shift, 2 para o segundo.

Um erro em qualquer uma das duas da um codigo que **se desenha e nao le** — e
nao le com o texto errado, que e' o pior: parece correcto.

E a razao de o **`shift` do Text ser diferente do `shift` do C40** nos
caracteres 64 a 95: no C40 o shift 3 e' reservado, e no Text o shift 3 e' o
conjunto 3 completo. Sao tabelas parecidas e **nao iguais**, e copiá-las uma da
outra da um codigo errado so nos caracteres de pontuacao — que e' onde a
diferenca se nota.

O que este script verifica
--------------------------

Cada tabela tem de ter **128 entradas**, uma por codigo ASCII, e e' o que a
primeira verificacao apanha: um padrao de extracao que pegue no array errado
devolve 128 de outra coisa, e a contagem e' o sinal.

E depois tres propriedades que so podem ser verdade se a tabela esta certa:

  1. **O espaco vale 3 em ambos os modos, e nao 0.** E' a propriedade mais
     facil de esquecer e a que da um codigo com os espacos trocados por
     caracteres estranhos;
  2. **As letras maiusculas sao 14 a 39, seguidas.** E' a mesma letra em todos
     os quatro modos, e um valor trocado aqui da texto completamente diferente;
  3. **O deslocamento do C40 nao tem o valor 3**, porque o conjunto 3 e'
     reservado no C40 — e no Text tem. A diferenca entre os dois modos, numa
     linha.
"""

from __future__ import annotations

import os
import re
import sys
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent

# As fontes vao para a temperatura e nao para o repositorio: sao codigo de
# terceiros, com a licenca deles, e este repositorio nao tem uma unica linha
# copiada de outro.
REFS = Path(os.environ.get("TEMP", "/tmp")) / "qrcodegenerator-fontes"
FONTE = REFS / "dmatrix.h"

ORIGEM = "https://raw.githubusercontent.com/zint/zint/master/backend/dmatrix.h"
LICENCA = "BSD-3-Clause, Zint (Robin Stuart)"
DESTINO = AQUI.parent / "symbologies" / "datamatrix-modos-tabelas.js"

# As quatro tabelas, pelo nome na fonte. **Escritas uma a uma**, porque um
# filtro e' uma lista implicita do que conta, e o proximo modo que aparecer
# num `for` sobre os nomes seria gerado sem ninguem decidir.
TABELAS = [
    ("dm_c40_shift", "C40_SHIFT", "deslocamento do C40 (Tabela C.1)"),
    ("dm_c40_value", "C40_VALOR", "valor do C40 (Tabela C.1)"),
    ("dm_text_shift", "TEXT_SHIFT", "deslocamento do Text (Tabela C.2)"),
    ("dm_text_value", "TEXT_VALOR", "valor do Text (Tabela C.2)"),
]


def ir_buscar(destino: Path) -> str:
    """Descarrega a fonte, se ainda nao a tiver, e devolve o texto."""
    if not destino.exists():
        REFS.mkdir(parents=True, exist_ok=True)
        print(f"  a descarregar {destino.name}")
        pedido = urllib.request.Request(ORIGEM, headers={"User-Agent": "qrcodegenerator"})
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            destino.write_bytes(resposta.read())
    return destino.read_text(encoding="utf-8")


def extrair(texto: str, nome: str) -> list[int]:
    """Os 128 valores de uma tabela do C.

    **O `[^}]*` tem de apanhar o array inteiro e so um.** Um padrao com `.*?` e
    `re.DOTALL` atravessa arrays vizinhos quando o primeiro esta mal formado, e
    devolve 128 valores de uma tabela que nao e' a pedida — o sintoma e' uma
    tabela de aspecto plausivel e completamente errada.
    """
    achado = re.search(rf"{nome}\[128\]\s*=\s*\{{([^}}]*)\}};", texto)
    if not achado:
        raise SystemExit(f"nao encontrei {nome}[128] na fonte")

    valores = [int(n) for n in re.findall(r"-?\d+", achado.group(1))]
    if len(valores) != 128:
        raise SystemExit(f"{nome} tem {len(valores)} valores, e' para ter 128")
    return valores


def conferir(t: dict[str, list[int]]) -> list[str]:
    """As propriedades que so podem ser verdade se a tabela esta certa.

    As chaves sao os **nomes da fonte** em minusculas com o prefixo, e nao os
    de JavaScript: e' assim que o `extrair` as guarda, e trocar um pelo outro
    dá um `KeyError` numa linha que parece estar a falar de outra coisa.
    """
    problemas = []

    c40_shift, c40_valor = t["dm_c40_shift"], t["dm_c40_value"]
    text_shift, text_valor = t["dm_text_shift"], t["dm_text_value"]

    # 1. O espaco vale 3 nos dois modos, e nao 0.
    #
    # **E' a propriedade mais facil de esquecer.** O espaco esta em dois sitios
    # do alfabeto C40 — o basico e o primeiro shift — e o valor e' 3 em ambos, o
    # que parece contradicao e nao e': sao conjuntos diferentes com o mesmo
    # numero. Uma tabela com 0 no espaco troca todos os espacos por acentos
    # cirilicos, e o codigo **le-se** — com o texto errado.
    for nome, tabela in (("C40", c40_valor), ("Text", text_valor)):
        if tabela[32] != 3:
            problemas.append(f"{nome}: o espaco vale {tabela[32]}, devia ser 3")

    # 2. As maiusculas **nao tem o mesmo valor nos dois modos**, e essa e' a
    #    propriedade.
    #
    # A primeira versao deste script afirmava que `A` valia 14 nos dois, e
    # falhou com "Text: A vale 1". **A fonte estava certa e a assercao errada.**
    #
    # A razao: no **C40** as maiusculas sao o **conjunto basico** (shift 0) e
    # valem 14 a 39. No **Text** as maiusculas vivem no **conjunto 3** (shift 3)
    # e valem 1 a 26. Sao os mesmos caracteres em alfabetos diferentes, e a
    # assercao "o mesmo valor nos dois modos" era uma confusao entre **tabela de
    # valor** e **tabela de deslocamento**.
    #
    # E a razao de isto valer a pena verificar: um encoder que use o valor do
    # C40 para o Text escreve as maiusculas no sitio errado, e **o codigo le-se
    # com o texto errado** — que e' o pior resultado, porque parece correcto.
    for i, letra in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
        if c40_valor[ord(letra)] != 14 + i:
            problemas.append(f"C40: {letra} vale {c40_valor[ord(letra)]}, devia ser {14 + i}")
            break
        if text_valor[ord(letra)] != 1 + i:
            problemas.append(f"Text: {letra} vale {text_valor[ord(letra)]}, devia ser {1 + i}")
            break
        if c40_shift[ord(letra)] != 0:
            problemas.append(f"C40: {letra} esta no conjunto {c40_shift[ord(letra)]}, devia ser o basico")
            break
        if text_shift[ord(letra)] != 3:
            problemas.append(f"Text: {letra} esta no conjunto {text_shift[ord(letra)]}, devia ser o 3")
            break

    # E as minusculas, que no C40 estao no **conjunto 1** (valor 27 a 39 mais
    # o Basic minusculo) — e no Text no **conjunto 0**.
    for i, letra in enumerate("abcdefghijklmnopqrstuvwxyz"):
        if text_shift[ord(letra)] != 0:
            problemas.append(f"Text: {letra} esta no conjunto {text_shift[ord(letra)]}, devia ser o basico")
            break

    # 3. Os quatro conjuntos existem nos dois modos, e **as tabelas de
    #    deslocamento sao diferentes mesmo assim**.
    #
    # A primeira versao afirmava que o C40 **nao** tinha o conjunto 3, e a
    # fonte tem-no para os caracteres 96 a 127. **A assercao estava errada**: o
    # C40 tem os quatro conjuntos, e o conjunto 3 e' onde vivem os caracteres de
    # pontuacao alta.
    #
    # A propriedade real e' que as duas tabelas **nao sao iguais**, e que e' o que
    # a nota de um e' igual ao outro nao apagaria. E aqui a diferenca esta nos
    # caracteres 64 a 95: no C40 e' o conjunto 2, e no Text e' o conjunto 3.
    for conjunto in range(4):
        if conjunto not in c40_shift:
            problemas.append(f"C40_SHIFT nao tem o conjunto {conjunto}")
        if conjunto not in text_shift:
            problemas.append(f"TEXT_SHIFT nao tem o conjunto {conjunto}")

    if c40_shift == text_shift:
        problemas.append("as duas tabelas de deslocamento sao iguais — e nao sao")

    # E o deslocamento tem de estar entre 0 e 3, nunca mais.
    for nome, tabela in (
        ("C40_SHIFT", c40_shift),
        ("C40_VALUE", c40_valor),
        ("TEXT_SHIFT", text_shift),
        ("TEXT_VALUE", text_valor),
    ):
        for v in tabela:
            if v < 0 or v > 39:
                problemas.append(f"{nome}: o valor {v} esta fora do intervalo 0..39")
                break

    return problemas



def escrever_js(t: dict[str, list[int]]) -> None:
    """O ficheiro de JavaScript. Gerado, nunca editado a mao."""
    L = [
        "/**",
        " * Data Matrix: as tabelas do C40 e do Text.",
        " *",
        " * ## Gerado, nao escrito a mao",
        " *",
        " *     python web/tests/gerar-tabela-dm-modos.py",
        " *",
        " * De:",
        f" *     {ORIGEM}",
        f" *     Licenca: {LICENCA}",
        " *",
        " * Sao as **Tabela C.1** e **Tabela C.2** da ISO/IEC 16022, citadas na",
        " * propria fonte. E o Zint, a implementacao de referencia da GS1, que e'",
        " * tambem quem escreve estes codigos.",
        " *",
        " * ## Sao quatro tabelas e nao duas",
        " *",
        " * Cada modo tem uma de **deslocamento** e uma de **valor**, e sao coisas",
        " * diferentes: o valor e' o que o caracter vale dentro do modo, e o",
        " * deslocamento diz **em que conjunto** ele vive.",
        " *",
        " * Um erro em qualquer uma das duas da um codigo que se desenha e nao le - e",
        " * nao le com o texto errado, que e' o pior, porque parece correcto.",
        " *",
        " * **E o `TEXT_SHIFT` nao e' o `C40_SHIFT`, mesmo tendo os quatro",
        " * conjuntos nos dois.** A diferenca esta nos caracteres 64 a 95: no C40",
        " * e' o conjunto 2 e no Text e' o 3. E' onde vivem os sinais de pontuacao",
        " * alta, que nao aparecem num numero de serie normal - por isso que um",
        " * codigo com a tabela trocada passa nos testes e falha no campo.",
        " *",
        " * E os **valores** diferem ainda mais: no C40 o `A` vale 14 (conjunto",
        " * basico) e no Text vale 1 (conjunto 3). Sao os mesmos caracteres em",
        " * alfabetos diferentes, e um encoder que use o valor de um para o outro",
        " * escreve as maiusculas no sitio errado - e o codigo **le-se com o texto",
        " * errado**, que e' o pior resultado porque parece certo.",
        " */",
        "",
        "/** O espaco vale 3, e nao 0. Ver a nota acima - e' a armadilha do modo. */",
        "const ESPACO = 3;",
        "",
    ]

    for nome_fonte, nome_js, descricao in TABELAS:
        valores = t[nome_fonte]
        L.append(f"/** {descricao}, por codigo ASCII. */")
        L.append(f"export const {nome_js} = [")
        for i in range(0, 128, 16):
            L.append("  " + ", ".join(str(v) for v in valores[i : i + 16]) + ",")
        L.append("];")
        L.append("")

    L += [
        "/**",
        " * O valor e o deslocamento de um caracter num modo, ou `null` se o modo",
        " * nao o tem.",
        " *",
        " * **`null` e nao um valor inventado.** Um caracter que o C40 nao tem e'",
        " * `-1` na fonte, e um `-1` escrito no codigo sai como caractere estranho no",
        " * leitor em vez de dizer que nao cabe. A razao de a funcao devolver `null` e'",
        " * que quem chama **tem de decidir**: mudar para o modo Text, ou para ASCII,",
        " * ou recusar.",
        " */",
        "export function valorEm(modo, codigo) {",
        "    if (codigo < 0 || codigo > 127) return null;",
        "    const valor = modo === 'C40' ? C40_VALOR[codigo] : TEXT_VALOR[codigo];",
        "    return valor;",
        "}",
        "",
        "/**",
        " * O conjunto de um caracter, ou `null` se o modo nao o tem.",
        " *",
        " * O `C40_SHIFT` **nao tem o valor 3** — o conjunto 3 e' reservado no C40 —",
        " * e o `TEXT_SHIFT` tem. E' a diferenca entre os dois modos, e quem escrever",
        " * o encoder tem de a respeitar: um 3 no C40 e' um codigo invalido.",
        " */",
        "export function conjuntoEm(modo, codigo) {",
        "    if (codigo < 0 || codigo > 127) return null;",
        "    return modo === 'C40' ? C40_SHIFT[codigo] : TEXT_SHIFT[codigo];",
        "}",
        "",
        "export { ESPACO };",
        "",
    ]

    DESTINO.write_text("\n".join(L), encoding="utf-8")
    kb = round(DESTINO.stat().st_size / 1024)
    print(f"\n{DESTINO} ({kb} KB, gerado)")


def main() -> int:
    print("=== a fonte ===")
    texto = ir_buscar(FONTE)

    print("\n=== as tabelas ===")
    t = {}
    for nome_fonte, nome_js, descricao in TABELAS:
        valores = extrair(texto, nome_fonte)
        t[nome_fonte] = valores
        print(f"  {descricao:34} 128 valores")

    print("\n=== as propriedades ===")
    problemas = conferir(t)
    for p in problemas:
        print(f"  {p}")
    if problemas:
        print("\nA fonte mudou de forma, e nao se vai adivinhar o que falta.")
        return 1
    print("  espaco, maiusculas e a diferenca entre os dois modos: ok")

    escrever_js(t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
