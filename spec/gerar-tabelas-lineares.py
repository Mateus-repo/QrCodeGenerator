"""
Gera o modulo Python com as tabelas dos codigos de barras de uma linha, a
partir do `python-barcode`.

    python spec/gerar-tabelas-lineares.py

## Porque um modulo gerado e nao um ficheiro escrito a mao

**A `AGENTS.md` e' explicita: as tabelas dos codigos de barras nunca se
escrevem de memoria.** E da' dois exemplos do proprio repositorio:

- O **Code 39** foi escrito de memoria com **doze** elementos por caractere em
  vez de **nove**. Nenhum teste apanhou: o codigo desenhava-se com aspecto de
  estar certo e o leitor devolvia outra coisa, ou nada.
- O **ITF** ficou com **dois** elementos na moldura de paragem em vez de
  **tres**. O mesmo: aspecto certo, leitura errada.

O `python-barcode` e' uma implementacao de referencia da industria, em Python
puro, com as tabelas no codigo-fonte em forma legivel. Este script extrai-as e
escreve o modulo; `tests/test_lineares.py` compara o que o encoder usa com o que
o `python-barcode` tem, **entrada a entrada**. Uma transcricao errada passa a ser
um teste vermelho, e nao um codigo que nao le.

## A notacao de 'N' e 'W'

O `python-barcode` descreve os elementos com quatro letras, e a distincao e'
**largura** e nao cor:

    `N` barra estreita    `n` espaco estreito
    `W` barra larga       `w` espaco largo

**Maiuscula e' largo, minuscula e' estreito — e nao barra e espaco.** Confundir
isso foi o primeiro bug do encoder de ITF, e o sintoma e' o pior dospossiveis: a
tabela esta certa, o codigo tem o comprimento certo, e a barra inicial sai com a
largura do espaco. O leitor devolve outra coisa sem dizer porquê.

## O que este script **nao** gera

**As larguras.** Nao sao tabelas, sao parametros de leitura, e vao no codigo com o
nome a dizer de onde vem — `LARGURA` no ITF, `NORMAL`/`LARGO` no Codabar. Sao
poucas, estao escritas ao lado de onde sao usadas, e um valor errado nelas e'
visivel num `git diff` de duas linhas em vez de escondido numa tabela de 43.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from barcode.charsets import code39 as T39
    from barcode.charsets import codabar as TCODABAR
    from barcode.charsets import itf as TITF
except ImportError:
    print(
        "python-barcode nao esta instalado.\n"
        "  python -m pip install python-barcode\n"
        "(e' so para gerar as tabelas — o core nao tem dependencia nenhuma)",
        file=sys.stderr,
    )
    raise SystemExit(1)

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_lineares.py"


def conferir(nome: str, padroes, n_elementos: int, alfabeto_valido: str) -> None:
    """
    Confere a extracao antes de a escrever.

    **A extracao e' a parte em que se pode falhar em silencio**, e o
    `python-barcode` expoe as tabelas como sequences onde uma entrada em falta
    desloca todas as seguintes. Um `CODES[:5]` truncado dava um encoder com cinco
    caracteres correctos e um sexto trocado, e o sintoma seria o mesmo de uma
    tabela errada — que e' precisamente o que nao se distingue.
    """
    if len(padroes) == 0:
        raise SystemExit(f"a tabela {nome} veio vazia")

    for indice, padrao in enumerate(padroes):
        elementos = padrao if isinstance(padrao, str) else "".join(padrao)

        if len(elementos) != n_elementos:
            raise SystemExit(
                f"a tabela {nome}[{indice}] tem {len(elementos)} elementos, "
                f"esperava {n_elementos}: {elementos!r}"
            )

        if set(elementos) - set(alfabeto_valido):
            raise SystemExit(
                f"a tabela {nome}[{indice}] tem um caractere fora de "
                f"{alfabeto_valido!r}: {elementos!r}"
            )


def principal() -> int:
    # --- Code 39: 43 caracteres, cada um com nove elementos. ---
    alfabeto = list(T39.REF)
    padroes39 = [str(p) for p in T39.CODES]

    if len(alfabeto) != len(padroes39):
        raise SystemExit(
            f"o Code 39 tem {len(alfabeto)} caracteres e {len(padroes39)} padroes — "
            "a extracao esta desemparelhada"
        )
    # **O Code 39 vem JA EXPANDIDO**, com quinze caracteres de `0` e `1` em vez
    # de nove elementos `NnWw`. E a diferenca entre esta tabela e as outras duas,
    # e vale a pena saber: o `python-barcode` expande o Code 39 porque so esse
    # formato tem razao larga/estreita fixa em 3:1, e o ITF e o Codabar precisam
    # da elemento para poderem escolher a razao. **Verificar os quinze e nao os
    # nove** foi o que apanhou esta: um `conferir` escrito para `NnWw` dava
    # "tem 15 elementos, esperava 9" numa tabela perfeitamente correcta.
    conferir("code39", padroes39, 15, "01")

    # --- ITF: cinco elementos por digito, mais as duas molduras. ---
    padroesitf = [str(p) for p in TITF.CODES]
    conferir("itf", padroesitf, 5, "NnWw")

    # --- Codabar: sete elementos por caracter, e quatro de inicio/paragem. ---
    padroescod = {str(k): str(v) for k, v in TCODABAR.CODES.items()}
    inicio_paragem = {str(k): str(v) for k, v in TCODABAR.STARTSTOP.items()}

    conferir("codabar", list(padroescod.values()), 7, "NnWw")
    conferir("codabar/inicio", list(inicio_paragem.values()), 7, "NnWw")

    conteudo = f'''"""
As tabelas dos codigos de barras de uma linha, extraidas do `python-barcode`.

    python spec/gerar-tabelas-lineares.py

**NAO EDITE ESTE FICHEIRO A MAO.** A `AGENTS.md` explica porquê com dois exemplos
do proprio repositorio: o Code 39 escrito de memoria com doze elementos por
caractere em vez de nove, e o ITF com dois na moldura de paragem em vez de tres.
Nenhum dos dois foi apanhado por um teste — desenhavam-se com aspecto de estar
certo e o leitor nao lia. `tests/test_lineares.py` compara estas tabelas com as
do `python-barcode` entrada a entrada, e uma transcricao errada passa a ser um
teste vermelho.

## A notacao de 'N' e 'W'

    `N` barra estreita    `n` espaco estreito
    `W` barra larga       `w` espaco largo

**Maiuscula e' largo, minuscula e' estreito — e nao barra e espaco.** Confundir
as duas coisas foi o primeiro bug do encoder de ITF: a tabela estava certa, o
codigo tinha o comprimento certo, e a barra inicial saia com a largura do espaco.
"""

#: O Code 39, por ordem, com o asterisco de inicio e paragem em separado.
#:
#: **Cada entrada tem quinze caracteres, ja expandidos a 3:1** — e nao os nove
#: elementos `NnWw` que o ITF e o Codabar usam. A razao e' que o Code 39 tem a
#: razao larga/estreita **fixa** em 3:1, ao contrario dos outros dois, que a
#: escolhem. **Um caractere tem tres barras, tres espacos, mais um espaco
#: estreito de fecho** — e e' esse espaco que torna o formato "self-checking": a
#: paridade das barras faz com que um unico elemento mal lido invalide o
#: caractere inteiro.
COD39_ALFABETO = {alfabeto!r}

COD39_PADROES = {padroes39!r}

#: O inicio e a paragem do Code 39, ambos um asterisco.
COD39_PARAGEM = {str(T39.EDGE)!r}

#: O ITF: cinco elementos por digito.
ITF_PADROES = {padroesitf!r}

#: A moldura de inicio: quatro elementos, todos estreitos.
ITF_INICIO = {str(TITF.START)!r}

#: A moldura de paragem: **tres** elementos — barra larga, espaco estreito,
#: barra estreita. Sao tres, e nao dois: com dois, a barra larga final fica
#: contigua a do ultimo digito e o leitor ve uma so.
ITF_PARAGEM = {str(TITF.STOP)!r}

#: O Codabar: sete elementos por caracter.
CODABAR_PADROES = {padroescod!r}

#: Os quatro caracteres que so podem ser inicio ou paragem.
CODABAR_INICIO_PARAGEM = {inicio_paragem!r}
'''

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(conteudo, encoding="utf-8")

    print(f"  Code 39:  {len(padroes39)} caracteres x 9 elementos")
    print(f"  ITF:      {len(padroesitf)} digitos x 5 elementos")
    print(f"  Codabar:  {len(padroescod)} caracteres x 7 elementos")
    print(f"  -> {DESTINO.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
