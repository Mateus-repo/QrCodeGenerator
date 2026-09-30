"""
As tabelas da familia UPC/EAN, extraidas do `python-barcode`.

    python spec/gerar-tabelas-upcean.py

**NAO EDITE ESTE FICHEIRO A MAO.** As tabelas de um codigo de barras nunca se
escrevem de memoria, e a `AGENTS.md` explica porquê: ja aconteceu neste
repositorio, e os dois casos nao foram apanhados por nenhum teste. O
`python-barcode` e' uma implementacao de referencia da industria com as
tabelas em forma legivel; este modulo e' a extracao mechanical, e
`tests/test_upcean.py` compara as duas entrada a entrada.

## A tabela G nao existe, e e' de proposito

**G e' R lida de tras para a frente** — a mesma informacao vista do outro lado,
porque o leitor espelha a barra na metade esquerda. Derivar em vez de
transcrever tira uma fonte de erro inteira, e e' por isso que o gerador nao
escreve a G: escreve a R e o `modulo.py` deriva-a.
"""

#: L — combinacao de paridade impar, usada na metade esquerda.
L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']

#: R — combinacao de paridade par, usada na metade direita.
R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']

#: A guarda inicial e a final, mais alta e usada de ancora pelo leitor.
GUARDA_INICIO = '101'

#: A guarda central. E' a unica regiao do EAN-13 sem nenhum digito por baixo, e
#: quem divide a soma das guardas a meio cai precisamente nela.
GUARDA_CENTRO = '01010'
