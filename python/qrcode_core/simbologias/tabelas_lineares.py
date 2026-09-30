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

#: O Code 128: os 106 primeiros valores, por indice.
#:
#: **Cada entrada tem onze caracteres, ja expandidos**, e nao os seis elementos
#: `NnWw` dos outros. A cadeia e' a soma das larguras dos seis elementos, e as
#: larguras vao de 1 a 4. Os valores 0 a 102 sao dados, 103, 104 e 105 sao os
#: caracteres de inicio dos conjuntos A, B e C, e 106 e' a paragem.
CODE128_PADROES = ['11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100']

#: A paragem do Code 128: treze modulos, sete elementos — `2331112`.
#:
#: ## A unica tabela deste ficheiro que nao vem do `python-barcode`
#:
#: **A `STOP` da biblioteca tem onze modulos e seis elementos. A paragem do Code
#: 128 sao treze e sete.** Falta a barra final de dois modulos, e sem ela o
#: codigo **nao e' lido por nada**: mediu-se, e o ZXing devolve "NAO LEU" para
#: `Hi` com a cadeia da biblioteca e `Hi` com esta.
#:
#: A razao e' que essa barra e' a **ancora** do leitor. O Code 128 nao tem
#: barras-guarda como o EAN, e a paragem e' a unica coisa que diz onde o codigo
#: acaba — sem ela o leitor nao sabe, e o que le nao e' este codigo.
#:
#: **A regra da `AGENTS.md` e' nao escrever as tabelas de memoria.** O
#: `python-barcode` e' o meio de o fazer, e nao a razao. Quando o meio falha, o
#: que manda e' a leitura — e trazer a cadeia truncada porque veio da fonte seria
#: levar para dentro do repositorio um codigo que nao le, com a autoridade da
#: fonte colada ao lado.
#:
#: Os 106 padroes de dados sao da biblioteca e passam na leitura, e por isso que
#: so a paragem e' escrita aqui.
CODE128_PARAGEM = '1100011101011'
