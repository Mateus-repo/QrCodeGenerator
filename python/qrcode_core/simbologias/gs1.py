"""
GS1-128, outrora chamado EAN/UCC-128.

O Code 128 com as regras do GS1 por cima. E' o codigo de barras que vai na etiqueta
de uma caixa de armario de farmacia, e a diferenca para o Code 128 normal nao esta
no desenho: esta em **saber onde acaba cada campo**.

## O problema que ele resolve

O GTIN sozinho e' um numero de comprimento fixo, e o leitor sabe que tem de ler
catorze digitos. Com varios campos ja nao: em `(10)LOTE-A1(17)270630`, onde acaba
`LOTE-A1`? O `A1` e' parte do lote ou ja e' o inicio de outra coisa? Sem regra o
leitor tem de adivinhar, e adivinhar mal e' ler um campo invalido.

A regra e' o **FNC1**, um codeword que nao desenha um caracter visivel e que marca
"o campo de comprimento variavel acabou aqui". E' a unica coisa que o GS1-128
acrescenta ao Code 128, e e' o que faz a diferenca entre um codigo que se le e um
codigo que da erro de campo.

## As tres coisas que sao FNC1

 1. **No inicio**, logo a seguir ao caracter de inicio do conjunto. E' o que diz
    ao leitor "este e' um GS1-128" e nao um Code 128 com texto. Sem ele o leitor
    devolve o texto mas nao sabe para que serve.
 2. **No fim de cada campo de comprimento variavel**, menos no ultimo. E' o
    separador. A regra "menos no ultimo" e' da propria GS1: um separador no fim
    nao separa de nada.
 3. **Nunca** dentro de um campo de comprimento fixo, porque ai o comprimento ja
    esta no AI e um FNC1 a meio leria-se como parte do valor.

## Porque os campos sao todos no conjunto B

O GS1-128 so usa o conjunto B - o ASCII imprimivel. Nao por ser mais curto, mas
porque e' o unico em que o FNC1 faz sentido: o valor de um campo e' alfanumerico,
os AIs sao digitos, e uma comutacao para o conjunto C (so digitos) partiria um
campo ao meio sem o leitor dar por isso.

O preco e' um codigo mais longo do que um Code 128 comutativo, e e' o comprimento
que a GS1-128 aceita. Correto e' mais curto.

## Deliberadamente nao chama o `code128()`

Aquele escolhe os conjuntos e faz as comutacoes, e o GS1-128 nao pode: tem de ficar
no conjunto B, e o FNC1 e' um codeword que o `code128()` nao sabe emitir. Chama-lo
e forcar o conjunto B por opcao seria meio caminho, e **o meio caminho e' onde estao
os bugs**: o `python-barcode` faz o GS1-128 a bruto - prefixa FNC1 e nao emite
separadores - e o codigo dele desenha-se bem e le-se com o campo partido.

## O que o leitor devolve, medido

O ZXing devolve o texto com os separadores visiveis como `<GS>`, e o
`symbology_identifier` diz `]C1` em vez de `]C0` quando ha FNC1 no inicio. Os dois
foram medidos, e nao assumidos: o texto sozinho nao distingue um GS1-128 de um Code
128 com os mesmos caracteres, que e' exactamente o caso em que o `]C1` importa.

**O FNC1 do inicio conta para o caracter de verificacao como qualquer outro
codeword**, com o valor 102. A primeira versao punha o FNC1 fora da soma, "porque
nao e' um caracter" - e isso dava um codigo com o valor de verificacao errado, que o
leitor recusa sem dizer por que.
"""

from __future__ import annotations

import re

from .lineares import (
    CODE128_INICIO,
    CODE128_PARAGEM_VALOR,
    _modulos_do_padrao,
)
from .tabelas_gs1 import AIS, ai_de
from .upcean import SimbologiaError

#: O valor do codeword do FNC1 no Code 128.
#:
#: 102 nao e' um valor de conjunto nem um caracter: e' uma funcao, e e' o mesmo em
#: todos os contextos - no inicio e como separador. **Nao ha um "FNC1 de inicio" e
#: um "FNC1 separador" com numeros diferentes**, ao contrario do que se pode supor.
FNC1 = 102

#: O separador GS, 0x1D - o mesmo byte que o ZXing devolve nos bytes do que le.
#:
#: **Nao e' uma escolha de interface.** E' o valor que a GS1 chama de Group
#: Separator e o mesmo que o leitor devolve, para que o texto que a aplicacao mostra
#: e o que o leitor le sejam o mesmo numero e nao duas tradicoes. Numa constante
#: nomeada o caracter invisivel e' pelo menos um caracter invisivel, e `grep GS`
#: encontra-o.
GS = "\x1d"

#: O codeword de inicio do conjunto B, que e' o unico que o GS1-128 usa.
INICIO_B = CODE128_INICIO["B"]


def gs1_128(elemento_string: str) -> dict:
    """
    O codigo de barras GS1-128.

    :param elemento_string: o texto com os AIs entre parenteses, na forma de leitura
        humana da GS1: ``(01)04012345678901(10)LOTE-A1``. Os parenteses **nao** vao
        para dentro do codigo de barras - fazem parte da notacao humana e o leitor
        nao os ve. **Os digitos do AI vao**, ao contrario dos parenteses.

    :returns: ``modulos``, ``campos``, ``gs1``, ``separadores``, ``legenda``,
        ``payload`` e ``maquina``.

    ## O numero do AI vai no codigo de barras

    A primeira versao emitia so ``campo.valor`` e o AI ficava de fora, por causa de
    uma confusao entre a forma humana e a de maquina: em ``(10)LOTE-A1`` os
    parenteses sao para quem le e nao vao para o codigo - mas os **digitos do AI
    vao**. O resultado era 17 codewords em vez de 20, o ZXing nao lia nada, e a
    razao nao era visivel no codigo: um GS1-128 sem os AIs e' a mesma coisa que
    uma etiqueta sem dizer o que e' que ela e'.
    """
    campos = analisar(elemento_string)

    # A forma de maquina: os campos concatenados, com o FNC1 onde a GS1 o quer.
    #
    # O FNC1 do inicio vai **depois** do caracter de inicio do conjunto B - e' o
    # primeiro codeword de dados, nao parte do cabecalho. Po-lo antes produz um
    # codigo que o ZXing le como `]C0`, ou seja, como Code 128 normal, e o
    # utilizador nunca ve a diferenca - so o leitor de um sistema GS1.
    valores = [INICIO_B, FNC1]

    ultimo = len(campos) - 1
    for i, campo in enumerate(campos):
        # **O `resto` entra antes do conteudo, e nao depois**: num `3103` o digito da
        # posicao decimal implicita faz parte do valor, nao do AI.
        for caractere in campo["ai"] + campo["valor"]:
            valores.append(_valor_no_conjunto_b(caractere, campo["ai"]))

        # O separador vai no fim de cada campo variavel **excepto o ultimo**.
        #
        # **Um separador no fim nao separa de nada**, e o leitor accounta-o como
        # parte do campo seguinte. A primeira versao metia um em todos os campos
        # variaveis, e o `descodificar` falhava em seis de oito casos: o ZXing
        # devolvia o mesmo codigo com um `0x1D` a mais e o codigo continuava a ler
        # bem - a falha era so na comparacao, e sem ela nao se via.
        if campo["separador"] and i != ultimo:
            valores.append(FNC1)

    # O caracter de verificacao: o valor de inicio com peso 1, cada valor de dados
    # multiplicado pela sua posicao - a primeira a valer 1 - e o resultado modulo
    # 103.
    #
    # **Nao e' uma soma simples.** A primeira versao fazia a soma de todos os valores
    # sem pesos, e produzia um caracter de verificacao diferente do certo. O
    # resultado: 222 modulos em vez dos 200 que a conta pedia, o ZXing a recusar
    # **sem dizer por que**, e nenhuma diferenca visivel no desenho. O numero de
    # modulos foi o que denunciou - a conta do Code 128 da propria norma dao 11 por
    # codeword, e 222 nao e' multiplo de 11 mais a paragem.
    #
    # O FNC1 entra na conta com o valor 102 e com o peso da sua posicao, como
    # qualquer outro codeword - e e' por isso que ele tem de estar na lista **antes**
    # de se calcular a soma, e nao a ser acrescentado a parte.
    soma = valores[0]
    for i in range(1, len(valores)):
        soma += valores[i] * i
    verificacao = soma % 103

    todos = [*valores, verificacao, CODE128_PARAGEM_VALOR]

    modulos: list[bool] = []
    for valor in todos:
        modulos.extend(_modulos_do_padrao(valor))

    return {
        "simbologia": "GS1-128",
        "modulos": modulos,
        "campos": campos,
        "valores": todos,
        "verificacao": verificacao,
        #: A forma legivel com separadores, que e' o `gs1`.
        "gs1": _legivel(campos),
        "separadores": sum(1 for v in valores if v == FNC1),
        # A legenda, que no GS1-128 e' a forma humana **com os parenteses** - e nao a
        # forma com separadores, porque o `(` e' o que se imprime e o GS e' o que
        # separa. A GS1 pede que a linha impressa tenha os AIs entre parenteses, e
        # nao e' opcional: e' o que permite a uma pessoa ler o codigo sem scanner.
        "legenda": _legivel(campos),
        #: O Code 128 nao tem barras-guarda, e o GS1-128 tambem nao.
        "guardas": [],
        # A forma de maquina: os campos sem parenteses, com o separador **onde o
        # encoder o pos** - isto e', depois de um campo de comprimento variavel que
        # nao seja o ultimo.
        "payload": _maquina(campos),
        # A forma de maquina sem separador nenhum: e' o texto que o utilizador pode
        # confirmar antes de imprimir. **Nao e' o que vai no codigo de barras** - isso
        # e' a lista de `valores` de cima.
        "maquina": "".join(c["ai"] + c["valor"] for c in campos),
    }


def _valor_no_conjunto_b(caractere: str, ai: str) -> int:
    """
    O valor Code 128 de um caracter no conjunto B.

    No conjunto B o valor e' o ASCII menos 32, para 0 a 95. Os caracteres que nao
    cabem no GS1-128 - os acentos, por exemplo - sao recusados aqui e nao no
    desenho, porque o erro e' do dado e nao do codigo.
    """
    codigo = ord(caractere)

    if codigo < 32 or codigo > 127:
        raise SimbologiaError(
            f'GS1-128: o AI ({ai}) tem o caractere "{caractere}" (U+{codigo:04X}), '
            "e o conjunto B so transporta ASCII. O GS1-128 nao tem acento."
        )

    # 128 e' o valor de paragem e nao pode estar nos dados - dava um codigo que se
    # desenhava e nao se lia.
    if codigo == 128:
        raise SimbologiaError(f"GS1-128: o AI ({ai}) tem um caracter de paragem nos dados")

    return codigo - 32


def analisar(texto: str) -> list[dict]:
    """
    Separa o texto nos campos, e valida cada um contra a tabela de AIs.

    E' aqui que a tabela de 541 AIs paga. Sem ela o encoder teria de adivinhar o
    comprimento de cada campo, e adivinhar mal significa que o campo seguinte e' lido
    a partir do meio do anterior - o que o leitor acusa como campo invalido e nao
    como tabela errada.

    A forma humana da GS1 nao tem separadores: os campos estao separados por
    parenteses. O FNC1 so existe na forma de maquina, e e' o encoder que o poe.

    :returns: a lista de campos, cada um com ``ai``, ``valor``, ``conteudo`` e
        ``separador``.

    **O `resto` que o `ai_de` devolve entra no valor.** Num `3103`, o digito da
    posicao decimal implicita e' o ultimo do AI e faz parte do valor - o que o
    distingue do `310n`, em que `n` e' a posicao e o resto e' o valor.
    """
    campos: list[dict] = []
    i = 0

    while i < len(texto):
        if texto[i] != "(":
            raise SimbologiaError(
                f'GS1-128: esperava um "(" na posicao {i} de "{texto}". A forma de '
                "leitura humana e' (01)04012345678901(10)LOTE-A1, com os AIs entre "
                "parenteses."
            )

        # O AI tem dois, tres ou quatro digitos, e **nao se pode saber qual pelo
        # primeiro digito**: `3103` e' um AI de quatro, e `31` seria um de dois com a
        # posicao decimal implicita no ultimo digito. Le-se o numero todo e a tabela
        # diz onde acaba.
        fecho = texto.find(")", i)
        if fecho < 0:
            raise SimbologiaError(f'GS1-128: o "(" na posicao {i} de "{texto}" nao fecha.')

        numero = texto[i + 1 : fecho]
        if not re.fullmatch(r"\d+", numero):
            raise SimbologiaError(f'GS1-128: o AI "{numero}" nao e\' so digitos.')

        encontrado = ai_de(numero)
        if encontrado is None:
            raise SimbologiaError(
                f"GS1-128: o AI ({numero}) nao existe. A tabela tem {len(AIS)} AIs."
            )

        # O valor comeca logo a seguir ao `)`, e e' o comprimento que decide ate onde
        # vai. E' a razao de a tabela trazer `fixo` e `maximo`.
        inicio_valor = fecho + 1
        if encontrado["fixo"] is not None:
            # Comprimento fixo: o campo tem `fixo` caracteres, ponto final. Sem FNC1.
            fim = inicio_valor + encontrado["fixo"]
            conteudo = texto[inicio_valor:fim]
        else:
            # Comprimento variavel: vai ate ao fim do texto ou ate ao proximo `(`.
            #
            # **O `(` e' que marca o fim, e nao um FNC1 na forma humana.** A primeira
            # versao procurava um separador na forma humana, que nao existe, e cortava
            # o valor no sitio errado.
            proximo = texto.find("(", inicio_valor)
            fim = proximo if proximo >= 0 else len(texto)
            conteudo = texto[inicio_valor:fim]

        limpo = validar(encontrado, conteudo)

        campos.append(
            {
                "ai": encontrado["numero"],
                "valor": (encontrado.get("resto") or "") + limpo,
                # O valor so, sem o resto do AI implicito.
                "conteudo": limpo,
                "separador": encontrado["separador"],
            }
        )

        i = fim

    if not campos:
        raise SimbologiaError(
            "GS1-128: o texto nao tem nenhum campo. Escreve (01)04012345678901."
        )

    return campos


def comprimento_total(ai: dict) -> int | None:
    """
    O comprimento maximo do valor de um AI, e nao o do ultimo componente.

    **A tabela so traz o do ultimo componente, e os dois numeros sao diferentes.**
    E' o que serve para **dividir** o valor - o ultimo componente e' o que vai ate
    ao fim do texto - e nao para o **conferir**: um AI de varios componentes tem um
    valor que e' a soma deles.

    | AI | formato | ultimo | total |
    |---|---|---|---|
    | `253` | `N3+N13[+X..17]` | 17 | **30** |
    | `421` | `N3+N3+X..9` | 9 | **12** |
    | `8008` | `N4+N8[+N..4]` | 4 | **12** |

    **Sao 47 dos 541 AIs que tem mais de um componente**, e todos eles recusavam um
    valor que a GS1 aceita. O sintoma e' o pior dos possiveis: o utilizador escreve
    o valor certo e o encoder recusa, com uma mensagem que fala de um comprimento
    que nao e' o do campo - porque o numero na mensagem e' o do ultimo componente.

    **Um componente fixo no meio de um variavel conta para a soma**, que e' o que
    faz o `253` chegar a trinta e nao a dezassete. E se nenhum componente for
    variavel o AI e' fixo, e aqui devolve `None` - que e' o que a tabela diz com o
    `maximo` a vazio.
    """
    soma = 0
    tem_variavel = False

    for campo in ai["campos"]:
        if campo["fixo"] is not None:
            soma += campo["fixo"]
        if campo["maximo"] is not None:
            soma += campo["maximo"]
            tem_variavel = True

    return soma if tem_variavel else None


def validar(ai: dict, valor: str) -> str:
    """
    Confere o valor de um campo contra o que a GS1 diz dele.

    A expressao regular vem da propria GS1, e da tabela. E' mais forte do que contar
    caracteres: ``(\\d{2}(?:0\\d|1[0-2])(?:[0-2]\\d|3[01]))`` para uma data recusa
    ``275630`` - mes 56 - e o leitor do GS1 recusa tambem.

    **O `strip` e' o que torna a forma humana legivel.** A GS1 escreve os campos com
    um espaco de cada lado nos exemplos - ``(10) LOTE-A1`` - e o espaco nao faz parte
    do valor. A forma de maquina nao leva o espaco, e o codigo de barras tem de ter o
    valor e nao o valor mais os espacos de leitura.

    Um `strip` sem isto parece um detalhe, e e' a diferenca entre aceitar e recusar
    metade dos exemplos que a propria GS1 escreve.

    **O `regex` e' ancorado, e ancorar e' o que impede que um valor mais longo passe.**
    Sem ``^`` e ``$`` um regex nao ancorado aceita o valor se *contiver* um match, e
    ``(17)270630`` com um digito a mais leria-se bem - que e' o tipo de erro que so o
    leitor acusa.

    ## O comprimento e' conferido antes do `regex`, e com numeros na mensagem

    **Uma recusa sem numeros e' uma recusa com que ninguem consegue corrigir o
    campo.** O ``(01)9501101530003`` tem treze digitos e o AI 01 quer catorze: a
    mensagem tem de dizer as duas coisas, e nao "nao corresponde ao que a GS1
    define", que e' o que a primeira versao dizia e nao ajuda ninguem.

    **E o comprimento primeiro, e nao o `regex`.** Um AI cujo `regex` aceite
    variacos - ``[N..90]`` em vez de ``N90`` - deixaria passar um valor de trinta e
    dois caracteres, e o leitor do GS1 recusa-o. A tabela sabe o maximo e a
    validação usa o saber; o `regex` e' a segunda linha, para o que o comprimento
    nao apanha, que e' o mes 56.

    **O maximo e' a soma dos componentes, e nao o do ultimo** - ver
    :func:`comprimento_total`, que explica porque sao dois numeros e porque os
    47 AIs com varios componentes recusavam um valor valido.
    """
    limpo = valor.strip()

    if not limpo:
        raise SimbologiaError(f"GS1-128: o AI ({ai['numero']}) nao tem valor.")

    # O comprimento primeiro, e com os dois numeros na mensagem.
    if ai["fixo"] is not None and len(limpo) != ai["fixo"]:
        unidade = "digito" if ai["fixo"] == 1 else "digitos"
        raise SimbologiaError(
            f"GS1-128: o AI ({ai['numero']}) tem {ai['fixo']} {unidade} fixos e o "
            f'valor "{limpo}" tem {len(limpo)}.'
        )

    maximo = comprimento_total(ai)
    if maximo is not None and len(limpo) > maximo:
        raise SimbologiaError(
            f"GS1-128: o AI ({ai['numero']}) aceita no maximo {maximo} "
            f'caracteres e o valor "{limpo}" tem {len(limpo)}.'
        )

    if not re.fullmatch(ai["regex"], limpo):
        raise SimbologiaError(
            f'GS1-128: o valor "{limpo}" do AI ({ai["numero"]}) nao corresponde ao que '
            f"a GS1 define. O formato e' {ai['formato']}."
        )

    return limpo


def _maquina(campos: list[dict]) -> str:
    """
    A forma de maquina: os campos sem parenteses, com o separador no sitio certo.

    O separador vai **depois** de um campo de comprimento variavel, e so se esse campo
    nao for o ultimo. E' a regra da GS1 e e' a mesma que o :func:`gs1_128` usa ao
    montar os codewords - **as duas tem de concordar**, e e' por isso que a lista se
    percorre com o mesmo criterio nas duas.

    A primeira versao desta funcao nao existia: o `payload` era a concatenacao sem
    nada, e o gerador de testes fazia a sua versao - juntando um separador entre todos
    os campos. O ZXing devolvia o mesmo codigo com menos um `0x1D` nos bytes e o
    teste falhava, e a razao era essa: um separador a mais num campo que nao precisa
    dele.
    """
    ultimo = len(campos) - 1
    partes = []
    for i, campo in enumerate(campos):
        separador = GS if campo["separador"] and i != ultimo else ""
        partes.append(campo["ai"] + campo["valor"] + separador)
    return "".join(partes)


def _legivel(campos: list[dict]) -> str:
    """
    A forma humana: os AIs entre parenteses, **sem** separador nenhum.

    A primeira versao punha aqui um ``join(GS)``, e foi o separador a mais que fez
    o `descodificar` falhar em seis dos oito casos. A forma humana da GS1 nao tem
    separadores: e' ``(01)04012345678901(10)LOTE-A1``, e e' o ``(`` que marca o fim
    do campo. E' exactamente o que o ZXing devolve em `text`.

    **O separador so existe na forma de maquina**, e quem o poe e' o :func:`gs1_128`,
    no codeword. A :func:`_maquina` acima e' a forma com separadores, e sao as duas
    metades da mesma coisa: uma para quem le e uma para o codigo de barras.
    """
    return "".join(f"({c['ai']}){c['valor']}" for c in campos)


#: O registo, pelo id que o selector usa.
#:
#: **A chave e' a mesma nos sete clientes**, e e' o que a `AGENTS.md` chama de lista
#: escrita duas vezes: o selector de formatos vive no cliente e o registo vive no
#: modulo, e nada os ligava. Da' o GS1-128 ter entrado com o encoder, a validacao, a
#: altura e os casos lidos pelo ZXing, e nao aparecer no selector.
SIMBOLOGIAS_GS1 = {
    "gs1-128": gs1_128,
}