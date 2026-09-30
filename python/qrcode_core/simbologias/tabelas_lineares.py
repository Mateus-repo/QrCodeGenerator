"""
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
COD39_ALFABETO = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '-', '.', ' ', '$', '/', '+', '%']

COD39_PADROES = ['101000111011101', '111010001010111', '101110001010111', '111011100010101', '101000111010111', '111010001110101', '101110001110101', '101000101110111', '111010001011101', '101110001011101', '111010100010111', '101110100010111', '111011101000101', '101011100010111', '111010111000101', '101110111000101', '101010001110111', '111010100011101', '101110100011101', '101011100011101', '111010101000111', '101110101000111', '111011101010001', '101011101000111', '111010111010001', '101110111010001', '101010111000111', '111010101110001', '101110101110001', '101011101110001', '111000101010111', '100011101010111', '111000111010101', '100010111010111', '111000101110101', '100011101110101', '100010101110111', '111000101011101', '100011101011101', '100010001000101', '100010001010001', '100010100010001', '101000100010001']

#: O inicio e a paragem do Code 39, ambos um asterisco.
COD39_PARAGEM = '100010111011101'

#: O ITF: cinco elementos por digito.
ITF_PADROES = ['NNWWN', 'WNNNW', 'NWNNW', 'WWNNN', 'NNWNW', 'WNWNN', 'NWWNN', 'NNNWW', 'WNNWN', 'NWNWN']

#: A moldura de inicio: quatro elementos, todos estreitos.
ITF_INICIO = 'NnNn'

#: A moldura de paragem: **tres** elementos — barra larga, espaco estreito,
#: barra estreita. Sao tres, e nao dois: com dois, a barra larga final fica
#: contigua a do ultimo digito e o leitor ve uma so.
ITF_PARAGEM = 'WnN'

#: O Codabar: sete elementos por caracter.
CODABAR_PADROES = {'0': 'NnNnNwW', '1': 'NnNnWwN', '2': 'NnNwNnW', '3': 'WwNnNnN', '4': 'NnWnNwN', '5': 'WnNnNwN', '6': 'NwNnNnW', '7': 'NwNnWnN', '8': 'NwWnNnN', '9': 'WnNwNnN', '-': 'NnNwWnN', '$': 'NnWwNnN', ':': 'WnNnWnW', '/': 'WnWnNnW', '.': 'WnWnWnN', '+': 'NnWnWnW'}

#: Os quatro caracteres que so podem ser inicio ou paragem.
CODABAR_INICIO_PARAGEM = {'A': 'NnWwNwN', 'B': 'NwNwNnW', 'C': 'NnNwNwW', 'D': 'NnNwWwN'}
