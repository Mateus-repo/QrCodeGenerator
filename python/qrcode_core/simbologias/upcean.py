"""
A familia UPC/EAN: EAN-13, EAN-8 e UPC-A.

    from qrcode_core.simbologias import ean13
    ean13("400638133393")["modulos"]

## O que estas sao e o que nao sao

**Sao transporte, como os payloads de link e de contacto** — o formato nao
impoe nada sobre o conteudo. A diferenca para um link e' que aqui o *conteudo
e' a coisa*: um EAN-13 sem o digito de controlo certo e' um codigo que os
leitores recusam, e o digito de controlo e' a unica regra do formato.

**E' por isso que a verificacao e' a leitura.** Um EAN-13 desenhado com a
paridade errada desenha-se com aspecto de estar certo e o leitor devolve outra
coisa, ou nada — que e' o que a `AGENTS.md` descreve do Code 39 com doze
elementos em vez de nove, e do ITF com dois na moldura em vez de tres.
"""

from __future__ import annotations

from .tabelas_upcean import GUARDA_CENTRO, GUARDA_INICIO, L, R

#: **G e' R lida de tras para a frente**, e nao uma tabela independente.
#:
#: A metade esquerda do EAN-13 usa L ou G conforme a paridade do primeiro digito,
#: e a G e' a R vista do outro lado — o leitor espelha a barra. Derivar em vez
#: de transcrever tira uma fonte de erro inteira, e e' a razao pela qual o
#: gerador de tabelas nao escreve a G.
G = tuple(padrao[::-1] for padrao in R)

#: Quantos digitos da esquerda saem em G em vez de L, por primeiro digito.
#:
#: **Esta tabela e' o que permite a um leitor de baixa resolucao saber onde
#: acaba o codigo**, e por isso que um EAN-13 pode ser lido de tras para a
#: frente. Cada linha diz, para o primeiro digito, o que cada um dos seis
#: seguintes faz: `L` de paridade impar, `G` de paridade par.
PARIDADE_EAN13 = (
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
)


class SimbologiaError(ValueError):
    """O valor nao serve para esta simbologia."""


def digito_de_controlo(digitos: str) -> int:
    """
    O digito de controlo, pelo modulo 10 com pesos alternados 3 e 1.

    **O peso e' 3 no digito mais a direita**, e e' o que distingue o EAN-13 do
    UPC-A: os dois sao o mesmo numero com um digito a mais, e **usar a mesma
    regra para os dois da um digito errado no UPC-A** — que e' o numero impresso
    por baixo do codigo e o que o leitor devolve.

        400638133393 -> 4*1+0*3+0*1+6*3+3*1+8*3+1*1+3*3+3*1+3*3+9*1+3*3 = 89 -> 1
        03600029145  -> 0*3+3*1+6*3+0*1+0*3+0*1+2*3+9*1+1*3+4*1+5*3 = 58 -> 2
    """
    soma = 0
    for i, caractere in enumerate(digitos):
        quantos_a_direita = len(digitos) - 1 - i
        soma += int(caractere) * (3 if quantos_a_direita % 2 == 0 else 1)
    return (10 - (soma % 10)) % 10


def digitos_de(valor: str, esperado: int, nome: str) -> str:
    """Limpa e valida a contagem de digitos, com a mensagem que a pessoa ve."""
    limpo = "".join(c for c in str(valor) if not c.isspace() and c != "-")

    if not limpo.isdigit() or not limpo:
        raise SimbologiaError(f"{nome}: so aceita digitos, recebeu {valor!r}")
    if len(limpo) != esperado:
        raise SimbologiaError(
            f"{nome}: espera {esperado} digitos, recebeu {len(limpo)} ({limpo})"
        )
    return limpo


def codigo(modules: list[bool], guards: list[int], legenda: str, nome: str) -> dict:
    """
    O resultado, com a forma que o desenho e' a legivel espera.

    **`guards` sao os indices onde comecam as guardas**, e nao os caracteres: o
    desenho usa-os para decidir o que e' barra e o que e' espaco, e para saber
    onde acaba cada zona.
    """
    return {
        "simbologia": nome,
        "modulos": modules,
        "guardas": guards,
        "legenda": legenda,
    }


def _acrescentar(modulos: list[bool], bits: str) -> None:
    for bit in bits:
        modulos.append(bit == "1")


def ean13(valor: str) -> dict:
    """
    EAN-13. Treze digitos, dos quais **o primeiro nao e codificado**.

    O primeiro digito e' o que escolhe a paridade dos seis seguintes, e e'
    precisamente por isso que nao tem barras: um leitor de baixa resolucao le-o
    da margem e sabe como espelhar a metade esquerda. **Um EAN-14 com o primeiro
    digito codificado nao e' lido por nenhum leitor**, e desenha-se com aspecto
    de estar certo.
    """
    d = digitos_de(valor, 12, "EAN-13")
    d += str(digito_de_controlo(d))

    paridade = PARIDADE_EAN13[int(d[0])]

    modulos: list[bool] = []
    guardas = [0]

    _acrescentar(modulos, GUARDA_INICIO)

    for i in range(1, 7):
        _acrescentar(modulos, L[int(d[i])] if paridade[i - 1] == "L" else G[int(d[i])])

    guardas.append(len(modulos))
    _acrescentar(modulos, GUARDA_CENTRO)
    guardas.append(len(modulos))

    for i in range(7, 13):
        _acrescentar(modulos, R[int(d[i])])

    _acrescentar(modulos, GUARDA_INICIO)
    guardas.append(len(modulos))

    return codigo(modulos, guardas, d, "EAN-13")


def ean8(valor: str) -> dict:
    """
    EAN-8. Oito digitos, todos codificados, e **sem paridade nenhuma**.

    A diferenca para o EAN-13 que importa: aqui nao ha primeiro digito fora das
    barras, e por isso os quatro digitos da esquerda sao sempre em L. **E' o
    codigo dos artigos pequenos**, e o que uma loja usa quando o numero do
    fornecedor nao chega para um EAN-13.
    """
    d = digitos_de(valor, 7, "EAN-8")
    d += str(digito_de_controlo(d))

    modulos: list[bool] = []
    guardas = [0]

    _acrescentar(modulos, GUARDA_INICIO)

    for i in range(0, 4):
        _acrescentar(modulos, L[int(d[i])])

    guardas.append(len(modulos))
    _acrescentar(modulos, GUARDA_CENTRO)
    guardas.append(len(modulos))

    for i in range(4, 8):
        _acrescentar(modulos, R[int(d[i])])

    _acrescentar(modulos, GUARDA_INICIO)
    guardas.append(len(modulos))

    return codigo(modulos, guardas, d, "EAN-8")


def upca(valor: str) -> dict:
    """
    UPC-A. Doze digitos: **um EAN-13 com o primeiro a zero**.

    **A regra do digito de controlo e' a mesma que a do EAN-13, e nao a do
    UPC-E.** O UPC-A tem os mesmos doze digitos de um EAN-13 que comece por
    zero, e por isso o peso de 3 cai no mesmo sitio. Confundir as duas regras da
    um digito errado no numero impresso por baixo — e o leitor le o codigo, ve um
    numero diferente do que a etiqueta mostra, e a loja cobra o preco errado.
    """
    d = digitos_de(valor, 11, "UPC-A")
    d += str(digito_de_controlo(d))

    modulos: list[bool] = []
    guardas = [0]

    _acrescentar(modulos, GUARDA_INICIO)

    # O primeiro digito e' sempre 0, e por isso a paridade e' sempre LLLLLL.
    for i in range(0, 6):
        _acrescentar(modulos, L[int(d[i])])

    guardas.append(len(modulos))
    _acrescentar(modulos, GUARDA_CENTRO)
    guardas.append(len(modulos))

    for i in range(6, 12):
        _acrescentar(modulos, R[int(d[i])])

    _acrescentar(modulos, GUARDA_INICIO)
    guardas.append(len(modulos))

    return codigo(modulos, guardas, d, "UPC-A")


#: As tres, pelo id que o selector usa.
SIMBOLOGIAS = {
    "ean13": ean13,
    "ean8": ean8,
    "upca": upca,
}
